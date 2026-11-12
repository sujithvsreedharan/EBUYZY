import { Injectable, computed, inject, signal } from '@angular/core';
import { Product } from '../models/product.model';
import { SettingsService } from './settings.service';
import { toSignal } from '@angular/core/rxjs-interop';

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface PromoCoupon {
  code: string;
  title: string;
  description: string;
  discountType: 'fixed' | 'percent' | 'free_delivery';
  discountValue: number;
  minOrder: number;
}

export const AVAILABLE_COUPONS: PromoCoupon[] = [
  {
    code: 'KERALA50',
    title: '₹50 Flat Discount',
    description: 'Flat ₹50 OFF on Kerala grocery orders above ₹250',
    discountType: 'fixed',
    discountValue: 50,
    minOrder: 250
  },
  {
    code: 'FREEDEL',
    title: 'Free Delivery',
    description: '100% Free delivery across Kakkanad 3-5 km express zone',
    discountType: 'free_delivery',
    discountValue: 25,
    minOrder: 150
  },
  {
    code: 'FIRSTORDER',
    title: 'Welcome ₹40 OFF',
    description: 'Special introductory ₹40 discount on orders above ₹200',
    discountType: 'fixed',
    discountValue: 40,
    minOrder: 200
  },
  {
    code: 'ONAM2026',
    title: '10% Harvest OFF',
    description: '10% savings on farm-fresh vegetables and Kerala staples',
    discountType: 'percent',
    discountValue: 10,
    minOrder: 300
  }
];

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private readonly settingsService = inject(SettingsService);
  private readonly settings = toSignal(this.settingsService.getSettings());

  // Signal holding items in cart
  readonly items = signal<CartItem[]>([]);
  readonly isDrawerOpen = signal<boolean>(false);

  // Promo code / Coupon signals
  readonly appliedCoupon = signal<PromoCoupon | null>(null);
  readonly couponFeedback = signal<{ success: boolean; message: string } | null>(null);

  // Computations
  readonly totalItemsCount = computed(() =>
    this.items().reduce((sum, item) => sum + item.quantity, 0)
  );

  readonly subtotal = computed(() =>
    this.items().reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  );

  readonly baseDeliveryFee = computed(() => {
    const s = this.settings();
    return s ? s.deliveryFee : 25;
  });

  readonly effectiveDeliveryFee = computed(() => {
    const coupon = this.appliedCoupon();
    if (coupon?.discountType === 'free_delivery') {
      return 0;
    }
    return this.baseDeliveryFee();
  });

  readonly deliveryFee = computed(() => this.effectiveDeliveryFee());

  readonly discount = computed(() => {
    const coupon = this.appliedCoupon();
    const sub = this.subtotal();

    if (!coupon || sub < coupon.minOrder) return 0;

    if (coupon.discountType === 'fixed') {
      return Math.min(coupon.discountValue, sub);
    } else if (coupon.discountType === 'percent') {
      return Math.round((sub * coupon.discountValue) / 100);
    }
    return 0;
  });

  readonly grandTotal = computed(() => {
    const sub = this.subtotal();
    if (sub === 0) return 0;
    const finalAmt = sub - this.discount() + this.effectiveDeliveryFee();
    return Math.max(0, finalAmt);
  });

  readonly minOrderAmount = computed(() => {
    const s = this.settings();
    return s ? s.minOrderAmount : 150;
  });

  readonly meetsMinOrder = computed(() =>
    this.subtotal() >= this.minOrderAmount()
  );

  applyCoupon(inputCode: string): boolean {
    const cleanCode = inputCode.trim().toUpperCase();
    const found = AVAILABLE_COUPONS.find((c) => c.code === cleanCode);

    if (!found) {
      this.couponFeedback.set({
        success: false,
        message: `Invalid coupon code "${inputCode}". Try KERALA50 or FREEDEL.`
      });
      return false;
    }

    if (this.subtotal() < found.minOrder) {
      this.couponFeedback.set({
        success: false,
        message: `Coupon "${found.code}" requires minimum order of ₹${found.minOrder}. Add ₹${found.minOrder - this.subtotal()} more.`
      });
      return false;
    }

    this.appliedCoupon.set(found);
    this.couponFeedback.set({
      success: true,
      message: `Coupon "${found.code}" applied! You saved ${found.discountType === 'free_delivery' ? '₹25 on delivery' : '₹' + this.discount()}.`
    });
    return true;
  }

  removeCoupon(): void {
    this.appliedCoupon.set(null);
    this.couponFeedback.set(null);
  }

  addToCart(product: Product): void {
    const current = this.items();
    const existingIndex = current.findIndex((i) => i.product.id === product.id);

    if (existingIndex > -1) {
      const updated = [...current];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity + 1
      };
      this.items.set(updated);
    } else {
      this.items.set([...current, { product, quantity: 1 }]);
    }
  }

  decrementItem(productId: string): void {
    const current = this.items();
    const existing = current.find((i) => i.product.id === productId);
    if (!existing) return;

    if (existing.quantity > 1) {
      const updated = current.map((i) =>
        i.product.id === productId ? { ...i, quantity: i.quantity - 1 } : i
      );
      this.items.set(updated);
    } else {
      this.removeFromCart(productId);
    }
  }

  removeFromCart(productId: string): void {
    this.items.set(this.items().filter((i) => i.product.id !== productId));
  }

  getItemQuantity(productId: string): number {
    const item = this.items().find((i) => i.product.id === productId);
    return item ? item.quantity : 0;
  }

  clearCart(): void {
    this.items.set([]);
    this.removeCoupon();
  }

  openDrawer(): void {
    this.isDrawerOpen.set(true);
  }

  closeDrawer(): void {
    this.isDrawerOpen.set(false);
  }

  toggleDrawer(): void {
    this.isDrawerOpen.update((v) => !v);
  }
}

