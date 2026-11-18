export interface StoreInfo {
  store_id: number;
  store_name: string;
  address: string;
  mob: string;
  email: string;
  open: string;
  close: string;
  days: number;
  logo: string;
  lattitude: string;
  longitude: string;
  radius: number;
  DISTANCE_KM: number;
}

export interface DeliveryInfo {
  fixed_charge: number;
  min_order_price: number;
  min_time: number;
  'max-time': number;
  area: string | null;
  offer_charge: number;
}

export interface StoreDetailsResponse {
  success: boolean;
  status: number; // 1 = Available, 0 = Unavailable
  message: string;
  description: string;
  storeDetails: StoreInfo[];
  deliveryDetails: DeliveryInfo[];
}

export interface ShopSettings {
  shopName: string;
  shopLatitude: number;
  shopLongitude: number;
  deliveryRadiusKm: number;
  deliveryFee: number;
  minOrderAmount: number;
  whatsappNumber: string; // Indian WhatsApp format (e.g., "919847012345")
  isOpen: boolean;
  shopAddress?: string;
  distanceKm?: number;
  minDeliveryTime?: number;
  maxDeliveryTime?: number;
}

