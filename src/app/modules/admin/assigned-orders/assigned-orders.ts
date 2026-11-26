import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminOrderService } from '../../../core/services/admin-order.service';
import { AuthService } from '../../../core/services/auth.service';
import { SubAdminService } from '../../../core/services/sub-admin.service';
import { Order, OrderStatus } from '../../../core/models/order.model';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-assigned-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent, DatePipe, DecimalPipe],
  templateUrl: './assigned-orders.html',
  styleUrl: './assigned-orders.css'
})
export class AssignedOrders implements OnInit {
  protected readonly orderService = inject(AdminOrderService);
  protected readonly authService = inject(AuthService);
  protected readonly staffService = inject(SubAdminService);

  readonly allOrders = toSignal(this.orderService.getOrders(), { initialValue: [] });

  // Filter signals
  readonly selectedStatusFilter = signal<'all' | 'active' | 'delivered'>('active');
  readonly searchQuery = signal<string>('');
  readonly selectedOrderId = signal<string | null>(null);
  readonly statusUpdateSuccess = signal<string | null>(null);

  // Selected delivery partner for Admin / Super Admin view
  readonly selectedPartnerId = signal<string>('');

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (user?.role === 'delivery_person') {
      this.selectedPartnerId.set(user.id);
    } else {
      // Default to first active delivery person if admin is viewing
      const partners = this.staffService.deliveryPersons();
      if (partners.length > 0) {
        this.selectedPartnerId.set(partners[0].id);
      }
    }
  }

  // Active current partner details
  readonly currentPartner = computed(() => {
    const user = this.authService.currentUser();
    if (user?.role === 'delivery_person') {
      return {
        id: user.id,
        name: user.name,
        phone: user.phone || '',
        vehicle: user.vehicleNumber || user.vehicleType || 'Delivery Bike',
        zone: user.zone || 'Kakkanad, Kochi'
      };
    }

    const partnerId = this.selectedPartnerId();
    const partner = this.staffService.staffs().find((s) => s.id === partnerId);
    if (partner) {
      return {
        id: partner.id,
        name: partner.name,
        phone: partner.phone,
        vehicle: partner.vehicleNumber || partner.vehicleType || 'Delivery Bike',
        zone: partner.zone || 'Kakkanad, Kochi'
      };
    }

    return null;
  });

  // Orders assigned to this partner
  readonly assignedOrders = computed(() => {
    const list = this.allOrders();
    const partner = this.currentPartner();
    if (!partner) return [];

    return list.filter(
      (o) =>
        o.assignedDeliveryPersonId === partner.id ||
        (o.assignedDeliveryPersonName &&
          o.assignedDeliveryPersonName.toLowerCase() === partner.name.toLowerCase())
    );
  });

  // Filtered assigned orders
  readonly filteredAssignedOrders = computed(() => {
    const orders = this.assignedOrders();
    const statusFilter = this.selectedStatusFilter();
    const query = this.searchQuery().trim().toLowerCase();

    return orders.filter((o) => {
      // Status filter
      if (statusFilter === 'active') {
        if (o.status === 'Delivered' || o.status === 'Cancelled') {
          return false;
        }
      } else if (statusFilter === 'delivered') {
        if (o.status !== 'Delivered') {
          return false;
        }
      }

      // Search match
      if (query) {
        const matchesQuery =
          o.orderNumber.toLowerCase().includes(query) ||
          o.customer.name.toLowerCase().includes(query) ||
          o.customer.phone.includes(query) ||
          o.customer.address.toLowerCase().includes(query);
        if (!matchesQuery) return false;
      }

      return true;
    });
  });

  // KPI computations for assigned orders
  readonly activeDeliveriesCount = computed(() => {
    return this.assignedOrders().filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled').length;
  });

  readonly completedTodayCount = computed(() => {
    return this.assignedOrders().filter((o) => o.status === 'Delivered').length;
  });

  readonly cashToCollectTotal = computed(() => {
    return this.assignedOrders()
      .filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled')
      .reduce((sum, curr) => sum + curr.total, 0);
  });

  // Action methods
  markOutForDelivery(order: Order): void {
    this.orderService.updateOrderStatus(order.id, 'Out for delivery').subscribe({
      next: () => {
        this.showToast(`Order #${order.orderNumber} is now OUT FOR DELIVERY! 🛵`);
      }
    });
  }

  markDelivered(order: Order): void {
    this.orderService.updateOrderStatus(order.id, 'Delivered').subscribe({
      next: () => {
        this.showToast(`Order #${order.orderNumber} successfully marked as DELIVERED! 🎉`);
      }
    });
  }

  getRouteMapUrl(order: Order): string {
    // 1. Origin: Store coordinates from order, AdminOrderService, or store default (EB_STORE_GEO_LOCATION)
    let originLat = order.storeCoordinates?.lat ?? this.orderService.getStoreCoordinates()?.lat;
    let originLng = order.storeCoordinates?.lng ?? this.orderService.getStoreCoordinates()?.lng;

    if (!originLat || !originLng) {
      originLat = 8.4854948;
      originLng = 76.9492364;
    }
    const origin = `${originLat},${originLng}`;

    // 2. Destination: User's added Google GPS location
    let dest = '';
    if (order.customer.coordinates?.lat && order.customer.coordinates?.lng) {
      dest = `${order.customer.coordinates.lat},${order.customer.coordinates.lng}`;
    } else {
      const match = order.customer.address?.match(/\[GPS:\s*([\d.-]+)[°\s]*([NS])?,\s*([\d.-]+)[°\s]*([EW])?\]/i);
      if (match) {
        let lat = parseFloat(match[1]);
        if (match[2] && match[2].toUpperCase() === 'S') lat = -lat;
        let lng = parseFloat(match[3]);
        if (match[4] && match[4].toUpperCase() === 'W') lng = -lng;
        if (!isNaN(lat) && !isNaN(lng)) {
          dest = `${lat},${lng}`;
        }
      }
    }

    if (!dest) {
      dest = encodeURIComponent(order.customer.address + ', Kerala');
    }

    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
  }

  getGoogleMapsDirectionsUrl(order: Order): string {
    return this.getRouteMapUrl(order);
  }

  getWhatsAppUrl(order: Order): string {
    const rawPhone = order.customer.phone.replace(/\D/g, '');
    const cleanPhone = rawPhone.length === 10 ? '91' + rawPhone : rawPhone;
    const partner = this.currentPartner();

    const msg =
      `Namaskaram ${order.customer.name}! 👋\n` +
      `This is ${partner?.name || 'your delivery partner'} from EBUYZY.\n` +
      `I am on the way with your order #${order.orderNumber} (₹${order.total}).\n` +
      `Delivery location: ${order.customer.address}.\n` +
      `I will reach you in a few minutes! 🛵`;

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
  }

  private showToast(message: string): void {
    this.statusUpdateSuccess.set(message);
    setTimeout(() => this.statusUpdateSuccess.set(null), 3500);
  }
}

