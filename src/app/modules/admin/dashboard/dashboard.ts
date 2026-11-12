import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminOrderService } from '../../../core/services/admin-order.service';
import { AdminProductService } from '../../../core/services/admin-product.service';
import { SettingsService } from '../../../core/services/settings.service';
import { AuthService } from '../../../core/services/auth.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, StatusBadgeComponent, DatePipe, DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  protected readonly authService = inject(AuthService);
  private readonly orderService = inject(AdminOrderService);
  private readonly productService = inject(AdminProductService);
  private readonly settingsService = inject(SettingsService);

  // Reactive state signals
  readonly settings = toSignal(this.settingsService.getSettings());
  readonly stats = toSignal(this.orderService.getTodayStats());
  readonly recentOrders = toSignal(this.orderService.getRecentOrders(6));
  readonly lowStockProducts = toSignal(this.productService.getLowStockProducts(10));

  toggleShopStatus(): void {
    this.settingsService.toggleShopStatus().subscribe();
  }
}
