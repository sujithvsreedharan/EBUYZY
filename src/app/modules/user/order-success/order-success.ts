import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminOrderService } from '../../../core/services/admin-order.service';
import { SettingsService } from '../../../core/services/settings.service';
import { Order } from '../../../core/models/order.model';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-order-success',
  standalone: true,
  imports: [CommonModule, RouterLink, DecimalPipe],
  templateUrl: './order-success.html',
  styleUrl: './order-success.css',
})
export class OrderSuccess implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly orderService = inject(AdminOrderService);
  private readonly settingsService = inject(SettingsService);

  readonly order = signal<Order | null>(null);
  readonly settings = toSignal(this.settingsService.getSettings());

  ngOnInit(): void {
    const orderId = this.route.snapshot.paramMap.get('id');
    if (orderId) {
      this.orderService.getOrderById(orderId).subscribe((o) => {
        if (o) {
          this.order.set(o);
        }
      });
    }
  }

  getWhatsAppStoreUrl(order: Order): string {
    const storeNumber = this.settings()?.whatsappNumber || '919847001234';
    const cleanNumber = storeNumber.replace(/\D/g, '');

    const itemsSummary = order.items.map((i) => `${i.productName} (${i.quantity} ${i.unit})`).join(', ');

    const message =
      `Namaskaram EBUYZY! 👋\n\n` +
      `I just placed an order on your web app:\n` +
      `Order ID: #${order.orderNumber}\n` +
      `Customer Name: ${order.customer.name}\n` +
      `Phone: ${order.customer.phone}\n` +
      `Items: ${itemsSummary}\n` +
      `Total: ₹${order.total}\n` +
      `Delivery Address: ${order.customer.address}\n\n` +
      `Please confirm dispatch when ready. Thank you!`;

    return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
  }
}
