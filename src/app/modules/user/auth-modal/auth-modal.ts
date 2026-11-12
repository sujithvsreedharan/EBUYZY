import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './auth-modal.html',
  styleUrl: './auth-modal.css',
})
export class AuthModal {
  protected readonly authService = inject(AuthService);
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
    identifier: ['', [Validators.required, Validators.minLength(4)]],
    password: ['', [Validators.required, Validators.minLength(4)]]
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

          // If user is Admin -> redirect to /admin/dashboard
          if (res.user.role === 'admin' || res.user.role === 'manager') {
            this.router.navigate(['/admin/dashboard']);
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

    const { name, identifier, password } = this.signUpForm.getRawValue();

    this.authService.signup(name, identifier, password).subscribe({
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

  fillAdminDemo(): void {
    this.authService.switchModalMode('signin');
    this.signInForm.patchValue({
      identifier: 'admin@ebuyzy.in',
      password: 'admin123'
    });
    this.errorMessage.set(null);
  }

  fillCustomerDemo(): void {
    this.authService.switchModalMode('signin');
    this.signInForm.patchValue({
      identifier: '9847123450',
      password: 'user123'
    });
    this.errorMessage.set(null);
  }
}
