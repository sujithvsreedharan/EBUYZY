import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { SettingsService } from '../../../core/services/settings.service';
import { ThemeService } from '../../../core/services/theme.service';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { AdminPagePermission } from '../../../core/models/sub-admin.model';

interface NavItem {
  label: string;
  route: string;
  icon: string;
  permissionKey: AdminPagePermission;
  badge?: () => number | null;
}

@Component({
  selector: 'app-admin-layout',
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
})
export class AdminLayout {
  protected readonly authService = inject(AuthService);
  protected readonly themeService = inject(ThemeService);
  private readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Settings signal
  readonly settings = toSignal(this.settingsService.getSettings());

  // Access denied warning alert signal
  readonly accessDeniedNotice = signal<string | null>(null);

  constructor() {
    this.route.queryParams.subscribe((params) => {
      if (params['accessDenied']) {
        this.accessDeniedNotice.set(
          'Access restricted: You do not have permission to view that page. Only sections authorized by the Administrator are accessible.'
        );
      }
    });
  }

  readonly allNavItems: NavItem[] = [
    {
      label: 'Dashboard',
      route: '/admin/dashboard',
      permissionKey: 'dashboard',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>`
    },
    {
      label: 'Orders',
      route: '/admin/orders',
      permissionKey: 'orders',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>`
    },
    {
      label: 'Assigned Orders',
      route: '/admin/assigned-orders',
      permissionKey: 'assigned_orders',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>`
    },
    {
      label: 'Products',
      route: '/admin/products',
      permissionKey: 'products',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`
    },
    {
      label: 'Categories',
      route: '/admin/categories',
      permissionKey: 'categories',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"/></svg>`
    },
    {
      label: 'Customers',
      route: '/admin/customers',
      permissionKey: 'customers',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`
    },
    {
      label: 'Settings',
      route: '/admin/settings',
      permissionKey: 'settings',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`
    },
    {
      label: 'Staffs',
      route: '/admin/staffs',
      permissionKey: 'staffs',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>`
    }
  ];

  // Dynamic list of visible navigation items based on user's role and tick-marked permissions!
  readonly visibleNavItems = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return [];

    // Delivery Person: strictly access assigned deliveries only!
    if (user.role === 'delivery_person') {
      return this.allNavItems.filter((item) => item.route === '/admin/assigned-orders');
    }

    // Super Admin has full access to all sections
    if (user.role === 'admin' || user.isSuperAdmin) {
      return this.allNavItems;
    }

    // Sub-Admin: ONLY display the pages that the Admin tick-marked!
    const perms = user.permissions || [];
    return this.allNavItems.filter((item) => {
      if (item.permissionKey === 'staffs') {
        return perms.includes('staffs') || perms.includes('subadmins');
      }
      return perms.includes(item.permissionKey);
    });
  });

  // Mobile bottom bar items (strictly filtered to allowed pages)
  readonly visibleMobileNavItems = computed(() => {
    return this.visibleNavItems().slice(0, 5);
  });

  dismissNotice(): void {
    this.accessDeniedNotice.set(null);
  }

  toggleShopStatus(): void {
    this.settingsService.toggleShopStatus().subscribe();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/admin/login']);
  }
}
