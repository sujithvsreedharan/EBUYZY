import { Injectable, effect, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, of, combineLatest } from 'rxjs';
import { delay, map, tap } from 'rxjs/operators';
import { Order, OrderStatus, OrderStats } from '../models/order.model';
import { AdminProductService } from './admin-product.service';
import { AuthService } from './auth.service';
import { apiUrl } from '../../app.constant';

/**
 * ============================================================================
 * ARCHITECTURAL RULE / BACKEND INTEGRATION NOTE:
 * ============================================================================
 * NEVER calculate prices, taxes, or delivery fees on the client for real orders!
 * The Node.js/Express + MSSQL backend recomputes item totals, discount rules,
 * delivery charges, and final order grand totals directly from the database.
 * ============================================================================
 */

@Injectable({
  providedIn: 'root'
})
export class AdminOrderService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly baseUrl = apiUrl;
  private readonly productService = inject(AdminProductService);
  private readonly STORAGE_KEY = 'ebuyzy_admin_orders';

  // No demo orders - live clean state
  private readonly DEFAULT_ORDERS: Order[] = [];

  private readonly ordersSubject = new BehaviorSubject<Order[]>(this.loadFromStorage());

  constructor() {
    this.clearLegacyOrderStorage();
    effect(() => {
      const user = this.authService.currentUser();
      if (!user) {
        this.ordersSubject.next([]);
      }
    });
    if (this.authService.isAuthenticated()) {
      this.fetchAdminOrders().subscribe({ error: () => { } });
    }
  }

  private clearLegacyOrderStorage(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch {
      // Ignore
    }
  }

  private loadFromStorage(): Order[] {
    return [];
  }

  private persist(orders: Order[]): void {
    this.ordersSubject.next(orders);
  }

  clearAllDemoOrders(): void {
    const clean = this.ordersSubject.value.filter(o => !String(o.id || '').startsWith('ord-80'));
    this.persist(clean);
  }

  private mapBackendStatusToFrontend(status: string): OrderStatus {
    const s = (status || '').toUpperCase().trim();
    switch (s) {
      case 'PENDING':
      case 'NEW':
        return 'New';
      case 'CONFIRMED':
        return 'Confirmed';
      case 'PACKING':
      case 'PREPARING':
        return 'Packing';
      case 'PACKED':
        return 'Packed';
      case 'OUT_FOR_DELIVERY':
      case 'DISPATCHED':
        return 'Out for delivery';
      case 'DELIVERED':
        return 'Delivered';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return 'New';
    }
  }

  mapBackendAdminOrder(o: any): Order {
    const items = Array.isArray(o.items)
      ? o.items.map((i: any) => ({
        productId: String(i.productId || i.product_dr || i.orderItemId || Math.random()),
        productName: i.productName || i.name || 'Product',
        unit: i.unit || 'unit',
        unitPrice: Number(i.unitPrice ?? i.price ?? 0),
        quantity: Number(i.quantity ?? 1),
        total: Number(i.lineTotal ?? i.total ?? ((Number(i.unitPrice || 0)) * (Number(i.quantity || 1))))
      }))
      : [];

    return {
      id: String(o.orderId || o.orderCode),
      orderNumber: o.orderCode || `ORD-${o.orderId}`,
      customer: {
        name: o.customerName || 'Customer',
        phone: o.customerMobile || '',
        address: o.deliveryAddress || ''
      },
      items,
      subtotal: Number(o.subtotal ?? o.totalAmount ?? 0),
      deliveryFee: Number(o.deliveryCharge ?? 0),
      total: Number(o.totalAmount ?? o.subtotal ?? 0),
      status: this.mapBackendStatusToFrontend(o.orderStatus),
      notes: o.note || o.orderNote || '',
      assignedDeliveryPersonName: o.deliveryStaffName,
      assignedDeliveryPersonPhone: o.deliveryStaffMobile,
      createdAt: o.orderedAt || new Date().toISOString(),
      updatedAt: o.updatedAt || o.orderedAt || new Date().toISOString()
    };
  }

  addPlacedOrder(order: Order): void {
    const list = this.ordersSubject.value;
    const exists = list.some(o => o.id === order.id || o.orderNumber === order.orderNumber);
    if (!exists) {
      const nextList = [order, ...list];
      this.persist(nextList);
    }
  }

  /**
   * Real backend Order Status Update API: POST /api/admin/orders/status
   */
  updateOrderStatusApi(orderId: number | string, newStatus: string, note?: string): Observable<{ success: boolean; order?: any; message?: string }> {
    const token = this.authService.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    const numericId = Number(orderId);

    return this.http.post<{ success: boolean; order?: any; message?: string }>(
      `${this.baseUrl}/api/admin/orders/status`,
      { orderId: numericId, status: newStatus, note: note || undefined },
      { headers }
    );
  }

  /**
   * Real backend Customer Cancel Order API: POST /api/orders/cancel
   */
  cancelOrderApi(orderId: number | string, reason?: string): Observable<{ success: boolean; order?: any; message?: string }> {
    const token = this.authService.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    const numericId = Number(orderId);

    return this.http.post<{ success: boolean; order?: any; message?: string }>(
      `${this.baseUrl}/api/orders/cancel`,
      { orderId: numericId, reason: reason || undefined },
      { headers }
    );
  }

  /**
   * Fetch all real admin orders from backend: POST /api/admin/orders
   */
  fetchAdminOrders(): Observable<{ success: boolean; orders: any[]; pagination: any }> {
    const token = this.authService.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;

    return this.http.post<{ success: boolean; orders: any[]; pagination: any }>(
      `${this.baseUrl}/api/admin/orders`,
      { pageNumber: 1, pageSize: 100 },
      { headers }
    ).pipe(
      tap((res) => {
        if (res.success && Array.isArray(res.orders)) {
          const mapped: Order[] = res.orders.map((o: any) => this.mapBackendAdminOrder(o));
          this.ordersSubject.next(mapped);
          this.persist(mapped);
        } else {
          this.ordersSubject.next([]);
          this.persist([]);
        }
      })
    );
  }

  // private persist(orders: Order[]): void {
  //   try {
  //     localStorage.setItem(this.STORAGE_KEY, JSON.stringify(orders));
  //   } catch {
  //     // Ignore
  //   }
  //   this.ordersSubject.next(orders);
  // }

  createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Observable<Order> {
    const now = new Date().toISOString();
    const createdOrder: Order = {
      ...orderData,
      id: 'ord-' + Date.now(),
      createdAt: now,
      updatedAt: now
    };

    const nextList = [createdOrder, ...this.ordersSubject.value];
    this.persist(nextList);
    return of(createdOrder).pipe(delay(200));
  }

  /**
   * Real backend Order Placement API: POST /api/orders/place
   */
  placeOrderApi(payload: {
    addressId?: number | null;
    customerName?: string | null;
    customerMobile?: string | null;
    deliveryAddress?: string | null;
    note?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    lattitude?: number | string | null;
    logitude?: number | string | null;
  }): Observable<{ success: boolean; order?: any; items?: any[]; message?: string }> {
    const token = this.authService.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;

    return this.http.post<{ success: boolean; order?: any; items?: any[]; message?: string }>(
      `${this.baseUrl}/api/orders/place`,
      payload,
      { headers }
    );
  }

  /**
   * Fetch customer's real orders: POST /api/me/orders
   */
  getMyOrders(params: { pageNumber?: number; pageSize?: number; filter?: string; status?: string; search?: string } = {}): Observable<{
    success: boolean;
    counts?: { allCount: number; activeCount: number; deliveredCount: number };
    orders: any[];
    pagination?: any;
    pageNumber?: number;
    pageSize?: number;
  }> {
    const token = this.authService.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;

    const rawFilter = (params.filter || params.status || 'ALL').toUpperCase();
    const filter = ['ALL', 'ACTIVE', 'DELIVERED'].includes(rawFilter) ? rawFilter : 'ALL';

    return this.http.post<{
      success: boolean;
      counts?: { allCount: number; activeCount: number; deliveredCount: number };
      orders: any[];
      pagination?: any;
      pageNumber?: number;
      pageSize?: number;
    }>(
      `${this.baseUrl}/api/me/orders`,
      {
        filter,
        search: params.search || undefined,
        pageNumber: params.pageNumber || 1,
        pageSize: params.pageSize || 50
      },
      { headers }
    );
  }

  /**
   * Fetch order details: POST /api/orders/details
   */
  getOrderDetailsApi(orderId: number | string): Observable<{ success: boolean; order: any; items: any[]; history: any[] }> {
    const token = this.authService.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;

    const numericId = Number(orderId);
    const body = !isNaN(numericId) && numericId > 0
      ? { orderId: numericId }
      : { orderCode: String(orderId) };

    return this.http.post<{ success: boolean; order: any; items: any[]; history: any[] }>(
      `${this.baseUrl}/api/orders/details`,
      body,
      { headers }
    );
  }

  getOrders(): Observable<Order[]> {
    return this.ordersSubject.asObservable().pipe(delay(150));
  }

  getCustomerOrders(criteria?: { phone?: string; name?: string }): Observable<Order[]> {
    return this.ordersSubject.asObservable().pipe(
      delay(150),
      map((orders) => {
        if (!criteria || (!criteria.phone && !criteria.name)) {
          return orders;
        }

        const cleanPhone = criteria.phone ? criteria.phone.replace(/\D/g, '') : '';
        const cleanName = criteria.name ? criteria.name.trim().toLowerCase() : '';

        const matched = orders.filter((o) => {
          const orderPhone = o.customer.phone ? o.customer.phone.replace(/\D/g, '') : '';
          const phoneMatch = Boolean(
            cleanPhone &&
            orderPhone &&
            (orderPhone === cleanPhone || orderPhone.endsWith(cleanPhone) || cleanPhone.endsWith(orderPhone))
          );
          const nameMatch = Boolean(
            cleanName && o.customer.name && o.customer.name.toLowerCase().includes(cleanName)
          );
          return phoneMatch || nameMatch;
        });

        return matched;
      })
    );
  }

  getRecentOrders(limit = 5): Observable<Order[]> {
    return this.ordersSubject.asObservable().pipe(
      delay(150),
      map(orders => orders.slice(0, limit))
    );
  }

  getOrderById(id: string): Observable<Order | undefined> {
    return this.ordersSubject.asObservable().pipe(
      delay(150),
      map(orders => orders.find(o => o.id === id || o.orderNumber === id))
    );
  }

  updateOrderStatus(id: string, newStatus: OrderStatus, note?: string): Observable<Order> {
    const numericId = Number(id);
    const statusMap: Record<OrderStatus, string> = {
      'New': 'PENDING',
      'Confirmed': 'CONFIRMED',
      'Packing': 'PREPARING',
      'Packed': 'PREPARING',
      'Out for delivery': 'OUT_FOR_DELIVERY',
      'Delivered': 'DELIVERED',
      'Cancelled': 'CANCELLED'
    };
    const dbStatus = statusMap[newStatus] || newStatus;

    if (!isNaN(numericId) && numericId > 0 && this.authService.isAuthenticated()) {
      return this.updateOrderStatusApi(numericId, dbStatus, note).pipe(
        map(() => {
          const list = this.ordersSubject.value;
          const index = list.findIndex(o => o.id === id || o.orderNumber === id);
          const updated: Order = index !== -1 ? {
            ...list[index],
            status: newStatus,
            updatedAt: new Date().toISOString()
          } : {
            id: String(numericId),
            orderNumber: `ORD-${numericId}`,
            customer: { name: '', phone: '', address: '' },
            items: [],
            subtotal: 0,
            deliveryFee: 0,
            total: 0,
            status: newStatus,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          if (index !== -1) {
            const nextList = [...list];
            nextList[index] = updated;
            this.persist(nextList);
          }
          return updated;
        })
      );
    }

    const list = this.ordersSubject.value;
    const index = list.findIndex(o => o.id === id || o.orderNumber === id);
    if (index === -1) {
      throw new Error(`Order ${id} not found`);
    }

    const updated: Order = {
      ...list[index],
      status: newStatus,
      updatedAt: new Date().toISOString()
    };

    const nextList = [...list];
    nextList[index] = updated;
    this.persist(nextList);

    return of(updated).pipe(delay(150));
  }

  /**
   * Assign a Delivery Partner to an order
   */
  assignDeliveryPartner(
    orderId: string,
    deliveryPersonId: string,
    deliveryPersonName: string,
    deliveryPersonPhone?: string,
    assignedVehicle?: string
  ): Observable<Order> {
    const list = this.ordersSubject.value;
    const index = list.findIndex(o => o.id === orderId || o.orderNumber === orderId);
    if (index === -1) {
      throw new Error(`Order ${orderId} not found`);
    }

    const currentOrder = list[index];
    // Keep current order workflow status upon assignment
    const newStatus: OrderStatus = currentOrder.status;

    const updated: Order = {
      ...currentOrder,
      status: newStatus,
      assignedDeliveryPersonId: deliveryPersonId,
      assignedDeliveryPersonName: deliveryPersonName,
      assignedDeliveryPersonPhone: deliveryPersonPhone,
      assignedVehicle: assignedVehicle,
      assignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const nextList = [...list];
    nextList[index] = updated;
    this.persist(nextList);

    return of(updated).pipe(delay(150));
  }

  /**
   * Unassign Delivery Partner from an order
   */
  unassignDeliveryPartner(orderId: string): Observable<Order> {
    const list = this.ordersSubject.value;
    const index = list.findIndex(o => o.id === orderId || o.orderNumber === orderId);
    if (index === -1) {
      throw new Error(`Order ${orderId} not found`);
    }

    const updated: Order = {
      ...list[index],
      assignedDeliveryPersonId: undefined,
      assignedDeliveryPersonName: undefined,
      assignedDeliveryPersonPhone: undefined,
      assignedVehicle: undefined,
      assignedAt: undefined,
      updatedAt: new Date().toISOString()
    };

    const nextList = [...list];
    nextList[index] = updated;
    this.persist(nextList);

    return of(updated).pipe(delay(150));
  }

  /**
   * Query orders assigned to a specific delivery partner
   */
  getAssignedOrders(deliveryPersonId: string): Observable<Order[]> {
    return this.ordersSubject.asObservable().pipe(
      delay(150),
      map((orders) =>
        orders.filter(
          (o) =>
            o.assignedDeliveryPersonId === deliveryPersonId ||
            (o.assignedDeliveryPersonName &&
              o.assignedDeliveryPersonName.toLowerCase() === deliveryPersonId.toLowerCase())
        )
      )
    );
  }

  /**
   * Aggregates stats for the admin dashboard:
   * - orders today
   * - pending orders (New + Confirmed)
   * - revenue today (sum of valid orders today)
   * - low-stock count (< 10 units)
   */
  getTodayStats(): Observable<OrderStats> {
    return combineLatest([
      this.ordersSubject.asObservable(),
      this.productService.getLowStockProducts(10)
    ]).pipe(
      map(([orders, lowStock]) => {
        const todayStr = new Date().toDateString();
        const ordersTodayList = orders.filter(o => new Date(o.createdAt).toDateString() === todayStr);

        const pendingOrders = orders.filter(
          o => o.status === 'New' || o.status === 'Confirmed' || o.status === 'Packing' || o.status === 'Packed'
        ).length;
        const revenueToday = ordersTodayList
          .filter(o => o.status !== 'Cancelled')
          .reduce((acc, curr) => acc + curr.total, 0);

        return {
          ordersToday: ordersTodayList.length,
          pendingOrders,
          revenueToday,
          lowStockCount: lowStock.length
        };
      })
    );
  }
}
