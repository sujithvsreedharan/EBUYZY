import { Injectable, computed, signal } from '@angular/core';
import { AdminPagePermission, PERMISSION_DEFINITIONS, StaffRecord, StaffType, SubAdminRecord } from '../models/sub-admin.model';

@Injectable({
  providedIn: 'root'
})
export class SubAdminService {
  private readonly STORAGE_KEY = 'ebuyzy_staff_records';
  private readonly LEGACY_STORAGE_KEY = 'ebuyzy_sub_admins';

  // Initial seeded staff team: 2 Sub-Admins and 2 Delivery Partners
  private readonly DEFAULT_STAFFS: StaffRecord[] = [
    {
      id: 'staff_sub_01',
      type: 'sub_admin',
      name: 'Rajesh Nair',
      email: 'orders@ebuyzy.in',
      phone: '9847000222',
      password: 'order123',
      roleTitle: 'Order Dispatch Executive',
      permissions: ['orders', 'dashboard'],
      isActive: true,
      createdAt: '2026-11-01T10:00:00.000Z'
    },
    {
      id: 'staff_sub_02',
      type: 'sub_admin',
      name: 'Anjali Menon',
      email: 'inventory@ebuyzy.in',
      phone: '9847000333',
      password: 'order123',
      roleTitle: 'Inventory & Catalog Manager',
      permissions: ['products', 'categories', 'dashboard'],
      isActive: true,
      createdAt: '2026-11-03T11:30:00.000Z'
    },
    {
      id: 'staff_del_01',
      type: 'delivery_person',
      name: 'Amal Krishna',
      email: 'delivery@ebuyzy.in',
      phone: '9847000444',
      password: 'delivery123',
      roleTitle: 'Kakkanad Express Delivery Partner',
      permissions: ['assigned_orders'],
      vehicleType: 'Honda Activa (Scooter)',
      vehicleNumber: 'KL-07-CD-4521',
      zone: 'Kakkanad & Infopark',
      isActive: true,
      createdAt: '2026-11-04T09:00:00.000Z'
    },
    {
      id: 'staff_del_02',
      type: 'delivery_person',
      name: 'Vishnu Prasad',
      email: 'vishnu@ebuyzy.in',
      phone: '9847000555',
      password: 'delivery123',
      roleTitle: 'Padamugal Area Delivery Partner',
      permissions: ['assigned_orders'],
      vehicleType: 'TVS Jupiter (Scooter)',
      vehicleNumber: 'KL-07-EF-8822',
      zone: 'Padamugal & Palarivattom',
      isActive: true,
      createdAt: '2026-11-05T14:15:00.000Z'
    }
  ];

  // Primary signal containing all staff members
  readonly staffs = signal<StaffRecord[]>(this.loadFromStorage());

  // Backward-compatibility signal alias
  readonly subAdmins = computed(() => this.staffs());

  // Segregated computed signals
  readonly subAdminList = computed(() => this.staffs().filter((s) => s.type === 'sub_admin'));
  readonly deliveryPersons = computed(() => this.staffs().filter((s) => s.type === 'delivery_person'));
  readonly activeDeliveryPersons = computed(() => this.deliveryPersons().filter((s) => s.isActive));

  constructor() {
    // If neither storage key is set, initialize with defaults
    if (!localStorage.getItem(this.STORAGE_KEY) && !localStorage.getItem(this.LEGACY_STORAGE_KEY)) {
      this.persist(this.DEFAULT_STAFFS);
    }
  }

  private loadFromStorage(): StaffRecord[] {
    try {
      // First check modern staffs key
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const parsed: StaffRecord[] = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Ensure all have type set
          return parsed.map((item) => ({
            ...item,
            type: item.type || (item.roleTitle?.toLowerCase().includes('delivery') ? 'delivery_person' : 'sub_admin')
          }));
        }
      }

