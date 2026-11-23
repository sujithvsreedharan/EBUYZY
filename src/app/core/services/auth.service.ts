import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, delay, map, switchMap, tap } from 'rxjs/operators';
import { AdminPagePermission } from '../models/sub-admin.model';
import { apiUrl } from '../../app.constant';

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

export interface RegisterCustomerPayload {
  name: string;
  mobile: string;
  email?: string;
  address?: string;
  password: string;
}

export interface RegisterEmployeePayload {
  name: string;
  mobile: string;
  email?: string;
  address?: string;
  password: string;
  role?: string;
  deptId?: number;
  dept?: number;
  desigId?: number;
  desig?: number;
  vehicleType?: string;
  vehicleNumber?: string;
}

export interface RegistrationResponse {
  success: boolean;
  message: string;
  userId?: number;
  token?: string;
  user?: {
    id: number | string;
    name: string;
    email?: string;
    mobile?: string;
    phone?: string;
    role?: string;
  };
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: {
    id: number | string;
    name: string;
    email?: string;
    mobile?: string;
    role: string | number;
  };
  message?: string;
}

export interface StaffRoleItem {
  id: number;
  name: string;
  desc?: string;
}

export interface StaffCounts {
  total: number;
  sub_admin: number;
  delivery_part: number;
  active_emp: number;
}

export interface StaffApiItem {
  slno: number;
  name: string;
  role: string;
  desc?: string;
  status: boolean | number;
  email: string;
  phone?: string;
  address?: string;
  vehicleType?: string;
  vehicleNumber?: string;
}

export interface StaffInitialResponse {
  success: boolean;
  roles: StaffRoleItem[];
  counts: StaffCounts;
  staff: StaffApiItem[];
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = apiUrl;

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
   * Calls POST /api/login, maps user roles, and stores JWT session.
   * Only authenticates via backend APIs.
   */
  login(identifier: string, password: string): Observable<{ success: boolean; user?: AuthUser; token?: string; error?: string }> {
    const cleanId = identifier.trim();

    return this.http
      .post<LoginResponse>(`${this.baseUrl}/api/login`, {
        username: cleanId,
        password
      })
      .pipe(
        map((res) => {
          if (res.success && res.user && res.token) {
            const rawRole = String(res.user.role || '').toLowerCase();
            const mappedRole: UserRole =
              rawRole === '2' || rawRole === 'admin' || rawRole === 'superadmin' || rawRole === 'manager'
                ? 'admin'
                : rawRole === 'delivery_person' || rawRole === 'delivery_partner' || rawRole.includes('delivery')
                ? 'delivery_person'
                : rawRole === 'sub_admin' || rawRole === 'subadmin'
                ? 'sub_admin'
                : 'customer';

            const authUser: AuthUser = {
              id: String(res.user.id),
              name: res.user.name,
              email: res.user.email || (cleanId.includes('@') ? cleanId : `${cleanId}@customer.ebuyzy.in`),
              phone: res.user.mobile || (!cleanId.includes('@') ? cleanId : undefined),
              role: mappedRole,
              permissions:
                mappedRole === 'delivery_person'
                  ? ['assigned_orders']
                  : mappedRole === 'sub_admin'
                  ? ['orders', 'dashboard']
                  : undefined,
              isSuperAdmin: mappedRole === 'admin'
            };

            this.persistSession(res.token, authUser);
            return { success: true, user: authUser, token: res.token };
          }
          return { success: false, error: res.message || 'Login failed' };
        }),
        catchError((err) => {
          const msg =
            err?.error?.message ||
            (err?.status === 0
              ? 'Cannot connect to backend server. Please check your network connection.'
              : 'Invalid credentials. Please try again.');
          return of({ success: false, error: msg });
        })
      );
  }

