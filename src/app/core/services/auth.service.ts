import { Injectable, signal, computed, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay, tap } from 'rxjs/operators';
import { AdminPagePermission } from '../models/sub-admin.model';
import { SubAdminService } from './sub-admin.service';

export type UserRole = 'admin' | 'manager' | 'sub_admin' | 'delivery_person' | 'customer';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  roleTitle?: string;
  permissions?: AdminPagePermission[];
  isSuperAdmin?: boolean;
  vehicleType?: string;
  vehicleNumber?: string;
  zone?: string;
  address?: string;
  locality?: string;
  pincode?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly subAdminService = inject(SubAdminService);
  private readonly TOKEN_KEY = 'ebuyzy_auth_token';
  private readonly USER_KEY = 'ebuyzy_auth_user';
  private readonly CUSTOMERS_REGISTRY_KEY = 'ebuyzy_registered_users';

  // Signals for fine-grained reactive state
  private readonly _token = signal<string | null>(this.getStoredToken());
  private readonly _currentUser = signal<AuthUser | null>(this.getStoredUser());

  // Modal State Signals for Pop-up Modal
  readonly isAuthModalOpen = signal<boolean>(false);
  readonly authModalMode = signal<'signin' | 'signup'>('signin');
  readonly authModalMessage = signal<string | null>(null);
  readonly postAuthRedirectUrl = signal<string | null>(null);

  readonly isAuthenticated = computed(() => !!this._token());
  readonly currentUser = computed(() => this._currentUser());
  readonly isAdmin = computed(() => {
    const role = this._currentUser()?.role;
    return role === 'admin' || role === 'manager' || role === 'sub_admin' || role === 'delivery_person';
  });
  readonly isSuperAdmin = computed(() => {
    const user = this._currentUser();
    return user?.role === 'admin' || user?.isSuperAdmin === true;
  });
  readonly isSubAdmin = computed(() => this._currentUser()?.role === 'sub_admin');
  readonly isDeliveryPerson = computed(() => this._currentUser()?.role === 'delivery_person');
  readonly isCustomer = computed(() => this._currentUser()?.role === 'customer');

  private getStoredToken(): string | null {
    try {
      return localStorage.getItem(this.TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private getStoredUser(): AuthUser | null {
    try {
      const data = localStorage.getItem(this.USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private getStoredUsers(): AuthUser[] {
    try {
      const data = localStorage.getItem(this.CUSTOMERS_REGISTRY_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // Pop-up Modal Controls
  openAuthModal(mode: 'signin' | 'signup' = 'signin', message?: string, redirectUrl?: string): void {
    this.authModalMode.set(mode);
    this.authModalMessage.set(message || null);
    this.postAuthRedirectUrl.set(redirectUrl || null);
    this.isAuthModalOpen.set(true);
  }

  closeAuthModal(): void {
    this.isAuthModalOpen.set(false);
    this.authModalMessage.set(null);
  }

  switchModalMode(mode: 'signin' | 'signup'): void {
    this.authModalMode.set(mode);
  }

  /**
   * Universal Login for EBUYZY:
   * - If Admin credentials -> sets role: 'admin'
   * - If Customer credentials -> sets role: 'customer'
   */
  login(identifier: string, password: string): Observable<{ success: boolean; user?: AuthUser; error?: string }> {
    const cleanId = identifier.trim().toLowerCase();

    // 1. Check Admin credentials
    const isAdminCredentials =
      (cleanId === 'admin@ebuyzy.in' || cleanId === 'admin' || cleanId === '9847000111' || cleanId.startsWith('admin')) &&
      (password === 'admin123' || password === 'admin');

    if (isAdminCredentials) {
      const mockToken = 'mock_jwt_ebuyzy_admin_' + Date.now();
      const adminUser: AuthUser = {
        id: 'adm_01',
        name: 'Anand Varma (Store Admin)',
        email: cleanId.includes('@') ? cleanId : 'admin@ebuyzy.in',
        phone: '9847000111',
        role: 'admin'
      };

      return of({ success: true, user: adminUser }).pipe(
        delay(350),
        tap(() => this.persistSession(mockToken, adminUser))
      );
    }

    // 2. Check Staff credentials (Sub-Admin or Delivery Partner configured by Super Admin)
    const matchingStaff = this.subAdminService.findStaffByCredentials(identifier, password);
    if (matchingStaff) {
      if (!matchingStaff.isActive) {
        const staffTypeLabel = matchingStaff.type === 'delivery_person' ? 'delivery partner' : 'sub-admin';
        return of({
          success: false,
          error: `Your ${staffTypeLabel} account has been deactivated by Super Admin.`
        }).pipe(delay(250));
      }

      const isDelivery = matchingStaff.type === 'delivery_person';
      const mockToken = `mock_jwt_ebuyzy_${isDelivery ? 'delivery' : 'subadmin'}_` + Date.now();
      const staffUser: AuthUser = {
        id: matchingStaff.id,
        name: matchingStaff.name,
        email: matchingStaff.email,
        phone: matchingStaff.phone,
        role: isDelivery ? 'delivery_person' : 'sub_admin',
        roleTitle: matchingStaff.roleTitle,
        permissions: matchingStaff.permissions,
        vehicleType: matchingStaff.vehicleType,
        vehicleNumber: matchingStaff.vehicleNumber,
        zone: matchingStaff.zone,
        isSuperAdmin: false
      };

      return of({ success: true, user: staffUser }).pipe(
        delay(300),
        tap(() => this.persistSession(mockToken, staffUser))
      );
    }

    // 3. Check Demo Customer Credentials
    if (cleanId === '9847123450' || cleanId === 'fathima@ebuyzy.in' || cleanId === 'fathima') {
      const mockToken = 'mock_jwt_ebuyzy_customer_' + Date.now();
      const customerUser: AuthUser = {
        id: 'cust_801',
        name: 'Fathima Raheem',
        email: 'fathima.raheem@ebuyzy.in',
        phone: '9847123450',
        role: 'customer',
        address: 'Flat 4B, Olive Greens, Infopark Road, Kakkanad',
        locality: 'Infopark Road, Kakkanad',
        pincode: '682042'
      };

      return of({ success: true, user: customerUser }).pipe(
        delay(350),
        tap(() => this.persistSession(mockToken, customerUser))
      );
    }

    // 3. Check registered users in localStorage
    const registered = this.getStoredUsers();
    const existing = registered.find(
      (u) =>
        (u.email.toLowerCase() === cleanId || (u.phone && u.phone === cleanId.replace(/\D/g, '')))
    );

    if (existing) {
      const mockToken = 'mock_jwt_ebuyzy_customer_' + Date.now();
      return of({ success: true, user: existing }).pipe(
        delay(350),
        tap(() => this.persistSession(mockToken, existing))
      );
    }

    // 4. Fallback: Allow friendly customer login with minimum 4 chars password
    const isCustomerValid = cleanId.length >= 3 && password.length >= 4;

    if (isCustomerValid) {
      const mockToken = 'mock_jwt_ebuyzy_customer_' + Date.now();
      const customerName = cleanId.includes('@')
        ? cleanId.split('@')[0].replace(/[^a-zA-Z]/g, ' ')
        : 'Customer (' + cleanId.slice(-4) + ')';

      const customerUser: AuthUser = {
        id: 'cust_' + Date.now(),
        name: customerName ? customerName.charAt(0).toUpperCase() + customerName.slice(1).trim() : 'Kerala Customer',
        email: cleanId.includes('@') ? cleanId : `${cleanId}@customer.ebuyzy.in`,
        phone: cleanId.replace(/\D/g, '') || '9847123450',
        role: 'customer',
        address: 'Sunrise Apartments, Kakkanad, Kochi',
        locality: 'Kakkanad, Kochi',
        pincode: '682030'
      };

      return of({ success: true, user: customerUser }).pipe(
        delay(350),
        tap(() => this.persistSession(mockToken, customerUser))
      );
    }

    return of({
      success: false,
      error: 'Invalid credentials. For Admin use admin@ebuyzy.in / admin123'
    }).pipe(delay(350));
  }

  /**
   * New Customer Sign Up:
   * Creates an account and signs the user in immediately.
   */
  signup(name: string, identifier: string, password: string, phone?: string): Observable<{ success: boolean; user?: AuthUser; error?: string }> {
    const cleanId = identifier.trim().toLowerCase();
    const cleanPhone = (phone || (cleanId.includes('@') ? '' : cleanId)).replace(/\D/g, '');

    if (!name || name.trim().length < 2) {
      return of({ success: false, error: 'Please enter your full name.' });
    }

    if (password.length < 4) {
      return of({ success: false, error: 'Password must be at least 4 characters long.' });
    }

    const newUser: AuthUser = {
      id: 'cust_' + Date.now(),
      name: name.trim(),
      email: cleanId.includes('@') ? cleanId : `${cleanId}@customer.ebuyzy.in`,
      phone: cleanPhone || '9847123450',
      role: 'customer'
    };

    const mockToken = 'mock_jwt_ebuyzy_customer_' + Date.now();

    // Save to registered list
    const currentList = this.getStoredUsers();
    try {
      localStorage.setItem(this.CUSTOMERS_REGISTRY_KEY, JSON.stringify([newUser, ...currentList]));
    } catch {}

    return of({ success: true, user: newUser }).pipe(
      delay(350),
      tap(() => this.persistSession(mockToken, newUser))
    );
  }

  private persistSession(token: string, user: AuthUser): void {
    try {
      localStorage.setItem(this.TOKEN_KEY, token);
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    } catch {
      // ignore
    }
    this._token.set(token);
    this._currentUser.set(user);
    this.closeAuthModal();
  }

  updateProfile(updatedData: Partial<AuthUser>): Observable<{ success: boolean; user?: AuthUser; error?: string }> {
    const current = this._currentUser();
    if (!current) {
      return of({ success: false, error: 'User is not signed in.' });
    }

    const updatedUser: AuthUser = {
      ...current,
      ...updatedData
    };

    try {
      localStorage.setItem(this.USER_KEY, JSON.stringify(updatedUser));
      const registry = this.getStoredUsers();
      const idx = registry.findIndex((u) => u.id === current.id || u.email === current.email);
      if (idx !== -1) {
        registry[idx] = updatedUser;
        localStorage.setItem(this.CUSTOMERS_REGISTRY_KEY, JSON.stringify(registry));
      }
    } catch {}

    this._currentUser.set(updatedUser);
    return of({ success: true, user: updatedUser }).pipe(delay(200));
  }

  logout(): void {
    try {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    } catch {
      // ignore
    }
    this._token.set(null);
    this._currentUser.set(null);
  }

  getToken(): string | null {
    return this._token();
  }
}
