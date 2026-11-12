import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CartService } from '../../../core/services/cart.service';
import { AdminOrderService } from '../../../core/services/admin-order.service';
import { SettingsService } from '../../../core/services/settings.service';
import { AuthService } from '../../../core/services/auth.service';
import { DeliveryAreaService } from '../../../core/services/delivery-area.service';
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
  private readonly router = inject(Router);

  readonly settings = toSignal(this.settingsService.getSettings());

  readonly isLocating = signal<boolean>(false);
  readonly locationDetected = signal<{ lat: number; lng: number } | null>(null);
  readonly locationError = signal<string | null>(null);
  readonly isSubmitting = signal<boolean>(false);

  readonly checkoutForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
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
    const loc = this.deliveryService.selectedLocation();
    let initialAddress = user?.address || '';
    if (!initialAddress && loc?.verified && loc.isDeliverable) {
      initialAddress = `${loc.locality}, Kakkanad - ${loc.pincode}`;
    }

    if (user) {
      this.checkoutForm.patchValue({
        name: user.name,
        phone: user.phone || '',
        address: initialAddress
      });
    }
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
      },
      () => {
        this.isLocating.set(false);
        this.locationError.set('Could not fetch GPS location. Please enter your address manually.');
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
          this.cartService.clearCart();
          this.router.navigate(['/order-success', created.id]);
        },
        error: () => {
          this.isSubmitting.set(false);
        }
      });
  }
}
