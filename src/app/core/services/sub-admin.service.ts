import { Injectable, computed, signal } from '@angular/core';
import { AdminPagePermission, PERMISSION_DEFINITIONS, StaffRecord, StaffType, SubAdminRecord } from '../models/sub-admin.model';

@Injectable({
  providedIn: 'root'
})
export class SubAdminService {
  private readonly STORAGE_KEY = 'ebuyzy_staff_records';
  private readonly LEGACY_STORAGE_KEY = 'ebuyzy_sub_admins';

  // Primary signal containing all staff members (loaded from backend API)
  readonly staffs = signal<StaffRecord[]>(this.loadFromStorage());

  // Backward-compatibility signal alias
  readonly subAdmins = computed(() => this.staffs());

  // Segregated computed signals
  readonly subAdminList = computed(() => this.staffs().filter((s) => s.type === 'sub_admin'));
  readonly deliveryPersons = computed(() => this.staffs().filter((s) => s.type === 'delivery_person'));
  readonly activeDeliveryPersons = computed(() => this.deliveryPersons().filter((s) => s.isActive));

  private stripSensitiveFields(records: StaffRecord[]): StaffRecord[] {
    return records.map(({ password: _password, ...rest }) => rest);
  }

  private loadFromStorage(): StaffRecord[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const parsed: StaffRecord[] = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = this.stripSensitiveFields(parsed).map((item) => ({
            ...item,
            type: item.type || (item.roleTitle?.toLowerCase().includes('delivery') ? 'delivery_person' : 'sub_admin')
          }));
          // Re-persist without any legacy plaintext password fields
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sanitized));
          localStorage.removeItem(this.LEGACY_STORAGE_KEY);
          return sanitized;
        }
      }
    } catch {
      // Fallback
    }
    return [];
  }

  private persist(records: StaffRecord[]): void {
    const sanitized = this.stripSensitiveFields(records);
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      // Ignore storage errors
    }
    this.staffs.set(sanitized);
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
    const { password: _ignoredPassword, ...safeUpdates } = updates;
    const updated = current.map((staff) => {
      if (staff.id === id) {
        return {
          ...staff,
          ...safeUpdates,
          email: safeUpdates.email ? safeUpdates.email.trim().toLowerCase() : staff.email
        };
      }
      return staff;
    });
    this.persist(updated);
  }

  updateSubAdmin(id: string, updates: Partial<SubAdminRecord>): void {
    this.updateStaff(id, updates);
  }

  deleteStaff(id: string): void {
    const current = this.staffs();
    const updated = current.filter((staff) => staff.id !== id);
    this.persist(updated);
  }

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

  canAccessRoute(permissions: AdminPagePermission[] | undefined, url: string): boolean {
    if (!permissions || permissions.length === 0) {
      return false;
    }

    const cleanUrl = url.split('?')[0].split('#')[0];

    if (cleanUrl.startsWith('/admin/assigned-orders')) {
      return permissions.includes('assigned_orders') || permissions.includes('orders');
    }

    for (const def of PERMISSION_DEFINITIONS) {
      if (cleanUrl.startsWith(def.route)) {
        return permissions.includes(def.id);
      }
    }

    if (cleanUrl === '/admin' || cleanUrl === '/admin/') {
      return true;
    }

    return false;
  }

  getFirstAllowedRoute(permissions: AdminPagePermission[] | undefined): string {
    if (!permissions || permissions.length === 0) {
      return '/admin/login';
    }

    if (permissions.includes('assigned_orders') && !permissions.includes('orders') && !permissions.includes('dashboard')) {
      return '/admin/assigned-orders';
    }

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
