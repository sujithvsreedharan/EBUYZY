import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { AdminOrderService } from './admin-order.service';
import { AuthService } from './auth.service';
import { Order } from '../models/order.model';
import { apiUrl } from '../../app.constant';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

export type AdminNotificationType = 'all' | 'order' | 'stock' | 'system' | 'staff';
export type AdminNotificationSeverity = 'info' | 'warning' | 'success' | 'danger';

export interface AdminNotification {
  id: string | number;
  title: string;
  message: string;
  type: 'order' | 'stock' | 'system' | 'staff';
  severity: AdminNotificationSeverity;
  timestamp: number;
  time: string;
  read: boolean;
  link?: string;
  orderId?: string | number;
  productId?: string | number;
}

const STORAGE_SOUND_KEY = 'ebuyzy_admin_notification_sound';

@Injectable({
  providedIn: 'root',
})
export class AdminNotificationService {
  private readonly http = inject(HttpClient);
  private readonly orderService = inject(AdminOrderService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly baseUrl = apiUrl;

  // Popover state
  readonly isPopoverOpen = signal<boolean>(false);
  readonly selectedFilter = signal<AdminNotificationType>('all');

  // Sound chime preference
  readonly isSoundEnabled = signal<boolean>(this.loadSoundPref());

  // Real notifications list directly from backend dbo.EB_NOTIFICATION - Zero demo notifications!
  readonly backendNotifications = signal<AdminNotification[]>([]);

  // Internal cache of known order IDs to detect brand new incoming orders for audio chime
  private readonly knownOrderIds = new Set<string>();
  private isInitialized = false;
  private pollIntervalId: any = null;
  private eventSource: EventSource | null = null;

  // Real orders signal from AdminOrderService
  private readonly ordersSignal = signal<Order[]>([]);

  constructor() {
    this.cleanLegacyDemoStorage();
    this.initOrderSubscription();
    this.initBackendNotifications();
    this.startBackgroundSync();
  }

  private cleanLegacyDemoStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.removeItem('ebuyzy_admin_read_notification_ids');
    } catch {}
  }

  private initOrderSubscription(): void {
    this.orderService.getOrders().subscribe({
      next: (orders) => {
        if (!orders) return;
        this.ordersSignal.set(orders);

        // Detect newly arrived live 'New' orders to trigger audio chime
        if (this.isInitialized) {
          const newIncoming = orders.filter(
            (o) => o.status === 'New' && !this.knownOrderIds.has(String(o.id))
          );
          if (newIncoming.length > 0 && this.isSoundEnabled()) {
            this.playChime();
          }
        }

        for (const o of orders) {
          this.knownOrderIds.add(String(o.id));
        }
        this.isInitialized = true;
      },
      error: () => {},
    });
  }

  private initBackendNotifications(): void {
    if (this.authService.isAuthenticated()) {
      this.fetchNotifications().subscribe();
      this.connectStream();
    }
  }

  private startBackgroundSync(): void {
    if (typeof window === 'undefined') return;

    // Refresh orders and notifications every 35 seconds
    this.pollIntervalId = window.setInterval(() => {
      const user = this.authService.currentUser();
      if (user && (user.role === 'admin' || user.role === 'manager' || user.role === 'sub_admin' || user.isSuperAdmin)) {
        this.orderService.fetchAdminOrders().subscribe({ error: () => {} });
        this.fetchNotifications().subscribe({ error: () => {} });
      }
    }, 35000);
  }

  fetchNotifications(): Observable<{ success: boolean; notifications?: any[]; unread?: number }> {
    const token = this.authService.getToken();
    if (!token) {
      this.backendNotifications.set([]);
      return of({ success: false });
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http
      .post<{ success: boolean; notifications?: any[]; unread?: number }>(
        `${this.baseUrl}/api/notifications/list`,
        {},
        { headers }
      )
      .pipe(
        tap((res) => {
          if (res.success && Array.isArray(res.notifications)) {
            const mapped = res.notifications.map((n) => this.mapBackendNotification(n));
            this.backendNotifications.set(mapped);
          } else {
            this.backendNotifications.set([]);
          }
        }),
        catchError(() => of({ success: false }))
      );
  }

  connectStream(): void {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    this.disconnectStream();

    const token = this.authService.getToken();
    if (!token) return;

    try {
      const url = `${this.baseUrl}/api/notifications/stream?token=${encodeURIComponent(token)}`;
      this.eventSource = new EventSource(url);

      this.eventSource.addEventListener('notification', (event: MessageEvent) => {
        try {
          const raw = JSON.parse(event.data);
          const mapped = this.mapBackendNotification(raw);

          this.backendNotifications.update((list) => {
            const exists = list.some((n) => String(n.id) === String(mapped.id));
            if (exists) return list;
            return [mapped, ...list];
          });

          if (this.isSoundEnabled()) {
            this.playChime();
          }
        } catch (e) {
          console.error('Failed to parse SSE admin notification:', e);
        }
      });

      this.eventSource.onerror = () => {
        // SSE auto-reconnects
      };
    } catch (err) {
      console.warn('Could not initialize admin SSE stream:', err);
    }
  }

  disconnectStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Computed list of all notifications dynamically synthesized from real backend notifications
   * and live database orders requiring attention. Zero demo notifications!
   */
  readonly allNotifications = computed<AdminNotification[]>(() => {
    const list: AdminNotification[] = [];
    const seenIds = new Set<string>();

    // 1. Direct real notifications from dbo.EB_NOTIFICATION
    for (const b of this.backendNotifications()) {
      seenIds.add(String(b.id));
      list.push(b);
    }

    // 2. Real database orders requiring immediate store attention
    const orders = this.ordersSignal();
    for (const order of orders) {
      const orderRef = order.orderNumber || `ORD-${order.id}`;
      const timeAgo = this.formatTimeAgo(new Date(order.createdAt).getTime());

      if (order.status === 'New') {
        const id = `order-action-new-${order.id}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          list.push({
            id,
            title: `New Order Received #${orderRef}`,
            message: `₹${order.total} from ${order.customer.name} (${order.customer.phone || 'No phone'}). Requires confirmation.`,
            type: 'order',
            severity: 'success',
            timestamp: new Date(order.createdAt).getTime(),
            time: timeAgo,
            read: false,
            link: '/admin/orders',
            orderId: order.id,
          });
        }
      } else if (order.status === 'Cancelled') {
        const id = `order-action-cancel-${order.id}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          list.push({
            id,
            title: `Order Cancelled #${orderRef}`,
            message: `Order #${orderRef} was marked as Cancelled. Customer: ${order.customer.name}.`,
            type: 'order',
            severity: 'danger',
            timestamp: new Date(order.updatedAt || order.createdAt).getTime(),
            time: timeAgo,
            read: true,
            link: '/admin/orders',
            orderId: order.id,
          });
        }
      }
    }

    return list.sort((a, b) => b.timestamp - a.timestamp);
  });

  /**
   * Filtered notifications according to current tab selection
   */
  readonly filteredNotifications = computed<AdminNotification[]>(() => {
    const filter = this.selectedFilter();
    const list = this.allNotifications();
    if (filter === 'all') return list;
    return list.filter((n) => n.type === filter);
  });

  /**
   * Unread notifications count
   */
  readonly unreadCount = computed<number>(() => {
    return this.allNotifications().filter((n) => !n.read).length;
  });

  togglePopover(): void {
    this.isPopoverOpen.update((open) => !open);
    if (this.isPopoverOpen() && this.authService.isAuthenticated()) {
      this.fetchNotifications().subscribe();
    }
  }

  openPopover(): void {
    this.isPopoverOpen.set(true);
    if (this.authService.isAuthenticated()) {
      this.fetchNotifications().subscribe();
    }
  }

  closePopover(): void {
    this.isPopoverOpen.set(false);
  }

  setFilter(filter: AdminNotificationType): void {
    this.selectedFilter.set(filter);
  }

  markAsRead(id: string | number): void {
    const numId = Number(id);

    // Optimistic UI update
    this.backendNotifications.update((list) =>
      list.map((item) => (item.id === id || item.id === numId ? { ...item, read: true } : item))
    );

    const token = this.authService.getToken();
    if (!token || isNaN(numId)) return;

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    this.http
      .post(`${this.baseUrl}/api/notifications/read`, { id: numId }, { headers })
      .subscribe({ error: () => {} });
  }

  markAllAsRead(): void {
    // Optimistic UI update
    this.backendNotifications.update((list) => list.map((item) => ({ ...item, read: true })));

    const token = this.authService.getToken();
    if (!token) return;

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    this.http
      .post(`${this.baseUrl}/api/notifications/readAll`, {}, { headers })
      .subscribe({ error: () => {} });
  }

  removeNotification(id: string | number): void {
    this.markAsRead(id);
    this.backendNotifications.update((list) => list.filter((item) => item.id !== id));
  }

  clearAll(): void {
    this.markAllAsRead();
    this.backendNotifications.set([]);
  }

  toggleSound(): void {
    this.isSoundEnabled.update((enabled) => {
      const next = !enabled;
      this.saveSoundPref(next);
      if (next) {
        this.playChime();
      }
      return next;
    });
  }

  /**
   * Synthesizes a soft, pleasant 2-tone "ding-dong" notification chime using Web Audio API
   */
  playChime(): void {
    if (typeof window === 'undefined') return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      // Note 1: High tone (880 Hz / A5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Note 2: Harmonic resolution tone (1174.66 Hz / D6)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1174.66, now + 0.15);
      gain2.gain.setValueAtTime(0.15, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.6);
    } catch {
      // Ignored if autoplay is blocked by browser policy
    }
  }

  onNotificationClick(item: AdminNotification): void {
    this.markAsRead(item.id);
    this.closePopover();
    if (item.link) {
      this.router.navigate([item.link]);
    }
  }

  refreshOrdersNow(): void {
    this.orderService.fetchAdminOrders().subscribe({ error: () => {} });
    this.fetchNotifications().subscribe({ error: () => {} });
  }

  private mapBackendNotification(n: any): AdminNotification {
    const createdAt = n.createdAt || n.CREATED_AT;
    const ts = createdAt ? new Date(createdAt).getTime() : Date.now();
    const typeStr = String(n.type || n.NOTIF_TYPE || 'system').toLowerCase();

    let notifType: 'order' | 'stock' | 'system' | 'staff' = 'system';
    let severity: AdminNotificationSeverity = 'info';

    if (typeStr.includes('order')) {
      notifType = 'order';
      severity = 'success';
    } else if (typeStr.includes('stock')) {
      notifType = 'stock';
      severity = 'warning';
    } else if (typeStr.includes('cancel')) {
      notifType = 'order';
      severity = 'danger';
    } else if (typeStr.includes('staff') || typeStr.includes('delivery')) {
      notifType = 'staff';
      severity = 'info';
    }

    return {
      id: n.id ?? n.NOTIF_SLNO,
      title: n.title || n.TITLE || 'Alert',
      message: n.body || n.BODY || '',
      type: notifType,
      severity,
      timestamp: ts,
      time: this.formatTimeAgo(ts),
      read: Boolean(n.isRead ?? n.IS_READ),
      link: n.link || n.LINK || (n.orderId || n.ORDER_DR ? '/admin/orders' : undefined),
      orderId: n.orderId ?? n.ORDER_DR ?? null,
    };
  }

  private formatTimeAgo(timestamp: number): string {
    if (!timestamp || isNaN(timestamp)) return 'Recently';
    const diffMs = Date.now() - timestamp;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins === 1) return '1 min ago';
    if (mins < 60) return `${mins} mins ago`;
    const hours = Math.floor(mins / 60);
    if (hours === 1) return '1 hr ago';
    if (hours < 24) return `${hours} hrs ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? 'Yesterday' : `${days} days ago`;
  }

  private loadSoundPref(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    try {
      const raw = localStorage.getItem(STORAGE_SOUND_KEY);
      return raw !== null ? JSON.parse(raw) : true;
    } catch {
      return true;
    }
  }

  private saveSoundPref(enabled: boolean): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(STORAGE_SOUND_KEY, JSON.stringify(enabled));
    } catch {}
  }
}
