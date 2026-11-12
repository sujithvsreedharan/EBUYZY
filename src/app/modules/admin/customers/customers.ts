import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminOrderService } from '../../../core/services/admin-order.service';

interface CustomerSummary {
  name: string;
  phone: string;
  address: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string;
}

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, DecimalPipe],
  templateUrl: './customers.html',
  styleUrl: './customers.css',
})
export class Customers {
  private readonly orderService = inject(AdminOrderService);
  private readonly orders = toSignal(this.orderService.getOrders(), { initialValue: [] });

  readonly searchQuery = signal<string>('');

  // Extract unique customers from existing delivery orders
  readonly customers = computed<CustomerSummary[]>(() => {
    const orderList = this.orders();
    const map = new Map<string, CustomerSummary>();

    for (const order of orderList) {
      const phone = order.customer.phone;
      if (!map.has(phone)) {
        map.set(phone, {
          name: order.customer.name,
          phone: order.customer.phone,
          address: order.customer.address,
          orderCount: 1,
          totalSpent: order.total,
          lastOrderDate: order.createdAt
        });
      } else {
        const existing = map.get(phone)!;
        existing.orderCount += 1;
        existing.totalSpent += order.total;
        if (new Date(order.createdAt) > new Date(existing.lastOrderDate)) {
          existing.lastOrderDate = order.createdAt;
          existing.address = order.customer.address;
        }
      }
    }

    return Array.from(map.values());
  });

  readonly filteredCustomers = computed(() => {
    const list = this.customers();
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return list;

    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.phone.includes(query) ||
        c.address.toLowerCase().includes(query)
    );
  });
}
