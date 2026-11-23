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

  getGoogleMapsUrl(order: Order): string {
    if (order.customer.coordinates) {
      return `https://www.google.com/maps/search/?api=1&query=${order.customer.coordinates.lat},${order.customer.coordinates.lng}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customer.address + ', Kerala')}`;
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
