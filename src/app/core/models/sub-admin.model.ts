export type AdminPagePermission =
  | 'dashboard'
  | 'orders'
  | 'products'
  | 'categories'
  | 'customers'
  | 'settings'
  | 'staffs'
  | 'subadmins'
  | 'assigned_orders';

export type StaffType = 'sub_admin' | 'delivery_person';

export interface PermissionDefinition {
  id: AdminPagePermission;
  label: string;
  route: string;
  icon: string;
  description: string;
  badge?: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    id: 'orders',
    label: 'Order Management',
    route: '/admin/orders',
    icon: '📦',
    description: 'Process Kerala customer orders, assign delivery partners, update delivery statuses, call customer & view Google Maps coordinates.',
    badge: 'Core Operations'
  },
  {
    id: 'dashboard',
    label: 'Dashboard Overview',
    route: '/admin/dashboard',
    icon: '📊',
    description: 'Monitor daily sales revenue, active delivery pipeline, and Kerala produce low-stock alerts.',
    badge: 'Analytics'
  },
  {
    id: 'products',
    label: 'Products & Inventory',
    route: '/admin/products',
    icon: '🛒',
    description: 'Catalog items, stock quantities, price updates (₹ INR), and in-store availability switch.',
    badge: 'Inventory'
  },
  {
    id: 'categories',
    label: 'Product Categories',
    route: '/admin/categories',
    icon: '🏷️',
    description: 'Manage store produce departments (Palakkadan Matta Rice, Fresh Vegetables, Coconut Oil, Pantry).',
    badge: 'Catalog'
  },
  {
    id: 'customers',
    label: 'Customer Directory',
    route: '/admin/customers',
    icon: '👥',
    description: 'View customer accounts, delivery addresses across Kakkanad/Kochi, and lifetime order histories.',
    badge: 'CRM'
  },
  {
    id: 'settings',
    label: 'Store Settings',
    route: '/admin/settings',
    icon: '⚙️',
    description: 'Shop open/closed status, 3-5 km express delivery radius, delivery fee, and WhatsApp hotline number.',
    badge: 'Config'
  }
];

export interface StaffRecord {
  id: string;
  type: StaffType; // 'sub_admin' | 'delivery_person'
  name: string;
  email: string;
  phone: string;
  password?: string;
  roleTitle: string; // e.g. "Order Dispatch Executive", "Kakkanad Express Delivery Partner"
  permissions: AdminPagePermission[];
  vehicleType?: string; // e.g. "Honda Activa (Scooter)", "TVS Jupiter", "Electric Bike", "Delivery Van"
  vehicleNumber?: string; // e.g. "KL-07-CD-4521"
  zone?: string; // e.g. "Kakkanad / Infopark", "Padamugal / Palarivattom"
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

// Backward compatibility alias
export type SubAdminRecord = StaffRecord;
