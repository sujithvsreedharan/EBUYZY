import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { apiUrl } from '../../app.constant';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

export interface AppNotification {
  id: number | string;
  title: string;
  message: string;
  time: string;
  timestamp: number;
  read: boolean;
  type: 'order' | 'offer' | 'info' | 'system';
  link?: string;
  orderId?: number | null;
}

const STORAGE_KEY = 'ebuyzy_user_notifications';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly baseUrl = apiUrl;

  // Real notifications list from backend database - Zero demo notifications!
  readonly notifications = signal<AppNotification[]>([]);
  readonly isPopoverOpen = signal<boolean>(false);
  readonly unreadCount = signal<number>(0);

  private eventSource: EventSource | null = null;
  private pollIntervalId: any = null;

  constructor() {
    this.cleanLegacyDemoStorage();
    this.initNotificationSync();
  }

  private cleanLegacyDemoStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  private initNotificationSync(): void {
    if (this.authService.isAuthenticated()) {
      this.fetchNotifications().subscribe();
      this.connectStream();
    }

    if (typeof window !== 'undefined') {
      // Periodic fallback sync every 30 seconds
      this.pollIntervalId = window.setInterval(() => {
        if (this.authService.isAuthenticated()) {
          this.fetchNotifications().subscribe();
        }
      }, 30000);
    }
  }

  fetchNotifications(): Observable<{ success: boolean; notifications?: any[]; unread?: number }> {
    const token = this.authService.getToken();
    if (!token) {
      this.notifications.set([]);
      this.unreadCount.set(0);
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
            this.notifications.set(mapped);
            this.unreadCount.set(Number(res.unread || 0));
          } else {
            this.notifications.set([]);
            this.unreadCount.set(0);
          }
        }),
        catchError(() => {
          return of({ success: false });
        })
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

          this.notifications.update((list) => {
            const exists = list.some((n) => String(n.id) === String(mapped.id));
            if (exists) return list;
            return [mapped, ...list];
          });
          this.unreadCount.update((c) => c + 1);
        } catch (e) {
          console.error('Failed to parse SSE notification:', e);
        }
      });

      this.eventSource.onerror = () => {
        // SSE will retry automatically
      };
    } catch (err) {
      console.warn('Could not initialize SSE stream:', err);
    }
  }

  disconnectStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

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

  markAsRead(id: number | string): void {
    const numId = Number(id);
    // Optimistic UI update
    this.notifications.update((list) =>
      list.map((item) => (item.id === id || item.id === numId ? { ...item, read: true } : item))
    );
    this.unreadCount.update((count) => Math.max(0, count - 1));

    const token = this.authService.getToken();
    if (!token || isNaN(numId)) return;

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    this.http
      .post(`${this.baseUrl}/api/notifications/read`, { id: numId }, { headers })
      .subscribe({ error: () => {} });
  }

  markAllAsRead(): void {
    // Optimistic UI update
    this.notifications.update((list) => list.map((item) => ({ ...item, read: true })));
    this.unreadCount.set(0);

    const token = this.authService.getToken();
    if (!token) return;

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    this.http
      .post(`${this.baseUrl}/api/notifications/readAll`, {}, { headers })
      .subscribe({ error: () => {} });
  }

  clearAll(): void {
    this.markAllAsRead();
    this.notifications.set([]);
  }

  addNotification(item: {
    title: string;
    message: string;
    type?: 'order' | 'offer' | 'info' | 'system';
    link?: string;
    orderId?: number | null;
  }): void {
    const newNotif: AppNotification = {
      id: `local-${Date.now()}`,
      title: item.title,
      message: item.message,
      time: 'Just now',
      timestamp: Date.now(),
      read: false,
      type: item.type || 'order',
      link: item.link,
      orderId: item.orderId,
    };
    this.notifications.update((list) => [newNotif, ...list]);
    this.unreadCount.update((c) => c + 1);
  }

  private mapBackendNotification(n: any): AppNotification {
    const createdAt = n.createdAt || n.CREATED_AT;
    const ts = createdAt ? new Date(createdAt).getTime() : Date.now();
    const typeStr = String(n.type || n.NOTIF_TYPE || 'info').toLowerCase();

    let notifType: 'order' | 'offer' | 'info' | 'system' = 'info';
    if (typeStr.includes('order')) notifType = 'order';
    else if (typeStr.includes('offer') || typeStr.includes('coupon')) notifType = 'offer';
    else if (typeStr.includes('system')) notifType = 'system';

    return {
      id: n.id ?? n.NOTIF_SLNO,
      title: n.title || n.TITLE || 'Notification',
      message: n.body || n.BODY || '',
      time: this.formatTimeAgo(ts),
      timestamp: ts,
      read: Boolean(n.isRead ?? n.IS_READ),
      type: notifType,
      link: n.link || n.LINK || (n.orderId || n.ORDER_DR ? '/profile' : undefined),
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
}