      // Check legacy sub-admins key
      const legacyData = localStorage.getItem(this.LEGACY_STORAGE_KEY);
      if (legacyData) {
        const parsed: StaffRecord[] = JSON.parse(legacyData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge legacy sub-admins with default delivery partners
          const merged: StaffRecord[] = [
            ...parsed.map((p) => ({ ...p, type: 'sub_admin' as StaffType })),
            ...this.DEFAULT_STAFFS.filter((s) => s.type === 'delivery_person')
          ];
          this.persist(merged);
          return merged;
        }
      }
    } catch {
      // Fallback
    }
    return this.DEFAULT_STAFFS;
  }

  private persist(records: StaffRecord[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
      // Also sync legacy key for backward compatibility
      localStorage.setItem(this.LEGACY_STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Ignore storage errors
    }
    this.staffs.set(records);
  }

  createStaff(data: {
    type?: StaffType;
    name: string;
    email: string;
    phone: string;
    password?: string;
    roleTitle?: string;
    permissions?: AdminPagePermission[];
    vehicleType?: string;
    vehicleNumber?: string;
    zone?: string;
    isActive?: boolean;
  }): StaffRecord {
    const current = this.staffs();
    const type: StaffType = data.type || 'sub_admin';

    const defaultRole = type === 'delivery_person' ? 'Kakkanad Delivery Partner' : 'Sub-Admin';
    const permissions: AdminPagePermission[] =
      type === 'delivery_person'
        ? ['assigned_orders']
        : data.permissions && data.permissions.length > 0
        ? [...data.permissions]
        : ['orders', 'dashboard'];

    const newRecord: StaffRecord = {
      id: (type === 'delivery_person' ? 'staff_del_' : 'staff_sub_') + Date.now(),
      type,
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim(),
      password: data.password?.trim() || (type === 'delivery_person' ? 'delivery123' : 'order123'),
      roleTitle: data.roleTitle?.trim() || defaultRole,
      permissions,
      vehicleType: data.vehicleType?.trim() || (type === 'delivery_person' ? 'Motorcycle / Scooter' : undefined),
      vehicleNumber: data.vehicleNumber?.trim(),
      zone: data.zone?.trim() || (type === 'delivery_person' ? 'Kakkanad, Kochi' : undefined),
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: new Date().toISOString()
    };

    const updated = [newRecord, ...current];
    this.persist(updated);
    return newRecord;
  }

  // Backward compatibility alias for createSubAdmin
  createSubAdmin(data: {
    name: string;
    email: string;
    phone: string;
    password?: string;
    roleTitle: string;
    permissions: AdminPagePermission[];
    isActive?: boolean;
  }): SubAdminRecord {
    return this.createStaff({
      ...data,
      type: 'sub_admin'
    });
  }

  updateStaff(id: string, updates: Partial<StaffRecord>): void {
    const current = this.staffs();
    const updated = current.map((staff) => {
      if (staff.id === id) {
        return {
          ...staff,
          ...updates,
          email: updates.email ? updates.email.trim().toLowerCase() : staff.email
        };
      }
      return staff;
    });
    this.persist(updated);
  }

  // Backward compatibility alias
  updateSubAdmin(id: string, updates: Partial<SubAdminRecord>): void {
    this.updateStaff(id, updates);
  }

  deleteStaff(id: string): void {
    const current = this.staffs();
    const updated = current.filter((staff) => staff.id !== id);
    this.persist(updated);
  }

  // Backward compatibility alias
  deleteSubAdmin(id: string): void {
    this.deleteStaff(id);
  }

  toggleStatus(id: string): void {
    const current = this.staffs();
    const updated = current.map((staff) => {
      if (staff.id === id) {
        return { ...staff, isActive: !staff.isActive };
      }
      return staff;
    });
    this.persist(updated);
  }

  findStaffByCredentials(identifier: string, password: string): StaffRecord | undefined {
    const cleanId = identifier.trim().toLowerCase();
    const cleanDigits = identifier.replace(/\D/g, '');
    const current = this.staffs();

    return current.find((staff) => {
      const matchEmail = staff.email.toLowerCase() === cleanId;
      const matchPhone = cleanDigits && staff.phone.replace(/\D/g, '') === cleanDigits;
      const matchPassword = !staff.password || staff.password === password;
      return (matchEmail || matchPhone) && matchPassword;
    });
  }

  // Backward compatibility alias
  findSubAdminByCredentials(identifier: string, password: string): SubAdminRecord | undefined {
    return this.findStaffByCredentials(identifier, password);
  }

  canAccessRoute(permissions: AdminPagePermission[] | undefined, url: string): boolean {
    if (!permissions || permissions.length === 0) {
      return false;
    }

    const cleanUrl = url.split('?')[0].split('#')[0];

    // Assigned Orders route for delivery partners
    if (cleanUrl.startsWith('/admin/assigned-orders')) {
      return permissions.includes('assigned_orders') || permissions.includes('orders');
    }

    // Check each permission against known routes
    for (const def of PERMISSION_DEFINITIONS) {
      if (cleanUrl.startsWith(def.route)) {
        return permissions.includes(def.id);
      }
    }

    // Default root admin
    if (cleanUrl === '/admin' || cleanUrl === '/admin/') {
      return true;
    }

    return false;
  }

  getFirstAllowedRoute(permissions: AdminPagePermission[] | undefined): string {
    if (!permissions || permissions.length === 0) {
      return '/admin/login';
    }

    // If delivery person with assigned_orders, direct immediately to assigned-orders
    if (permissions.includes('assigned_orders') && !permissions.includes('orders') && !permissions.includes('dashboard')) {
      return '/admin/assigned-orders';
    }

    // Priority order for sub-admins: orders > dashboard > products > categories > customers > settings > assigned-orders
    const priorityOrder: AdminPagePermission[] = [
      'orders',
      'dashboard',
      'products',
      'categories',
      'customers',
      'settings',
      'assigned_orders'
    ];

    for (const perm of priorityOrder) {
      if (permissions.includes(perm)) {
        if (perm === 'assigned_orders') {
          return '/admin/assigned-orders';
        }
        const found = PERMISSION_DEFINITIONS.find((p) => p.id === perm);
        if (found) {
          return found.route;
        }
      }
    }

    return '/admin/orders';
  }
}
