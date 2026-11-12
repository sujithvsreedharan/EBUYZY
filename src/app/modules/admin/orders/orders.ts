import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminOrderService } from '../../../core/services/admin-order.service';
import { SubAdminService } from '../../../core/services/sub-admin.service';
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
  protected readonly staffService = inject(SubAdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // Orders reactive stream to signal
  readonly orders = toSignal(this.orderService.getOrders(), { initialValue: [] });

  // Filter & Search signals
  readonly selectedStatus = signal<FilterStatus>('All');
  readonly searchQuery = signal<string>('');
  readonly selectedOrder = signal<Order | null>(null);
  readonly confirmingCancel = signal<boolean>(false);
  readonly assignmentNotice = signal<string | null>(null);

  readonly statusTabs: FilterStatus[] = [
    'All',
    'New',
    'Confirmed',
    'Out for delivery',
    'Delivered',
    'Cancelled'
  ];

  ngOnInit(): void {
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
        order.customer.address.toLowerCase().includes(query) ||
        (order.assignedDeliveryPersonName &&
          order.assignedDeliveryPersonName.toLowerCase().includes(query));

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
      }
    });
  }

  assignDeliveryPartner(order: Order, deliveryPersonId: string): void {
    if (!deliveryPersonId) {
      return;
    }

    const partner = this.staffService.staffs().find((s) => s.id === deliveryPersonId);
    if (!partner) return;

    this.orderService
      .assignDeliveryPartner(
        order.id,
        partner.id,
        partner.name,
        partner.phone,
        partner.vehicleNumber || partner.vehicleType || 'Delivery Bike'
      )
      .subscribe({
        next: (updated) => {
          this.selectedOrder.set(updated);
          this.showNotice(`Assigned #${order.orderNumber} to ${partner.name}! 🛵`);
        }
      });
  }

  unassignDeliveryPartner(order: Order): void {
    this.orderService.unassignDeliveryPartner(order.id).subscribe({
      next: (updated) => {
        this.selectedOrder.set(updated);
        this.showNotice(`Unassigned delivery partner from #${order.orderNumber}`);
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
      (order.assignedDeliveryPersonName
        ? `Assigned Delivery Partner: ${order.assignedDeliveryPersonName} (${order.assignedDeliveryPersonPhone || ''})\n\n`
        : '') +
      `Thank you for choosing EBUYZY Kakkanad!`;

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }

  getStepClass(currentStatus: OrderStatus, step: OrderStatus): string {
    const rank: Record<OrderStatus, number> = {
      New: 1,
      Confirmed: 2,
      'Out for delivery': 3,
      Delivered: 4,
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

  private showNotice(msg: string): void {
    this.assignmentNotice.set(msg);
    setTimeout(() => this.assignmentNotice.set(null), 3500);
  }
}
