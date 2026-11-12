import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderStatus } from '../../../core/models/order.model';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border"
      [ngClass]="badgeClasses()"
      [attr.aria-label]="'Order status: ' + status()"
    >
      <span class="w-1.5 h-1.5 rounded-full" [ngClass]="dotClasses()"></span>
      {{ status() }}
    </span>
  `
})
export class StatusBadgeComponent {
  readonly status = input.required<OrderStatus>();

  protected readonly badgeClasses = computed(() => {
    switch (this.status()) {
      case 'New':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Confirmed':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'Out for delivery':
        return 'bg-sky-50 text-sky-800 border-sky-200';
      case 'Delivered':
        return 'bg-[#FFD600]/20 text-black dark:text-[#FFD600] border-[#FFD600]/60';
      case 'Cancelled':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  });

  protected readonly dotClasses = computed(() => {
    switch (this.status()) {
      case 'New':
        return 'bg-amber-500';
      case 'Confirmed':
        return 'bg-blue-500';
      case 'Out for delivery':
        return 'bg-sky-500';
      case 'Delivered':
        return 'bg-[#FF9500]';
      case 'Cancelled':
        return 'bg-rose-500';
      default:
        return 'bg-gray-400';
    }
  });
}

