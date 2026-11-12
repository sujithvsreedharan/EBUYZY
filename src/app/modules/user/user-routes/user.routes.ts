import { Routes } from '@angular/router';

export const USER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('../user-layout/user-layout').then((m) => m.UserLayout),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('../home/home').then((m) => m.Home)
      },
      {
        path: 'products',
        loadComponent: () =>
          import('../products/products').then((m) => m.Products)
      },
      {
        path: 'checkout',
        loadComponent: () =>
          import('../checkout/checkout').then((m) => m.Checkout)
      },
      {
        path: 'order-success/:id',
        loadComponent: () =>
          import('../order-success/order-success').then((m) => m.OrderSuccess)
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('../profile/profile').then((m) => m.Profile)
      },
      {
        path: 'orders',
        redirectTo: 'profile'
      }
    ]
  }
];
