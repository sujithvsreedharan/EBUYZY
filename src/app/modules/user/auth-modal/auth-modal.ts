import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SubAdminService } from '../../../core/services/sub-admin.service';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './auth-modal.html',
  styleUrl: './auth-modal.css',
})
export class AuthModal {
  protected readonly authService = inject(AuthService);
  private readonly subAdminService = inject(SubAdminService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal<boolean>(false);

  readonly signInForm: FormGroup = this.fb.group({
    identifier: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(4)]]
  });

  readonly signUpForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    mobile: ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  switchMode(mode: 'signin' | 'signup'): void {
    this.errorMessage.set(null);
    this.authService.switchModalMode(mode);
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((val) => !val);
  }

  close(): void {
    this.errorMessage.set(null);
    this.authService.closeAuthModal();
  }

  onSignIn(): void {
    if (this.signInForm.invalid) {
      this.signInForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { identifier, password } = this.signInForm.getRawValue();

    this.authService.login(identifier, password).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success && res.user) {
          const redirect = this.authService.postAuthRedirectUrl();

          // Role-based routing for staff & admin or pending redirect for customers
          if (res.user.role === 'admin' || res.user.role === 'manager') {
            this.router.navigateByUrl('/admin/dashboard');
          } else if (res.user.role === 'delivery_person') {
            this.router.navigateByUrl('/admin/assigned-orders');
          } else if (res.user.role === 'sub_admin') {
            const destination = this.subAdminService.getFirstAllowedRoute(res.user.permissions);
            this.router.navigateByUrl(destination);
          } else if (redirect) {
            // If customer has a pending redirect (e.g. /checkout)
            this.router.navigateByUrl(redirect);
          }

          this.signInForm.reset();
        } else {
          this.errorMessage.set(res.error || 'Invalid credentials. Please try again.');
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Connection error. Please try again.');
      }
    });
  }

  onSignUp(): void {
    if (this.signUpForm.invalid) {
      this.signUpForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { name, mobile, password } = this.signUpForm.getRawValue();

    this.authService.signup(name, mobile, password).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success && res.user) {
          const redirect = this.authService.postAuthRedirectUrl();
          if (redirect) {
            this.router.navigateByUrl(redirect);
          }
          this.signUpForm.reset();
        } else {
          this.errorMessage.set(res.error || 'Failed to create account.');
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('An unexpected error occurred. Please try again.');
      }
    });
  }
}
