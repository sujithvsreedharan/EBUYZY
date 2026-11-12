import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SubAdminService } from '../services/sub-admin.service';

export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const subAdminService = inject(SubAdminService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/admin/login'], {
      queryParams: { returnUrl: state.url }
    });
  }

  const user = authService.currentUser();
  if (!user || (!authService.isAdmin())) {
    return router.createUrlTree(['/admin/login'], {
      queryParams: { returnUrl: state.url }
    });
  }

  // Super Admin has full unrestricted access to all admin operations
  if (user.role === 'admin' || user.isSuperAdmin) {
    return true;
  }

  const cleanUrl = state.url.split('?')[0].split('#')[0];

  // Delivery Person: Dedicated mobile-first assigned orders view
  if (user.role === 'delivery_person') {
    if (cleanUrl.startsWith('/admin/assigned-orders')) {
      return true;
    }
    // Any other admin URL redirects them to their assigned orders
    return router.createUrlTree(['/admin/assigned-orders']);
  }

  // Sub-Admin: check page-level tick-marked permissions
  if (user.role === 'sub_admin') {
    // Navigating to admin root (/admin or /admin/)
    if (cleanUrl === '/admin' || cleanUrl === '/admin/') {
      const firstAllowed = subAdminService.getFirstAllowedRoute(user.permissions);
      return router.createUrlTree([firstAllowed]);
    }

    // Attempting to access Staffs management page
    if (cleanUrl.startsWith('/admin/staffs') || cleanUrl.startsWith('/admin/sub-admins')) {
      if (user.permissions?.includes('staffs') || user.permissions?.includes('subadmins')) {
        return true;
      }
      const fallback = subAdminService.getFirstAllowedRoute(user.permissions);
      return router.createUrlTree([fallback], {
        queryParams: { accessDenied: 'staffs' }
      });
    }

    // Check against user's tick-marked permissions
    const isAllowed = subAdminService.canAccessRoute(user.permissions, cleanUrl);
    if (isAllowed) {
      return true;
    }

    // Access blocked: redirect to sub-admin's primary allowed page
    const fallbackRoute = subAdminService.getFirstAllowedRoute(user.permissions);
    return router.createUrlTree([fallbackRoute], {
      queryParams: { accessDenied: 'restricted' }
    });
  }

  return true;
};

export const adminChildGuard: CanActivateChildFn = (childRoute, state) => {
  return adminGuard(childRoute, state);
};
