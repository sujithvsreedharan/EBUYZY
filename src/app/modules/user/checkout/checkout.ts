import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CartService } from '../../../core/services/cart.service';
import { AdminOrderService } from '../../../core/services/admin-order.service';
import { SettingsService } from '../../../core/services/settings.service';
import { AuthService } from '../../../core/services/auth.service';
import { DeliveryAreaService, DeliveryAvailableResponse } from '../../../core/services/delivery-area.service';
import { NotificationService } from '../../../core/services/notification.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, DecimalPipe],
  templateUrl: './checkout.html',
  styleUrl: './checkout.css',
})
export class Checkout implements OnInit {
  private readonly fb = inject(FormBuilder);
  protected readonly cartService = inject(CartService);
  private readonly orderService = inject(AdminOrderService);
  private readonly settingsService = inject(SettingsService);
  protected readonly authService = inject(AuthService);
  protected readonly deliveryService = inject(DeliveryAreaService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  readonly settings = toSignal(this.settingsService.getSettings());

  readonly isLocating = signal<boolean>(false);
  readonly isCheckingDelivery = signal<boolean>(false);
  readonly locationDetected = signal<{ lat: number; lng: number } | null>(null);
  readonly locationError = signal<string | null>(null);
  readonly deliveryCheckResult = signal<DeliveryAvailableResponse | null>(null);
  readonly showGpsPrompt = signal<boolean>(false);
  readonly gpsPromptType = signal<'disabled' | 'denied' | 'insecure' | 'timeout' | null>(null);
  readonly gpsPromptMessage = signal<string>('');
  readonly isSubmitting = signal<boolean>(false);
  readonly orderSuccessMessage = signal<string | null>(null);

  readonly hasVerifiedStoreLocation = computed(() => {
    const loc = this.deliveryService.selectedLocation();
    return loc?.latitude != null && loc?.longitude != null;
  });

  readonly gpsPromptTitle = computed(() => {
    switch (this.gpsPromptType()) {
      case 'disabled':
        return 'Device Location / GPS is Turned Off';
      case 'denied':
        return 'Location Permission Required';
      case 'insecure':
        return 'Mobile Network Location Notice';
      case 'timeout':
        return 'Location Request Timed Out';
      default:
        return 'GPS Location Issue';
    }
  });

  readonly checkoutForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
    gpsLocation: ['', [Validators.required, Validators.minLength(3)]],
    address: ['', [Validators.required, Validators.minLength(6)]],
    landmark: [''],
    notes: [''],
    paymentMethod: ['Cash on Delivery', [Validators.required]]
  });

  ngOnInit(): void {
    // 1. Enforce Authentication: checkout is restricted to logged-in users
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/']);
      this.authService.openAuthModal(
        'signin',
        'Please sign in or create an account to proceed with checkout.',
        '/checkout'
      );
      return;
    }

    // 2. If cart is empty, redirect to home
    if (this.cartService.items().length === 0) {
      this.router.navigate(['/']);
      return;
    }

    // 3. Pre-fill user data if signed in
    const user = this.authService.currentUser();
    if (user) {
      this.checkoutForm.patchValue({
        name: user.name || '',
        phone: user.phone || '',
        address: '',
        gpsLocation: ''
      });
    }

    // 4. Fetch real saved address & GPS from backend database
    this.authService.getUserProfileApi().subscribe({
      next: (res) => {
        if (res.success) {
          const profile = res.profile || res.user;
          const addresses = res.addresses || [];
          const defaultAddr = addresses.find((a: any) => a.isDefault) || addresses[0];

          if (defaultAddr) {
            const savedName = defaultAddr.recipient || defaultAddr.fullName || profile?.name;
            const savedPhone = defaultAddr.mobile || profile?.mobile || profile?.phone;
            let savedAddress = defaultAddr.main_address || defaultAddr.addressLine1 || defaultAddr.address || '';
            let savedGps = defaultAddr.address2 || defaultAddr.addressLine2 || '';

            // If GPS is inside savedAddress string e.g. "Flat 2, Infopark [GPS: 9.99° N, 76.35° E]"
            if (!savedGps && savedAddress.includes('[GPS:')) {
              const match = savedAddress.match(/\[GPS:\s*([^\]]+)\]/i);
              if (match) {
                savedGps = match[1].trim();
                savedAddress = savedAddress.replace(/\[GPS:\s*[^\]]+\]/i, '').trim();
              }
            }

            // If landmark has GPS coordinates
            if (!savedGps && defaultAddr.landmark && (defaultAddr.landmark.includes('°') || defaultAddr.landmark.includes('GPS:'))) {
              savedGps = defaultAddr.landmark.replace(/^GPS:\s*/i, '').trim();
            }

            this.checkoutForm.patchValue({
              name: savedName || this.checkoutForm.get('name')?.value || '',
              phone: savedPhone || this.checkoutForm.get('phone')?.value || '',
              address: savedAddress,
              gpsLocation: savedGps,
              landmark: defaultAddr.landmark && !defaultAddr.landmark.includes('°') && !defaultAddr.landmark.includes('GPS:') ? defaultAddr.landmark : ''
            });

            if (savedGps) {
              const latLngMatch = savedGps.match(/([0-9.]+)[°\s]*[NS][,\s]+([0-9.]+)[°\s]*[EW]/i);
              if (latLngMatch) {
                const lat = parseFloat(latLngMatch[1]);
                const lng = parseFloat(latLngMatch[2]);
                this.locationDetected.set({ lat, lng });
                this.checkDeliveryArea(lat, lng);
              }
            }
          } else if (profile) {
            this.checkoutForm.patchValue({
              name: profile.name || this.checkoutForm.get('name')?.value || '',
              phone: profile.mobile || profile.phone || this.checkoutForm.get('phone')?.value || ''
            });
          }

          // 5. If GPS is still empty, check if verified location exists from delivery area check
          if (!this.checkoutForm.get('gpsLocation')?.value) {
            const verifiedLoc = this.deliveryService.selectedLocation();
            if (verifiedLoc && verifiedLoc.latitude != null && verifiedLoc.longitude != null) {
              const lat = Number(verifiedLoc.latitude.toFixed(5));
              const lng = Number(verifiedLoc.longitude.toFixed(5));
              if (!this.locationDetected()) {
                this.locationDetected.set({ lat, lng });
                this.checkDeliveryArea(lat, lng);
              }
              this.checkoutForm.patchValue({
                gpsLocation: `${lat}° N, ${lng}° E`
              });
            }
          }
        }
      },
      error: (err) => {
        console.warn('Could not fetch saved address from backend:', err);
        // Fallback to verified delivery location if available
        const verifiedLoc = this.deliveryService.selectedLocation();
        if (verifiedLoc && verifiedLoc.latitude != null && verifiedLoc.longitude != null && !this.checkoutForm.get('gpsLocation')?.value) {
          const lat = Number(verifiedLoc.latitude.toFixed(5));
          const lng = Number(verifiedLoc.longitude.toFixed(5));
          this.locationDetected.set({ lat, lng });
          this.checkDeliveryArea(lat, lng);
          this.checkoutForm.patchValue({
            gpsLocation: `${lat}° N, ${lng}° E`
          });
        }
      }
    });
  }

  /**
   * Detects location via device GPS.
   * If GPS is disabled on the phone or permission denied, asks user to enable it
   * with clear instructions and retry / network fallback options.
   */
  detectLocation(): void {
    this.locationError.set(null);
    this.showGpsPrompt.set(false);
    this.gpsPromptType.set(null);
    this.deliveryCheckResult.set(null);

    // 1. Check if browser has geolocation API
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.promptGpsIssue('disabled', 'Geolocation is not supported by your browser. Please enter coordinates manually.');
      return;
    }

    this.isLocating.set(true);

    // 2. Request current position with High Accuracy & Fresh reading (maximumAge: 0)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        this.applyCoordinates(latitude, longitude);
      },
      (error) => {
        console.warn('High accuracy GPS error, trying fallback:', error.code, error.message);

        // If high accuracy times out (e.g. indoors), try with standard accuracy once without cached data
        if (error.code === error.TIMEOUT) {
          navigator.geolocation.getCurrentPosition(
            (fallbackPos) => {
              this.applyCoordinates(fallbackPos.coords.latitude, fallbackPos.coords.longitude);
            },
            (fallbackError) => {
              this.handleGpsFailure(fallbackError);
            },
            { timeout: 8000, enableHighAccuracy: false, maximumAge: 0 }
          );
          return;
        }

        this.handleGpsFailure(error);
      },
      { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 }
    );
  }

  private handleGpsFailure(error: GeolocationPositionError): void {
    this.isLocating.set(false);

    if (error.code === error.PERMISSION_DENIED) {
      this.promptGpsIssue(
        'denied',
        'Location permission was denied. Please allow location access in your browser (tap the lock icon 🔒 beside the URL bar), or type/paste your GPS coordinates below.'
      );
    } else if (error.code === error.POSITION_UNAVAILABLE) {
      this.promptGpsIssue(
        'disabled',
        'Device Location / GPS is turned OFF. Please swipe down quick settings, turn ON "Location", and tap "Try Again", or enter coordinates manually.'
      );
    } else if (error.code === error.TIMEOUT) {
      this.promptGpsIssue(
        'timeout',
        'GPS location request timed out. Please ensure Location is enabled with clear signal, or paste your coordinates manually.'
      );
    } else {
      this.promptGpsIssue(
        'disabled',
        'Could not retrieve live GPS coordinates. Please ensure Location is turned on or enter your coordinates below.'
      );
    }
  }

  /**
   * Parses manual coordinate input (e.g. "11.30038, 76.00072") and checks delivery
   */
  onGpsInputChange(value: string): void {
    if (!value || !value.trim()) {
      this.locationDetected.set(null);
      this.deliveryCheckResult.set(null);
      return;
    }

    // Match formats like "11.30038, 76.00072", "11.30038° N, 76.00072° E", "11.300380 76.000728"
    const match = value.match(/(-?\d+\.?\d*)[°\s]*[NS]?[,\s]+(-?\d+\.?\d*)[°\s]*[EW]?/i);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        this.locationDetected.set({ lat, lng });
        this.checkDeliveryArea(lat, lng);
      }
    }
  }

  /**
   * Applies detected or selected coordinates to the checkout form and state
   */
  applyCoordinates(latitude: number, longitude: number): void {
    this.isLocating.set(false);
    this.showGpsPrompt.set(false);
    this.locationError.set(null);

    const lat = Number(latitude.toFixed(6));
    const lng = Number(longitude.toFixed(6));
    this.locationDetected.set({ lat, lng });

    const formattedGps = `${lat}° N, ${lng}° E`;
    this.checkoutForm.patchValue({
      gpsLocation: formattedGps
    });
    this.checkoutForm.get('gpsLocation')?.markAsTouched();
    this.checkoutForm.get('gpsLocation')?.updateValueAndValidity();

    // Sync with delivery area service if available
    if (this.deliveryService.selectedLocation()) {
      const current = this.deliveryService.selectedLocation()!;
      this.deliveryService.confirmLocation({
        ...current,
        latitude: lat,
        longitude: lng
      });
    }

    // Verify delivery area availability via POST /api/delivery/available
    this.checkDeliveryArea(lat, lng);
  }

  /**
   * Checks whether the coordinates are within store delivery coverage
   */
  checkDeliveryArea(latitude: number, longitude: number): void {
    this.isCheckingDelivery.set(true);

    this.deliveryService.checkDeliveryAvailable(latitude, longitude).subscribe({
      next: (res) => {
        this.isCheckingDelivery.set(false);
        this.deliveryCheckResult.set(res);
      },
      error: (err) => {
        this.isCheckingDelivery.set(false);
        this.deliveryCheckResult.set({
          success: false,
          isDeliverable: false,
          message: err?.error?.message || 'Could not verify delivery area. Please check your network and try again.'
        });
      }
    });
  }

  /**
   * Fallback: fetches network IP coordinates when GPS is disabled or blocked on mobile HTTP
   */
  useNetworkLocation(silent = false): void {
    if (!silent) {
      this.isLocating.set(true);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    fetch('https://ipwho.is/', { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Network IP location failed');
        return res.json();
      })
      .then((data) => {
        if (data && data.success && data.latitude != null && data.longitude != null) {
          this.applyCoordinates(Number(data.latitude), Number(data.longitude));
        } else {
          throw new Error('Invalid IP payload');
        }
      })
      .catch(() => {
        this.isLocating.set(false);
        if (!silent) {
          this.locationError.set('Could not detect location via network. Please turn on phone GPS or enter address.');
        }
      });
  }

  /**
   * Use verified location from previous store check
   */
  useSavedVerifiedLocation(): void {
    const loc = this.deliveryService.selectedLocation();
    if (loc && loc.latitude != null && loc.longitude != null) {
      this.applyCoordinates(loc.latitude, loc.longitude);
    }
  }

  dismissGpsPrompt(): void {
    this.showGpsPrompt.set(false);
  }

  private promptGpsIssue(type: 'disabled' | 'denied' | 'insecure' | 'timeout', message: string): void {
    this.isLocating.set(false);
    this.gpsPromptType.set(type);
    this.gpsPromptMessage.set(message);
    this.showGpsPrompt.set(true);
    this.locationError.set(message);
  }

  placeOrder(): void {
    if (this.checkoutForm.invalid) {
      this.checkoutForm.markAllAsTouched();
      return;
    }

    if (!this.cartService.meetsMinOrder()) {
      return;
    }

    if (this.deliveryCheckResult() && !this.deliveryCheckResult()?.isDeliverable) {
      alert(this.deliveryCheckResult()?.message || 'Sorry, delivery is not available at your location.');
      return;
    }

    this.isSubmitting.set(true);
    const formVal = this.checkoutForm.getRawValue();
    let fullAddress = formVal.address;
    if (formVal.landmark) {
      fullAddress += ` (Landmark: ${formVal.landmark})`;
    }
    const gpsInfo = formVal.gpsLocation || (this.locationDetected() ? `${this.locationDetected()?.lat}° N, ${this.locationDetected()?.lng}° E` : '');
    if (gpsInfo) {
      fullAddress += ` [GPS: ${gpsInfo}]`;
    }

    // If authenticated, place real order via backend POST /api/orders/place
    if (this.authService.currentUser()?.id || this.authService.getToken()) {
      let latVal: number | string | null = this.locationDetected()?.lat ?? null;
      let lngVal: number | string | null = this.locationDetected()?.lng ?? null;
      if ((latVal == null || lngVal == null) && formVal.gpsLocation) {
        const match = formVal.gpsLocation.match(/([0-9.]+)[°\s]*[NS]?[,\s]+([0-9.]+)[°\s]*[EW]?/i);
        if (match) {
          latVal = match[1];
          lngVal = match[2];
        }
      }

      // Save address & GPS to backend database so it's remembered for future orders
      this.authService
        .saveAddressApi({
          address: formVal.address,
          gps: formVal.gpsLocation,
          locality: formVal.landmark || formVal.gpsLocation,
          name: formVal.name,
          phone: formVal.phone
        })
        .subscribe({
          error: (err) => console.warn('Could not save address to user profile:', err)
        });

      this.orderService
        .placeOrderApi({
          customerName: formVal.name,
          customerMobile: formVal.phone,
          deliveryAddress: fullAddress,
          note: formVal.notes || undefined,
          latitude: latVal,
          longitude: lngVal,
          lattitude: latVal,
          logitude: lngVal
        })
        .subscribe({
          next: (res) => {
            this.isSubmitting.set(false);
            if (res.success && res.order) {
              const orderRef = res.order.orderCode || String(res.order.orderId);
              this.orderSuccessMessage.set(`Order #${orderRef} placed successfully!`);

              this.notificationService.addNotification({
                title: `Order #${orderRef} Placed Successfully!`,
                message: `Your grocery order #${orderRef} is placed and will be delivered within 30-45 minutes.`,
                type: 'order',
                link: '/profile'
              });

              // Sync placed order into client order service so details load immediately
              const mapped = this.orderService.mapBackendAdminOrder({
                ...res.order,
                items: res.items || []
              });
              this.orderService.addPlacedOrder(mapped);

              this.cartService.clearCart();
              setTimeout(() => {
                this.router.navigate(['/order-success', orderRef]);
              }, 1200);
            } else {
              alert(res.message || 'Failed to place order.');
            }
          },
          error: (err) => {
            this.isSubmitting.set(false);
            alert(err?.error?.message || 'Failed to place order. Please try again.');
          }
        });
      return;
    }

    const orderNumber = `EZ-2026-${Date.now().toString().slice(-4)}`;

    const items = this.cartService.items().map((i) => ({
      productId: i.product.id,
      productName: i.product.name,
      unit: i.product.unit,
      unitPrice: i.product.price,
      quantity: i.quantity,
      total: i.product.price * i.quantity
    }));

    this.orderService
      .createOrder({
        orderNumber,
        customer: {
          name: formVal.name,
          phone: formVal.phone,
          address: formVal.address,
          landmark: formVal.landmark || undefined,
          coordinates: this.locationDetected() || undefined
        },
        items,
        subtotal: this.cartService.subtotal(),
        deliveryFee: this.cartService.deliveryFee(),
        discount: this.cartService.discount(),
        couponCode: this.cartService.appliedCoupon()?.code,
        total: this.cartService.grandTotal(),
        status: 'New',
        notes: formVal.notes || undefined
      })
      .subscribe({
        next: (created) => {
          this.isSubmitting.set(false);
          this.orderSuccessMessage.set(`Order #${created.orderNumber} placed successfully!`);
          this.notificationService.addNotification({
            title: `Order #${created.orderNumber} Placed Successfully!`,
            message: `Your grocery order #${created.orderNumber} is placed and will be delivered within 30-45 minutes.`,
            type: 'order',
            link: '/profile'
          });
          this.cartService.clearCart();
          setTimeout(() => {
            this.router.navigate(['/order-success', created.id]);
          }, 1200);
        },
        error: () => {
          this.isSubmitting.set(false);
        }
      });
  }
}
