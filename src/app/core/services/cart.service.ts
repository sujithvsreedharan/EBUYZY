import { Injectable, computed, inject, signal, effect } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Product } from '../models/product.model';
import { SettingsService } from './settings.service';
import { AuthService } from './auth.service';
import { apiUrl } from '../../app.constant';
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

export interface BackendCartHeader {
  cartId: number;
  userId: number;
  cartStatus: string;
  totalItems: number;
  totalQuantity: number;
  subtotal: number;
}

export interface BackendCartItem {
  cartDetailId: number;
  productId: number;
  productCode: string;
  productName: string;
  categoryName?: string;
  productImage?: string | null;
  unit?: string;
  mrp: number;
  unitPrice: number;
  quantity: number;
  availableStock: number;
  lineTotal: number;
  addedAt?: string;
}

export interface BackendCartResponse {
  success: boolean;
  cart?: BackendCartHeader | null;
  items?: BackendCartItem[];
  stockCapped?: boolean;
  availableStock?: number;
  message?: string;
}

export const AVAILABLE_COUPONS: PromoCoupon[] = [];

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly settingsService = inject(SettingsService);
  private readonly baseUrl = apiUrl;
  private readonly settings = toSignal(this.settingsService.getSettings());

  // Signal holding items in cart
  readonly items = signal<CartItem[]>([]);
  readonly backendCart = signal<BackendCartHeader | null>(null);
  readonly stockNotice = signal<string | null>(null);
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
    return s && s.deliveryFee != null ? Number(s.deliveryFee) : 0;
  });

  readonly isFreeDelivery = computed(() => {
    const s = this.settings();
    if (s && s.offerDeliveryFee === 0) return true;
    const coupon = this.appliedCoupon();
    return coupon?.discountType === 'free_delivery';
  });

  readonly effectiveDeliveryFee = computed(() => {
    if (this.isFreeDelivery()) {
      return 0;
    }
    const s = this.settings();
    if (s && s.offerDeliveryFee != null && s.offerDeliveryFee > 0) {
      return Number(s.offerDeliveryFee);
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
    return s && s.minOrderAmount != null ? Number(s.minOrderAmount) : 0;
  });

  readonly meetsMinOrder = computed(() =>
    this.subtotal() >= this.minOrderAmount()
  );

  constructor() {
    // Automatically load backend cart when user signs in, or clear when user logs out
    effect(() => {
      const user = this.authService.currentUser();
      if (user && user.id) {
        this.loadUserCart();
      } else {
        this.items.set([]);
        this.backendCart.set(null);
      }
    });
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token
      ? new HttpHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` })
      : new HttpHeaders({ 'Content-Type': 'application/json' });
  }

  /**
   * Load user cart from backend: POST /api/cart/get
   */
  loadUserCart(): void {
    const token = this.authService.getToken();
    if (!token) return;

    this.http
      .post<BackendCartResponse>(
        `${this.baseUrl}/api/cart/get`,
        {},
        { headers: this.getAuthHeaders() }
      )
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.backendCart.set(res.cart || null);
            if (Array.isArray(res.items)) {
              this.items.set(this.mapBackendItemsToCart(res.items));
            }
          }
        },
        error: (err) => {
          console.error('Failed to load user cart:', err);
        }
      });
  }

  private resolveCartItemImage(img: string | null | undefined): string {
    if (!img || typeof img !== 'string') return '/logo/ebuyzy-icon-2.png';
    const trimmed = img.trim();
    if (!trimmed || trimmed.includes('unsplash.com')) return '/logo/ebuyzy-icon-2.png';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('/logo/')) {
      return trimmed;
    }
    if (trimmed.startsWith('/uploads/')) {
      return `${this.baseUrl}${trimmed}`;
    }
    if (trimmed.startsWith('uploads/')) {
      return `${this.baseUrl}/${trimmed}`;
    }
    return `${this.baseUrl}/uploads/products/${trimmed}`;
  }

  private mapBackendItemsToCart(backendItems: BackendCartItem[]): CartItem[] {
    return backendItems.map((item) => ({
      product: {
        id: String(item.productId),
        code: item.productCode,
        name: item.productName,
        categoryId: '',
        categoryName: item.categoryName,
        unit: item.unit || '1 unit',
        mrp: Number(item.mrp || item.unitPrice),
        price: Number(item.unitPrice),
        stock: Number(item.availableStock),
        imageUrl: this.resolveCartItemImage(item.productImage),
        inStock: Number(item.availableStock) > 0
      },
      quantity: Number(item.quantity)
    }));
  }

  applyCoupon(inputCode: string): boolean {
    const cleanCode = inputCode.trim().toUpperCase();
    const found = AVAILABLE_COUPONS.find((c) => c.code === cleanCode);

    if (!found) {
      this.couponFeedback.set({
        success: false,
        message: `Invalid coupon code "${inputCode}".`
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

  /**
   * Add or increase item in cart:
   * Optimistically updates UI and calls POST /api/cart/addOrUpdate if user is logged in
   */
  addToCart(product: Product, deltaQty = 1): void {
    const current = this.items();
    const existingIndex = current.findIndex((i) => i.product.id === product.id);

    if (existingIndex > -1) {
      const updated = [...current];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity + deltaQty
      };
      this.items.set(updated);
    } else {
      this.items.set([...current, { product, quantity: deltaQty }]);
    }

    // Call backend API if user is authenticated
    const user = this.authService.currentUser();
    const numProductId = Number(product.id);
    if ((user?.id || this.authService.getToken()) && !isNaN(numProductId) && numProductId > 0) {
      this.syncCartAddOrUpdate(numProductId, deltaQty, true);
    }
  }

  /**
   * Decrement item quantity in cart
   */
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
      this.items.set(current.filter((i) => i.product.id !== productId));
    }

    const user = this.authService.currentUser();
    const numProductId = Number(productId);
    if ((user?.id || this.authService.getToken()) && !isNaN(numProductId) && numProductId > 0) {
      this.syncCartAddOrUpdate(numProductId, -1, true);
    }
  }

  /**
   * Remove item completely from cart:
   * Calls POST /api/cart/remove
   */
  removeFromCart(productId: string): void {
    this.items.set(this.items().filter((i) => i.product.id !== productId));

    const numProductId = Number(productId);
    if ((this.authService.currentUser()?.id || this.authService.getToken()) && !isNaN(numProductId) && numProductId > 0) {
      this.http
        .post<BackendCartResponse>(
          `${this.baseUrl}/api/cart/remove`,
          { productId: numProductId },
          { headers: this.getAuthHeaders() }
        )
        .subscribe({
          next: (res) => {
            if (res.success) {
              this.backendCart.set(res.cart || null);
              if (Array.isArray(res.items)) {
                this.items.set(this.mapBackendItemsToCart(res.items));
              }
            }
          },
          error: (err) => {
            console.error('Remove Cart API Error:', err);
          }
        });
    }
  }

  /**
   * Calls POST /api/cart/addOrUpdate
   */
  private syncCartAddOrUpdate(productId: number, quantity: number, isDelta: boolean): void {
    if (!this.authService.getToken()) return;

    this.http
      .post<BackendCartResponse>(
        `${this.baseUrl}/api/cart/addOrUpdate`,
        {
          productId,
          quantity,
          isDelta
        },
        { headers: this.getAuthHeaders() }
      )
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.backendCart.set(res.cart || null);
            if (Array.isArray(res.items)) {
              this.items.set(this.mapBackendItemsToCart(res.items));
            }
            if (res.stockCapped && res.message) {
              this.stockNotice.set(res.message);
              setTimeout(() => this.stockNotice.set(null), 3500);
            }
          }
        },
        error: (err) => {
          console.error('Add/Update Cart API Error:', err);
        }
      });
  }

  getItemQuantity(productId: string): number {
    const item = this.items().find((i) => i.product.id === productId);
    return item ? item.quantity : 0;
  }

  clearCart(): void {
    this.items.set([]);
    this.removeCoupon();
    this.backendCart.set(null);
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