  /**
   * New Customer Sign Up:
   * Calls POST /api/registerCustomer and auto-logs the user in on success.
   */
  signup(name: string, identifierOrMobile: string, password: string, phone?: string): Observable<{ success: boolean; user?: AuthUser; token?: string; error?: string }> {
    const rawMobile = phone || identifierOrMobile;
    const cleanPhone = rawMobile.replace(/\D/g, '').slice(-10);
    const cleanEmail = identifierOrMobile.includes('@') ? identifierOrMobile.trim().toLowerCase() : undefined;

    if (!name || name.trim().length < 2) {
      return of({ success: false, error: 'Please enter your full name.' });
    }

    if (!cleanPhone || cleanPhone.length !== 10) {
      return of({ success: false, error: 'Please enter a valid 10-digit mobile number.' });
    }

    if (password.length < 8) {
      return of({ success: false, error: 'Password must be at least 8 characters long.' });
    }

    const payload: RegisterCustomerPayload = {
      name: name.trim(),
      mobile: cleanPhone,
      email: cleanEmail,
      password: password
    };

    return this.registerCustomer(payload).pipe(
      switchMap((regRes) => {
        if (!regRes.success) {
          return of({ success: false, error: regRes.message || 'Registration failed.' });
        }

        // If backend returned token and user on registration, log in directly without a 2nd call!
        if (regRes.token && regRes.user) {
          const authUser: AuthUser = {
            id: String(regRes.user.id || regRes.userId),
            name: regRes.user.name || name.trim(),
            email: regRes.user.email || cleanEmail || `${cleanPhone}@customer.ebuyzy.in`,
            phone: regRes.user.mobile || regRes.user.phone || cleanPhone,
            role: 'customer',
            isSuperAdmin: false
          };
          this.persistSession(regRes.token, authUser);
          return of({ success: true, user: authUser, token: regRes.token });
        }

        // Fallback: auto-login newly registered customer with their mobile & password
        return this.login(cleanPhone, password);
      }),
      catchError((err) => {
        const msg = err?.error?.message || 'Registration failed. Try again.';
        return of({ success: false, error: msg });
      })
    );
  }

  /**
   * Register Customer API (POST /api/registerCustomer)
   */
  registerCustomer(payload: RegisterCustomerPayload): Observable<RegistrationResponse> {
    return this.http.post<RegistrationResponse>(`${this.baseUrl}/api/registerCustomer`, payload);
  }

  /**
   * Register Staff / Employee API (POST /api/admin/staff)
   */
  registerStaff(payload: RegisterEmployeePayload): Observable<RegistrationResponse> {
    const token = this.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.post<RegistrationResponse>(`${this.baseUrl}/api/admin/staff`, payload, { headers });
  }

  registerEmployee(payload: RegisterEmployeePayload): Observable<RegistrationResponse> {
    return this.registerStaff(payload);
  }

  /**
   * Get initial staff page details (roles, counts, staff) - GET /api/admin/staff/initial
   */
  getStaffInitial(): Observable<StaffInitialResponse> {
    const token = this.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.get<StaffInitialResponse>(`${this.baseUrl}/api/admin/staff/initial`, { headers });
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

  /**
   * Fetch live user profile and addresses from backend: POST /api/me/profile
   */
  getUserProfileApi(): Observable<{ success: boolean; profile?: any; addresses?: any[]; user?: any; message?: string }> {
    const token = this.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;

    return this.http.post<{ success: boolean; profile?: any; addresses?: any[]; user?: any; message?: string }>(
      `${this.baseUrl}/api/me/profile`,
      {},
      { headers }
    ).pipe(
      tap((res) => {
        if (res.success && (res.profile || res.user)) {
          const current = this._currentUser();
          const p = res.profile || res.user;
          const defaultAddr = (res.addresses || []).find((a: any) => a.isDefault) || (res.addresses || [])[0];
          const updatedUser: AuthUser = {
            id: current?.id || String(p.id || p.USER_SLNO || ''),
            name: p.name || p.USER_NAME || current?.name || '',
            email: p.email || p.USER_EMAIL || current?.email,
            phone: p.mobile || p.USER_MOBILE || current?.phone || '',
            role: current?.role || 'customer',
            address: defaultAddr?.main_address || defaultAddr?.address || current?.address,
            locality: defaultAddr?.city ? `${defaultAddr.city}, ${defaultAddr.district || ''}`.trim() : current?.locality,
            pincode: defaultAddr?.pin || defaultAddr?.pincode || current?.pincode
          };
          this._currentUser.set(updatedUser);
          try {
            localStorage.setItem(this.USER_KEY, JSON.stringify(updatedUser));
          } catch {}
        }
      })
    );
  }

  /**
   * Save / update address in backend: POST /api/user/address
   */
  saveAddressApi(payload: { address: string; locality?: string; pincode?: string; name?: string; phone?: string; gps?: string; addressLine2?: string }): Observable<{ success: boolean; message?: string; addressId?: number }> {
    const token = this.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;

    return this.http.post<{ success: boolean; message?: string; addressId?: number }>(
      `${this.baseUrl}/api/user/address`,
      payload,
      { headers }
    );
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

    const token = this.getToken();
    if (token) {
      const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
      return this.http
        .post<{ success: boolean; message?: string }>(
          `${this.baseUrl}/api/user/profile`,
          {
            name: updatedData.name,
            phone: updatedData.phone,
            email: updatedData.email
          },
          { headers }
        )
        .pipe(
          map((res) => ({ success: res.success, user: updatedUser })),
          catchError(() => of({ success: true, user: updatedUser }))
        );
    }

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
