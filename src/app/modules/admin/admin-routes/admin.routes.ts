import { Routes } from '@angular/router';
import { adminGuard, adminChildGuard } from '../../../core/guards/admin.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('../login/login').then((m) => m.Login)
  },
  {
    path: '',
    loadComponent: () =>
      import('../admin-layout/admin-layout').then((m) => m.AdminLayout),
    canActivate: [adminGuard],
    canActivateChild: [adminChildGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('../dashboard/dashboard').then((m) => m.Dashboard)
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('../orders/orders').then((m) => m.Orders)
      },
      {
        path: 'assigned-orders',
        loadComponent: () =>
          import('../assigned-orders/assigned-orders').then((m) => m.AssignedOrders)
      },
      {
        path: 'products',
        loadComponent: () =>
          import('../products/products').then((m) => m.Products)
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('../categories/categories').then((m) => m.Categories)
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('../customers/customers').then((m) => m.Customers)
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('../settings/settings').then((m) => m.Settings)
      },
      {
        path: 'staffs',
        loadComponent: () =>
          import('../staffs/staffs').then((m) => m.Staffs)
      },
      {
        path: 'sub-admins',
        redirectTo: 'staffs',
        pathMatch: 'full'
      }
    ]
  }
];
