import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService, AuthUser } from '../../../core/services/auth.service';
import { AdminOrderService } from '../../../core/services/admin-order.service';
import { CartService } from '../../../core/services/cart.service';
import { AdminProductService } from '../../../core/services/admin-product.service';
import { Order, OrderStatus } from '../../../core/models/order.model';

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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // Tab & Filter States
  readonly activeTab = signal<'orders' | 'profile'>('orders');
  readonly statusFilter = signal<string>('all');
  readonly searchQuery = signal<string>('');
  readonly showDemoOrders = signal<boolean>(false);

  // Expanded Order items toggles
  readonly expandedOrderIds = signal<Set<string>>(new Set());

  // Tracking Modal
  readonly isTrackingModalOpen = signal<boolean>(false);
  readonly selectedOrderForTracking = signal<Order | null>(null);

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
  readonly pincodeInput = signal<string>('682030');

  // Live orders and catalog products
  readonly allOrders = toSignal(this.orderService.getOrders(), { initialValue: [] });
  readonly products = toSignal(this.productService.getProducts(), { initialValue: [] });

  ngOnInit(): void {
    // 1. Check Query Params for direct tab selection (e.g. /profile?tab=profile)
    this.route.queryParams.subscribe((params) => {
      if (params['tab'] === 'profile' || params['tab'] === 'orders') {
        this.activeTab.set(params['tab']);
      }
    });

    // 2. Initialize profile fields from authenticated user
    this.syncProfileFormInputs();
  }

  syncProfileFormInputs(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.nameInput.set(user.name || '');
      this.phoneInput.set(user.phone || '');
      this.emailInput.set(user.email || '');
      this.addressInput.set(user.address || 'Flat 4B, Olive Greens, Infopark Road, Kakkanad');
      this.localityInput.set(user.locality || 'Infopark Road, Kakkanad');
      this.pincodeInput.set(user.pincode || '682042');
    }
  }

  // Filtered orders belonging to the logged-in customer
  readonly customerOrders = computed<Order[]>(() => {
    const user = this.authService.currentUser();
    const orders = this.allOrders();

    if (!user) return [];

    const userPhone = (user.phone || '').replace(/\D/g, '');
    const userName = (user.name || '').trim().toLowerCase();

    // Check matching orders
    const matched = orders.filter((o) => {
      const orderPhone = (o.customer.phone || '').replace(/\D/g, '');
      const orderName = (o.customer.name || '').trim().toLowerCase();

      const phoneMatch = Boolean(
        userPhone &&
        orderPhone &&
        (orderPhone === userPhone || orderPhone.endsWith(userPhone) || userPhone.endsWith(orderPhone))
      );

      const nameMatch = Boolean(userName && orderName && orderName.includes(userName));

      return phoneMatch || nameMatch;
    });

    // If user has direct matched orders, show them
    if (matched.length > 0) {
      return matched;
    }

    // If user toggled sample demo orders or demo customer
    if (this.showDemoOrders() || user.email.includes('ebuyzy') || user.phone === '9847123450') {
      return orders.slice(0, 4);
    }

    return [];
  });

  // Orders filtered by status and search input
  readonly filteredOrders = computed<Order[]>(() => {
    let list = this.customerOrders();
    const filter = this.statusFilter();
    const query = this.searchQuery().trim().toLowerCase();

    // Status filter
    if (filter === 'active') {
      list = list.filter((o) => o.status === 'New' || o.status === 'Confirmed' || o.status === 'Out for delivery');
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
  readonly totalOrdersCount = computed(() => this.customerOrders().length);
  readonly activeOrdersCount = computed(
    () =>
      this.customerOrders().filter(
        (o) => o.status === 'New' || o.status === 'Confirmed' || o.status === 'Out for delivery'
      ).length
  );
  readonly deliveredOrdersCount = computed(
    () => this.customerOrders().filter((o) => o.status === 'Delivered').length
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
  }

  closeTrackingModal(): void {
    this.isTrackingModalOpen.set(false);
    this.selectedOrderForTracking.set(null);
  }

  // Re-order past order: injects all items back into the active cart
  reorderItems(order: Order): void {
    const allProds = this.products();
    let itemsAdded = 0;

    for (const item of order.items) {
      const liveProduct = allProds.find((p) => p.id === item.productId);
      if (liveProduct && liveProduct.inStock) {
        // Add quantity times
        for (let q = 0; q < item.quantity; q++) {
          this.cartService.addToCart(liveProduct);
        }
        itemsAdded += item.quantity;
      } else {
        // Create mock product fallback
        this.cartService.addToCart({
          id: item.productId,
          name: item.productName,
          price: item.unitPrice,
          unit: item.unit,
          imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&auto=format&fit=crop&q=60',
          categoryId: 'cat-1',
          inStock: true,
          stock: 20
        });
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
      this.profileErrorMsg.set('Please enter a valid 10-digit Indian phone number.');
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
      this.profileErrorMsg.set('Please enter your complete address and flat/house number.');
      return;
    }

    this.authService
      .updateProfile({
        address,
        locality: locality || 'Kakkanad, Kochi',
        pincode: pincode || '682030'
      })
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.isEditingAddress.set(false);
            this.profileSuccessMsg.set('Default Kakkanad delivery address updated successfully!');
            this.profileErrorMsg.set(null);
            setTimeout(() => this.profileSuccessMsg.set(null), 4000);
          } else {
            this.profileErrorMsg.set(res.error || 'Failed to update address.');
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
      case 'Confirmed':
        return 'bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800';
      case 'Out for delivery':
        return 'bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800 animate-pulse';
      case 'Delivered':
        return 'bg-[#FFD600]/20 dark:bg-[#FFD600]/10 text-black dark:text-[#FFD600] border-[#FFD600]/60 dark:border-[#FFD600]/40 font-bold';
      case 'Cancelled':
        return 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800';
    }
  }

  getWhatsAppHelpUrl(order: Order): string {
    const text = encodeURIComponent(
      `Hello EBUYZY Support, I am inquiring regarding my Order #${order.orderNumber} for delivery to ${order.customer.address}.`
    );
    return `https://wa.me/919847000111?text=${text}`;
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
