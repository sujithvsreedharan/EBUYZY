export type OrderStatus =
  | 'New'
  | 'Confirmed'
  | 'Out for delivery'
  | 'Delivered'
  | 'Cancelled';

export interface OrderItem {
  productId: string;
  productName: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface OrderCustomer {
  name: string;
  phone: string; // 10-digit Indian phone (e.g. "9847012345")
  address: string;
  landmark?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface Order {
  id: string;
  orderNumber: string;
  customer: OrderCustomer;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount?: number;
  couponCode?: string;
  total: number;
  status: OrderStatus;
  notes?: string;
  // Delivery Partner assignment
  assignedDeliveryPersonId?: string;
  assignedDeliveryPersonName?: string;
  assignedDeliveryPersonPhone?: string;
  assignedVehicle?: string;
  assignedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderStats {
  ordersToday: number;
  pendingOrders: number;
  revenueToday: number;
  lowStockCount: number;
}
