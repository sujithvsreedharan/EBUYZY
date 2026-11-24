import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CartService } from '../../../core/services/cart.service';
import { AdminOrderService } from '../../../core/services/admin-order.service';
import { SettingsService } from '../../../core/services/settings.service';
import { AuthService } from '../../../core/services/auth.service';
import { DeliveryAreaService } from '../../../core/services/delivery-area.service';
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
  readonly locationDetected = signal<{ lat: number; lng: number } | null>(null);
  readonly locationError = signal<string | null>(null);
  readonly isSubmitting = signal<boolean>(false);
  readonly orderSuccessMessage = signal<string | null>(null);

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
                this.locationDetected.set({ lat: parseFloat(latLngMatch[1]), lng: parseFloat(latLngMatch[2]) });
              }
            }
          } else if (profile) {
            this.checkoutForm.patchValue({
              name: profile.name || this.checkoutForm.get('name')?.value || '',
              phone: profile.mobile || profile.phone || this.checkoutForm.get('phone')?.value || ''
            });
          }
        }
      },
      error: (err) => console.warn('Could not fetch saved address from backend:', err)
    });
  }

  detectLocation(): void {
    if (!('geolocation' in navigator)) {
      this.locationError.set('Geolocation is not supported by your browser.');
      return;
    }

    this.isLocating.set(true);
    this.locationError.set(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.isLocating.set(false);
        const coords = {
          lat: Number(pos.coords.latitude.toFixed(4)),
          lng: Number(pos.coords.longitude.toFixed(4))
        };
        this.locationDetected.set(coords);
        this.checkoutForm.patchValue({
          gpsLocation: `${coords.lat}° N, ${coords.lng}° E`
        });
        this.checkoutForm.get('gpsLocation')?.markAsTouched();
        this.checkoutForm.get('gpsLocation')?.updateValueAndValidity();
      },
      () => {
        this.isLocating.set(false);
        this.locationError.set('Could not fetch GPS location. Please allow browser location access or type your location manually.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  placeOrder(): void {
    if (this.checkoutForm.invalid) {
      this.checkoutForm.markAllAsTouched();
      return;
    }

    if (!this.cartService.meetsMinOrder()) {
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
          note: formVal.notes || undefined
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
