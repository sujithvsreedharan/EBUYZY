import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, of, combineLatest } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { Order, OrderStatus, OrderStats } from '../models/order.model';
import { AdminProductService } from './admin-product.service';

/**
 * ============================================================================
 * ARCHITECTURAL RULE / BACKEND INTEGRATION NOTE:
 * ============================================================================
 * NEVER calculate prices, taxes, or delivery fees on the client for real orders!
 * The upcoming Node.js/Express + MSSQL backend MUST recompute item totals,
 * discount rules, delivery charges, and final order grand totals directly from the
 * Products table and Settings table inside a database transaction at checkout time.
 * Client-submitted line prices or order totals must be treated as untrusted.
 * ============================================================================
 */

@Injectable({
  providedIn: 'root'
})
export class AdminOrderService {
  private readonly productService = inject(AdminProductService);
  private readonly STORAGE_KEY = 'ebuyzy_admin_orders';

  // In-memory initial mock orders for EBUYZY (Kerala 3-5 km local deliveries)
  private readonly DEFAULT_ORDERS: Order[] = [
    {
      id: 'ord-801',
      orderNumber: 'EZ-2026-0801',
      customer: {
        name: 'Fathima Raheem',
        phone: '9847123450',
        address: 'Flat 4B, Olive Greens, Infopark Road, Kakkanad',
        landmark: 'Opposite Infopark Gate 2',
        coordinates: { lat: 10.0125, lng: 76.3562 }
      },
      items: [
        { productId: 'prod-101', productName: 'Palakkadan Matta Rice (Vadi)', unit: '5 kg', unitPrice: 295, quantity: 1, total: 295 },
        { productId: 'prod-102', productName: 'Fresh Mature Coconut', unit: '1 pc', unitPrice: 38, quantity: 2, total: 76 },
        { productId: 'prod-106', productName: 'Fresh Green Curry Leaves', unit: '1 bunch', unitPrice: 12, quantity: 1, total: 12 }
      ],
      subtotal: 383,
      deliveryFee: 25,
      total: 408,
      status: 'New',
      notes: 'Please ring the doorbell, gate code 1044',
      // Unassigned, ready for assignment
      createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(), // 18 mins ago
      updatedAt: new Date(Date.now() - 1000 * 60 * 18).toISOString()
    },
    {
      id: 'ord-802',
      orderNumber: 'EZ-2026-0802',
      customer: {
        name: 'Rahul Menokh',
        phone: '9447332211',
        address: 'House No. 12, Sunrise Gardens, Padamugal, Kakkanad',
        landmark: 'Near Padamugal Church',
        coordinates: { lat: 10.0210, lng: 76.3385 }
      },
      items: [
        { productId: 'prod-104', productName: 'Pure Cold-Pressed Coconut Oil', unit: '1 L', unitPrice: 310, quantity: 1, total: 310 },
        { productId: 'prod-103', productName: 'Raw Nendran Banana', unit: '1 kg', unitPrice: 64, quantity: 2, total: 128 },
        { productId: 'prod-105', productName: 'Fresh Tapioca (Nadan Kappa)', unit: '1 kg', unitPrice: 36, quantity: 2, total: 72 }
      ],
      subtotal: 510,
      deliveryFee: 25,
      total: 535,
      status: 'Confirmed',
      notes: 'Leave at front porch if not answering',
      assignedDeliveryPersonId: 'staff_del_01',
      assignedDeliveryPersonName: 'Amal Krishna',
      assignedDeliveryPersonPhone: '9847000444',
      assignedVehicle: 'Honda Activa (KL-07-CD-4521)',
      assignedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
    },
    {
      id: 'ord-803',
      orderNumber: 'EZ-2026-0803',
      customer: {
        name: 'Sunil George',
        phone: '9946554433',
        address: 'Villa 7, Asset Summit Suites, Vazhakkala',
        landmark: 'Near Vazhakkala Temple',
        coordinates: { lat: 10.0084, lng: 76.3267 }
      },
      items: [
        { productId: 'prod-108', productName: 'Milma Toned Milk', unit: '500 ml', unitPrice: 27, quantity: 4, total: 108 },
        { productId: 'prod-109', productName: 'Fresh Ginger', unit: '250 g', unitPrice: 48, quantity: 1, total: 48 },
        { productId: 'prod-107', productName: 'Wayanad Whole Black Pepper', unit: '200 g', unitPrice: 195, quantity: 1, total: 195 }
      ],
      subtotal: 351,
      deliveryFee: 25,
      total: 376,
      status: 'Out for delivery',
      assignedDeliveryPersonId: 'staff_del_01',
      assignedDeliveryPersonName: 'Amal Krishna',
      assignedDeliveryPersonPhone: '9847000444',
      assignedVehicle: 'Honda Activa (KL-07-CD-4521)',
      assignedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString()
    },
    {
      id: 'ord-804',
      orderNumber: 'EZ-2026-0804',
      customer: {
        name: 'Anjali Nair',
        phone: '9744118822',
        address: 'Apex Heights, Apt 8C, Edappally Toll, Kochi',
        landmark: 'Opposite Metro Pillar 382',
        coordinates: { lat: 10.0245, lng: 76.3120 }
      },
      items: [
        { productId: 'prod-101', productName: 'Palakkadan Matta Rice', unit: '5 kg', unitPrice: 295, quantity: 2, total: 590 },
        { productId: 'prod-110', productName: 'Idukki Green Cardamom', unit: '100 g', unitPrice: 275, quantity: 1, total: 275 }
      ],
      subtotal: 865,
      deliveryFee: 25,
      total: 890,
      status: 'Delivered',
      assignedDeliveryPersonId: 'staff_del_01',
      assignedDeliveryPersonName: 'Amal Krishna',
      assignedDeliveryPersonPhone: '9847000444',
      assignedVehicle: 'Honda Activa (KL-07-CD-4521)',
      assignedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 70).toISOString()
    },
    {
      id: 'ord-805',
      orderNumber: 'EZ-2026-0805',
      customer: {
        name: 'Deepak Kurian',
        phone: '9846003311',
        address: 'B-14, Green Valley Enclave, Chittethukara, Kakkanad',
        landmark: 'Near Chittethukara Juma Masjid',
        coordinates: { lat: 10.0031, lng: 76.3615 }
      },
      items: [
        { productId: 'prod-103', productName: 'Raw Nendran Banana', unit: '1 kg', unitPrice: 64, quantity: 3, total: 192 },
        { productId: 'prod-104', productName: 'Pure Cold-Pressed Coconut Oil', unit: '1 L', unitPrice: 310, quantity: 1, total: 310 }
      ],
      subtotal: 502,
      deliveryFee: 25,
      total: 527,
      status: 'Cancelled',
      notes: 'Customer requested cancellation due to wrong address entered',
      createdAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 210).toISOString()
    },
    {
      id: 'ord-806',
      orderNumber: 'EZ-2026-0806',
      customer: {
        name: 'Parvathy Warrier',
        phone: '9895012399',
        address: 'Haritha Nagar 3rd Cross, Palarivattom, Kochi',
        landmark: 'Behind Medical Centre',
        coordinates: { lat: 10.0055, lng: 76.3078 }
      },
      items: [
        { productId: 'prod-102', productName: 'Fresh Mature Coconut', unit: '1 pc', unitPrice: 38, quantity: 4, total: 152 },
        { productId: 'prod-108', productName: 'Milma Toned Milk', unit: '500 ml', unitPrice: 27, quantity: 2, total: 54 },
        { productId: 'prod-105', productName: 'Fresh Tapioca (Nadan Kappa)', unit: '1 kg', unitPrice: 36, quantity: 3, total: 108 }
      ],
      subtotal: 314,
      deliveryFee: 25,
      total: 339,
      status: 'New',
      notes: 'Call before arriving',
      createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString()
    },
    {
      id: 'ord-807',
      orderNumber: 'EZ-2026-0807',
      customer: {
        name: 'Mathews Thomas',
        phone: '9745112233',
        address: 'Tower C - 1102, Purva Eternity, Kakkanad',
        landmark: 'Opposite Rajagiri College',
        coordinates: { lat: 10.0162, lng: 76.3688 }
      },
      items: [
        { productId: 'prod-101', productName: 'Palakkadan Matta Rice', unit: '5 kg', unitPrice: 295, quantity: 1, total: 295 },
        { productId: 'prod-107', productName: 'Wayanad Whole Black Pepper', unit: '200 g', unitPrice: 195, quantity: 2, total: 390 }
      ],
      subtotal: 685,
      deliveryFee: 25,
      total: 710,
      status: 'Out for delivery',
      assignedDeliveryPersonId: 'staff_del_02',
      assignedDeliveryPersonName: 'Vishnu Prasad',
      assignedDeliveryPersonPhone: '9847000555',
      assignedVehicle: 'TVS Jupiter (KL-07-EF-8822)',
      assignedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString()
    }
  ];

  private readonly ordersSubject = new BehaviorSubject<Order[]>(this.loadFromStorage());

  private loadFromStorage(): Order[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
    return this.DEFAULT_ORDERS;
  }

  private persist(orders: Order[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(orders));
    } catch {
      // Ignore
    }
    this.ordersSubject.next(orders);
  }

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

  updateOrderStatus(id: string, newStatus: OrderStatus): Observable<Order> {
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
    // If order was still 'New', advancing assignment automatically moves it to 'Confirmed'
    const newStatus: OrderStatus = currentOrder.status === 'New' ? 'Confirmed' : currentOrder.status;

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

        const pendingOrders = orders.filter(o => o.status === 'New' || o.status === 'Confirmed').length;
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
