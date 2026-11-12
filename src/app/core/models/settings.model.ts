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
}

