import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { SubAdminService } from '../../../core/services/sub-admin.service';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly subAdminService = inject(SubAdminService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly loginForm = this.fb.group({
    identifier: ['admin@ebuyzy.in', [Validators.required, Validators.minLength(3)]],
    password: ['admin123', [Validators.required, Validators.minLength(4)]]
  });

  setQuickLogin(type: 'admin' | 'subadmin' | 'delivery' | 'customer'): void {
    if (type === 'admin') {
      this.loginForm.setValue({
        identifier: 'admin@ebuyzy.in',
        password: 'admin123'
      });
    } else if (type === 'subadmin') {
      this.loginForm.setValue({
        identifier: 'orders@ebuyzy.in',
        password: 'order123'
      });
    } else if (type === 'delivery') {
      this.loginForm.setValue({
        identifier: 'delivery@ebuyzy.in',
        password: 'delivery123'
      });
    } else {
      this.loginForm.setValue({
        identifier: 'rahul@ebuyzy.in',
        password: 'user123'
      });
    }
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { identifier, password } = this.loginForm.getRawValue();

    this.authService.login(identifier!, password!).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success && res.user) {
          const returnUrl = this.route.snapshot.queryParams['returnUrl'];

          if (res.user.role === 'admin' || res.user.role === 'manager') {
            // Super Admin -> redirect to admin dashboard
            this.router.navigateByUrl(returnUrl || '/admin/dashboard');
          } else if (res.user.role === 'delivery_person') {
            // Delivery Partner -> redirect straight to assigned deliveries
            this.router.navigateByUrl('/admin/assigned-orders');
          } else if (res.user.role === 'sub_admin') {
            // Sub-Admin -> automatically route to first allowed page (e.g. /admin/orders)
            const destination = returnUrl && this.subAdminService.canAccessRoute(res.user.permissions, returnUrl)
              ? returnUrl
              : this.subAdminService.getFirstAllowedRoute(res.user.permissions);
            this.router.navigateByUrl(destination);
          } else {
            // Customer user -> redirect to customer storefront
            this.router.navigateByUrl(returnUrl && !returnUrl.startsWith('/admin') ? returnUrl : '/');
          }
        } else {
          this.errorMessage.set(res.error || 'Authentication failed');
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('An unexpected error occurred. Please try again.');
      }
    });
  }
}
