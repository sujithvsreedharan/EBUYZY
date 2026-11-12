import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./modules/admin/login/login').then((m) => m.Login)
  },
  {
    path: 'admin',
    loadChildren: () =>
      import('./modules/admin/admin-routes/admin.routes').then((m) => m.ADMIN_ROUTES)
  },
  {
    path: '',
    loadChildren: () =>
      import('./modules/user/user-routes/user.routes').then((m) => m.USER_ROUTES)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
