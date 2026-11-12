import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CartService, AVAILABLE_COUPONS } from '../../../core/services/cart.service';
import { SettingsService } from '../../../core/services/settings.service';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { AuthModal } from '../auth-modal/auth-modal';
import { DeliveryAreaModal } from '../delivery-area-modal/delivery-area-modal';
import { DeliveryAreaService } from '../../../core/services/delivery-area.service';

@Component({
  selector: 'app-user-layout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive, DecimalPipe, AuthModal, DeliveryAreaModal],
  templateUrl: './user-layout.html',
  styleUrl: './user-layout.css',
})
export class UserLayout {
  protected readonly cartService = inject(CartService);
  protected readonly authService = inject(AuthService);
  protected readonly themeService = inject(ThemeService);
  protected readonly deliveryService = inject(DeliveryAreaService);
  private readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);

  readonly availableCoupons = AVAILABLE_COUPONS;
  readonly couponInput = signal<string>('');

  readonly settings = toSignal(this.settingsService.getSettings());
  readonly currentYear = new Date().getFullYear();

  readonly userInitial = computed(() => {
    const user = this.authService.currentUser();
    return user?.name ? user.name.trim().charAt(0).toUpperCase() : 'U';
  });

  applyCoupon(code?: string): void {
    const toApply = code || this.couponInput();
    if (toApply) {
      const ok = this.cartService.applyCoupon(toApply);
      if (ok) {
        this.couponInput.set('');
      }
    }
  }

  removeCoupon(): void {
    this.cartService.removeCoupon();
    this.couponInput.set('');
  }

  openSignInModal(): void {
    this.authService.openAuthModal('signin');
  }

  proceedToCheckout(): void {
    this.cartService.closeDrawer();

    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/checkout']);
    } else {
      // Must sign in / create an account before checkout
      this.authService.openAuthModal(
        'signin',
        'Please sign in or create an account to proceed to checkout.',
        '/checkout'
      );
    }
  }

  getWhatsAppHelpUrl(): string {
    const raw = this.settings()?.whatsappNumber?.replace(/\D/g, '') || '9847000111';
    const clean = raw.length === 10 ? '91' + raw : raw;
    const msg = encodeURIComponent(
      'Namaskaram EBUYZY! 👋 I have a question regarding grocery delivery in Kakkanad.'
    );
    return `https://wa.me/${clean}?text=${msg}`;
  }

  logout(): void {
    const wasAdmin = this.authService.isAdmin();
    this.authService.logout();
    if (wasAdmin) {
      this.router.navigate(['/']).then(() => {
        this.authService.openAuthModal('signin');
      });
    }
  }
}
