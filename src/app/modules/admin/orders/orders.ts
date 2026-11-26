import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminOrderService } from '../../../core/services/admin-order.service';
import { Order, OrderStatus } from '../../../core/models/order.model';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';

type FilterStatus = 'All' | OrderStatus;

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent, DatePipe, DecimalPipe],
  templateUrl: './orders.html',
  styleUrl: './orders.css',
})
export class Orders implements OnInit {
  private readonly orderService = inject(AdminOrderService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // Orders reactive stream to signal
  readonly orders = toSignal(this.orderService.getOrders(), { initialValue: [] });

  // Filter & Search signals
  readonly selectedStatus = signal<FilterStatus>('All');
  readonly searchQuery = signal<string>('');
  readonly selectedOrder = signal<Order | null>(null);
  readonly confirmingCancel = signal<boolean>(false);

  readonly statusTabs: FilterStatus[] = [
    'All',
    'New',
    'Packing',
    'Packed',
    'Out for delivery',
    'Delivered',
    'Cancelled'
  ];

  ngOnInit(): void {
    // Fetch live orders from backend
    this.refreshOrders();

    // Check if routed with a specific orderId query param (e.g., from Dashboard)
    this.route.queryParams.subscribe((params) => {
      const orderId = params['orderId'];
      if (orderId) {
        this.orderService.getOrderById(orderId).subscribe((found) => {
          if (found) {
            this.selectedOrder.set(found);
          }
        });
      }
    });
  }

  refreshOrders(): void {
    this.orderService.fetchAdminOrders().subscribe({
      error: () => {}
    });
  }

  // Filtered orders computed signal
  readonly filteredOrders = computed(() => {
    const list = this.orders();
    const status = this.selectedStatus();
    const query = this.searchQuery().trim().toLowerCase();

    return list.filter((order) => {
      const matchesStatus = status === 'All' || order.status === status;
      const matchesQuery =
        !query ||
        order.orderNumber.toLowerCase().includes(query) ||
        order.customer.phone.includes(query) ||
        order.customer.name.toLowerCase().includes(query) ||
        order.customer.address.toLowerCase().includes(query);

      return matchesStatus && matchesQuery;
    });
  });

  countByStatus(status: OrderStatus): number {
    return this.orders().filter((o) => o.status === status).length;
  }

  openOrderDetail(order: Order): void {
    this.confirmingCancel.set(false);
    this.selectedOrder.set(order);
  }

  closeOrderDetail(): void {
    this.confirmingCancel.set(false);
    this.selectedOrder.set(null);
    if (this.route.snapshot.queryParams['orderId']) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { orderId: null },
        queryParamsHandling: 'merge'
      });
    }
  }

  updateStatus(order: Order, nextStatus: OrderStatus): void {
    this.orderService.updateOrderStatus(order.id, nextStatus).subscribe({
      next: (updated) => {
        this.selectedOrder.set(updated);
        this.refreshOrders();
      },
      error: (err) => {
        alert(err?.error?.message || err?.message || 'Failed to update order status');
      }
    });
  }

  resetFilters(): void {
    this.selectedStatus.set('All');
    this.searchQuery.set('');
  }

  getItemsSummary(order: Order): string {
    return order.items.map((i) => i.productName).join(', ');
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

  getGoogleMapsUrl(order: Order): string {
    return this.getRouteMapUrl(order);
  }

  getWhatsAppUrl(order: Order): string {
    const rawPhone = order.customer.phone.replace(/\D/g, '');
    const cleanPhone = rawPhone.length === 10 ? '91' + rawPhone : rawPhone;

    const message =
      `Namaskaram ${order.customer.name}! 👋\n\n` +
      `This is EBUYZY regarding your order #${order.orderNumber}.\n` +
      `Current Status: ${order.status}\n` +
      `Total: ₹${order.total}\n` +
      `Delivery Address: ${order.customer.address}\n\n` +
      `Thank you for choosing EBUYZY Kakkanad!`;

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }

  getStepClass(currentStatus: OrderStatus, step: OrderStatus): string {
    const rank: Record<OrderStatus, number> = {
      New: 1,
      Confirmed: 2,
      Packing: 2,
      Packed: 3,
      'Out for delivery': 4,
      Delivered: 5,
      Cancelled: -1
    };

    if (currentStatus === 'Cancelled') {
      return 'bg-gray-100 text-gray-400';
    }

    const currentRank = rank[currentStatus] || 0;
    const stepRank = rank[step] || 0;

    if (currentRank > stepRank) {
      return 'bg-[#FFD600]/30 text-black font-bold border border-[#FFD600]/60';
    } else if (currentRank === stepRank) {
      return 'bg-gradient-to-r from-[#FF9500] to-[#FF4D00] text-white font-bold shadow-xs';
    } else {
      return 'bg-gray-100 text-gray-400';
    }
  }
}
