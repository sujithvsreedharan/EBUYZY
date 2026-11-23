import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService, AuthUser } from '../../../core/services/auth.service';
import { AdminOrderService } from '../../../core/services/admin-order.service';
import { CartService } from '../../../core/services/cart.service';
import { AdminProductService } from '../../../core/services/admin-product.service';
import { SettingsService } from '../../../core/services/settings.service';
import { Order, OrderItem, OrderStatus } from '../../../core/models/order.model';
import { Product } from '../../../core/models/product.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly orderService = inject(AdminOrderService);
  protected readonly cartService = inject(CartService);
  private readonly productService = inject(AdminProductService);
  private readonly settingsService = inject(SettingsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly settings = toSignal(this.settingsService.getSettings());

  // Tab & Filter States
  readonly activeTab = signal<'orders' | 'profile'>('orders');
  readonly statusFilter = signal<string>('all');
  readonly searchQuery = signal<string>('');

  // Expanded Order items toggles
  readonly expandedOrderIds = signal<Set<string>>(new Set());

  // Tracking Modal
  readonly isTrackingModalOpen = signal<boolean>(false);
  readonly selectedOrderForTracking = signal<Order | null>(null);

  // Cancel Order Confirmation Modal
  readonly orderToCancel = signal<Order | null>(null);
  readonly isCancellingOrder = signal<boolean>(false);
  readonly cancelReason = signal<string>('Changed mind / placed by mistake');

  // Profile Edit states
  readonly isEditingProfile = signal<boolean>(false);
  readonly isEditingAddress = signal<boolean>(false);
  readonly profileSuccessMsg = signal<string | null>(null);
  readonly profileErrorMsg = signal<string | null>(null);
  readonly reorderSuccessMsg = signal<string | null>(null);

  // Profile form inputs
  readonly nameInput = signal<string>('');
  readonly phoneInput = signal<string>('');
  readonly emailInput = signal<string>('');
  readonly addressInput = signal<string>('');
  readonly localityInput = signal<string>('');
  readonly pincodeInput = signal<string>('');

  // Backend state signals
  readonly backendOrders = signal<Order[]>([]);
  readonly savedAddresses = signal<any[]>([]);
  readonly orderCounts = signal<{ allCount: number; activeCount: number; deliveredCount: number }>({
    allCount: 0,
    activeCount: 0,
    deliveredCount: 0
  });
  readonly isLoadingOrders = signal<boolean>(false);
  readonly isLoadingProfile = signal<boolean>(false);

  // Catalog products for reorder reference
  readonly products = toSignal(this.productService.getProducts(), { initialValue: [] });

  ngOnInit(): void {
    // 1. Check if route is /orders or /profile
    if (this.router.url.includes('/orders')) {
      this.activeTab.set('orders');
    } else {
      this.route.queryParams.subscribe((params) => {
        if (params['tab'] === 'profile' || params['tab'] === 'orders') {
          this.activeTab.set(params['tab']);
        }
      });
    }

    // 2. Initialize profile fields from authenticated user
    this.syncProfileFormInputs();

    // 3. If authenticated, fetch real user profile and orders from backend
    if (this.authService.isAuthenticated()) {
      this.loadUserProfile();
      this.loadCustomerOrders();
    }
  }

  loadUserProfile(): void {
    this.isLoadingProfile.set(true);
    this.authService.getUserProfileApi().subscribe({
      next: (res) => {
        this.isLoadingProfile.set(false);
        if (res.addresses && Array.isArray(res.addresses)) {
          this.savedAddresses.set(res.addresses);
        }
        this.syncProfileFormInputs();
      },
      error: (err) => {
        this.isLoadingProfile.set(false);
        console.error('Error fetching user profile:', err);
        this.syncProfileFormInputs();
      }
    });
  }

  loadCustomerOrders(): void {
    if (!this.authService.isAuthenticated()) {
      this.backendOrders.set([]);
      return;
    }

    this.isLoadingOrders.set(true);
    const filter = this.statusFilter();
    const backendFilter = filter === 'active' ? 'ACTIVE' : filter.toLowerCase() === 'delivered' ? 'DELIVERED' : 'ALL';

    this.orderService.getMyOrders({
      filter: backendFilter,
      search: this.searchQuery() || undefined,
      pageSize: 50
    }).subscribe({
      next: (res) => {
        this.isLoadingOrders.set(false);
        if (res.counts) {
          this.orderCounts.set(res.counts);
        }
        if (res.success && Array.isArray(res.orders)) {
          const mappedOrders = res.orders.map((bOrder: any) => this.mapBackendOrderToOrder(bOrder));
          this.backendOrders.set(mappedOrders);
        } else {
          this.backendOrders.set([]);
        }
      },
      error: (err) => {
        this.isLoadingOrders.set(false);
        console.error('Error fetching customer orders:', err);
      }
    });
  }

  syncProfileFormInputs(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.nameInput.set(user.name || '');
      this.phoneInput.set(user.phone || '');
      this.emailInput.set(user.email || '');
      this.addressInput.set(user.address || '');
      this.localityInput.set(user.locality || '');
      this.pincodeInput.set(user.pincode || '');
    }
  }

  private mapBackendStatusToFrontend(status: string): OrderStatus {
    const s = (status || '').toUpperCase().trim();
    switch (s) {
      case 'PENDING':
      case 'NEW':
        return 'New';
      case 'CONFIRMED':
        return 'Confirmed';
      case 'PACKING':
      case 'PREPARING':
        return 'Packing';
      case 'PACKED':
        return 'Packed';
      case 'OUT_FOR_DELIVERY':
      case 'DISPATCHED':
        return 'Out for delivery';
      case 'DELIVERED':
        return 'Delivered';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return 'New';
    }
  }

  private mapBackendOrderToOrder(bOrder: any): Order {
    const items: OrderItem[] = Array.isArray(bOrder.items)
      ? bOrder.items.map((i: any) => ({
          productId: String(i.productId || i.product_dr || i.orderItemId || Math.random()),
          productName: i.productName || i.name || 'Produce Item',
          unit: i.unit || 'kg',
          unitPrice: Number(i.unitPrice ?? i.price ?? 0),
          quantity: Number(i.quantity ?? 1),
          total: Number(i.lineTotal ?? i.totalPrice ?? i.total ?? ((Number(i.unitPrice || 0)) * (Number(i.quantity || 1))))
        }))
      : [];

    return {
      id: String(bOrder.orderId || bOrder.orderCode),
      orderNumber: bOrder.orderCode || `ORD-${bOrder.orderId}`,
      customer: {
        name: bOrder.recipientName || bOrder.customerName || this.authService.currentUser()?.name || 'Customer',
        phone: bOrder.recipientMobile || bOrder.customerMobile || this.authService.currentUser()?.phone || '',
        address: bOrder.deliveryAddress || this.authService.currentUser()?.address || '',
        landmark: bOrder.landmark || ''
      },
      items,
      subtotal: Number(bOrder.subtotal ?? bOrder.subTotal ?? bOrder.totalAmount ?? bOrder.grandTotal ?? 0),
      deliveryFee: Number(bOrder.deliveryCharge ?? 0),
      discount: Number(bOrder.discountAmount ?? 0),
      total: Number(bOrder.grandTotal ?? bOrder.totalAmount ?? bOrder.subtotal ?? 0),
      status: this.mapBackendStatusToFrontend(bOrder.orderStatus),
      notes: bOrder.orderNote || bOrder.note || '',
      assignedDeliveryPersonName: bOrder.deliveryStaffName,
      assignedDeliveryPersonPhone: bOrder.deliveryStaffMobile,
      createdAt: bOrder.orderedAt || bOrder.createdAt || new Date().toISOString(),
      updatedAt: bOrder.updatedAt || new Date().toISOString()
    };
  }

  // Orders belonging to the logged-in customer
  readonly customerOrders = computed<Order[]>(() => {
    return this.backendOrders();
  });

  // Orders filtered by status and search input
  readonly filteredOrders = computed<Order[]>(() => {
    let list = this.customerOrders();
    const filter = this.statusFilter();
    const query = this.searchQuery().trim().toLowerCase();

    // Status filter
    if (filter === 'active') {
      list = list.filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled');
    } else if (filter !== 'all') {
      list = list.filter((o) => o.status === filter);
    }

    // Search query filter
    if (query) {
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(query) ||
          o.items.some((i) => i.productName.toLowerCase().includes(query)) ||
          o.customer.address.toLowerCase().includes(query)
      );
    }

    return list;
  });

  // Counts
  readonly totalOrdersCount = computed(() => this.orderCounts().allCount || this.customerOrders().length);
  readonly activeOrdersCount = computed(
    () => this.orderCounts().activeCount || this.customerOrders().filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled').length
  );
  readonly deliveredOrdersCount = computed(
    () => this.orderCounts().deliveredCount || this.customerOrders().filter((o) => o.status === 'Delivered').length
  );

  selectTab(tab: 'orders' | 'profile'): void {
    this.activeTab.set(tab);
    this.profileSuccessMsg.set(null);
    this.profileErrorMsg.set(null);
    this.reorderSuccessMsg.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge'
    });
  }

  setStatusFilter(filter: string): void {
    this.statusFilter.set(filter);
    this.loadCustomerOrders();
  }

  toggleOrderExpanded(orderId: string): void {
    const current = new Set(this.expandedOrderIds());
    if (current.has(orderId)) {
      current.delete(orderId);
    } else {
      current.add(orderId);
    }
    this.expandedOrderIds.set(current);
  }

  isOrderExpanded(orderId: string): boolean {
    return this.expandedOrderIds().has(orderId);
  }

  openTrackingModal(order: Order): void {
    this.selectedOrderForTracking.set(order);
    this.isTrackingModalOpen.set(true);

    this.orderService.getOrderDetailsApi(order.id).subscribe({
      next: (res) => {
        if (res.success && res.order) {
          const fullOrder = this.mapBackendOrderToOrder({
            ...res.order,
            items: res.items && res.items.length ? res.items : order.items
          });
          this.selectedOrderForTracking.set(fullOrder);
        }
      },
      error: (err) => console.error('Error fetching order details for live tracker:', err)
    });
  }

  closeTrackingModal(): void {
    this.isTrackingModalOpen.set(false);
    this.selectedOrderForTracking.set(null);
  }

  openCancelModal(order: Order): void {
    this.orderToCancel.set(order);
    this.cancelReason.set('Changed mind / placed by mistake');
  }

  closeCancelModal(): void {
    if (!this.isCancellingOrder()) {
      this.orderToCancel.set(null);
    }
  }

  cancelCustomerOrder(order: Order): void {
    this.openCancelModal(order);
  }

  confirmCancelOrder(): void {
    const order = this.orderToCancel();
    if (!order) return;

    const numericId = Number(order.id);
    if (!Number.isInteger(numericId) || numericId < 1) {
      this.profileErrorMsg.set('Unable to identify order to cancel.');
      this.orderToCancel.set(null);
      return;
    }

    this.isCancellingOrder.set(true);
    const reason = this.cancelReason() || 'Cancelled by customer';

    this.orderService.cancelOrderApi(numericId, reason).subscribe({
      next: (res) => {
        this.isCancellingOrder.set(false);
        this.orderToCancel.set(null);
        if (res.success) {
          this.profileSuccessMsg.set(`Order #${order.orderNumber} has been cancelled successfully.`);
          this.profileErrorMsg.set(null);
          this.loadCustomerOrders();
          setTimeout(() => this.profileSuccessMsg.set(null), 5000);
        } else {
          this.profileErrorMsg.set(res.message || 'Could not cancel order.');
          setTimeout(() => this.profileErrorMsg.set(null), 5000);
        }
      },
      error: (err) => {
        this.isCancellingOrder.set(false);
        this.orderToCancel.set(null);
        const msg = err?.error?.message || 'Failed to cancel order. You can only cancel an order before it is confirmed.';
        this.profileErrorMsg.set(msg);
        setTimeout(() => this.profileErrorMsg.set(null), 5000);
      }
    });
  }

  // Re-order past order: adds all items back into the active cart
  reorderItems(order: Order): void {
    const allProds = this.products();
    let itemsAdded = 0;

    for (const item of order.items) {
      const liveProduct = allProds.find((p) => String(p.id) === String(item.productId));
      if (liveProduct && liveProduct.inStock) {
        this.cartService.addToCart(liveProduct, item.quantity);
        itemsAdded += item.quantity;
      } else {
        const fallbackProduct: Product = {
          id: item.productId,
          name: item.productName,
          price: item.unitPrice,
          unit: item.unit,
          imageUrl: '',
          categoryId: '',
          inStock: true,
          stock: 99
        };
        this.cartService.addToCart(fallbackProduct, item.quantity);
        itemsAdded += item.quantity;
      }
    }

    this.reorderSuccessMsg.set(
      `Added ${itemsAdded} items from order ${order.orderNumber} to your shopping basket!`
    );

    // Automatically open the cart drawer to show customer the items
    this.cartService.openDrawer();

    setTimeout(() => {
      this.reorderSuccessMsg.set(null);
    }, 5000);
  }

  saveProfile(): void {
    const name = this.nameInput().trim();
    const phone = this.phoneInput().trim();
    const email = this.emailInput().trim();

    if (!name || name.length < 2) {
      this.profileErrorMsg.set('Please enter a valid full name.');
      return;
    }

    if (!phone || phone.replace(/\D/g, '').length < 10) {
      this.profileErrorMsg.set('Please enter a valid 10-digit phone number.');
      return;
    }

    this.authService
      .updateProfile({
        name,
        phone: phone.replace(/\D/g, ''),
        email: email || undefined
      })
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.isEditingProfile.set(false);
            this.profileSuccessMsg.set('Profile information updated successfully!');
            this.profileErrorMsg.set(null);
            setTimeout(() => this.profileSuccessMsg.set(null), 4000);
          } else {
            this.profileErrorMsg.set(res.error || 'Failed to update profile.');
          }
        },
        error: () => {
          this.profileErrorMsg.set('Failed to save profile. Please try again.');
        }
      });
  }

  saveAddress(): void {
    const address = this.addressInput().trim();
    const locality = this.localityInput().trim();
    const pincode = this.pincodeInput().trim();

    if (!address || address.length < 5) {
      this.profileErrorMsg.set('Please enter your complete address.');
      return;
    }

    this.authService
      .saveAddressApi({
        address,
        locality: locality || undefined,
        pincode: pincode || undefined
      })
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.authService.updateProfile({
              address,
              locality: locality || undefined,
              pincode: pincode || undefined
            });
            this.isEditingAddress.set(false);
            this.profileSuccessMsg.set('Default delivery address updated successfully!');
            this.profileErrorMsg.set(null);
            setTimeout(() => this.profileSuccessMsg.set(null), 4000);
          } else {
            this.profileErrorMsg.set(res.message || 'Failed to update address.');
          }
        },
        error: () => {
          this.profileErrorMsg.set('Failed to save address.');
        }
      });
  }

  openSignInModal(): void {
    this.authService.openAuthModal('signin', undefined, '/profile');
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
    this.authService.openAuthModal('signin', 'You have signed out. Sign in anytime to view your profile.');
  }

  // Delivery Step Progress Calculations (1 to 4)
  getDeliveryStepIndex(status: OrderStatus): number {
    switch (status) {
      case 'New':
        return 1;
      case 'Confirmed':
      case 'Packing':
      case 'Packed':
        return 2;
      case 'Out for delivery':
        return 3;
      case 'Delivered':
        return 4;
      case 'Cancelled':
      default:
        return 0;
    }
  }

  getStatusBadgeClass(status: OrderStatus): string {
    switch (status) {
      case 'New':
        return 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case 'Packing':
        return 'bg-orange-100 dark:bg-orange-950/70 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800';
      case 'Packed':
        return 'bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800';
      case 'Confirmed':
        return 'bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800';
      case 'Out for delivery':
        return 'bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800 animate-pulse';
      case 'Delivered':
        return 'bg-[#FFD600]/20 dark:bg-[#FFD600]/10 text-black dark:text-[#FFD600] border-[#FFD600]/60 dark:border-[#FFD600]/40 font-bold';
      case 'Cancelled':
        return 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800';
    }
  }

  getWhatsAppHelpUrl(order: Order): string {
    const rawPhone = this.settings()?.whatsappNumber || '';
    const digits = rawPhone.replace(/\D/g, '');
    const phone = digits.length === 10 ? `91${digits}` : digits;
    const text = encodeURIComponent(
      `Hello Support, I am inquiring regarding my Order #${order.orderNumber}.`
    );
    return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  }

  formatDate(isoDate: string): string {
    try {
      const d = new Date(isoDate);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoDate;
    }
  }
}
