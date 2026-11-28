import { Component, HostListener, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CartService } from '../../../core/services/cart.service';
import { SettingsService } from '../../../core/services/settings.service';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { NotificationService, AppNotification } from '../../../core/services/notification.service';
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
export class UserLayout implements OnInit {
  protected readonly cartService = inject(CartService);
  protected readonly authService = inject(AuthService);
  protected readonly themeService = inject(ThemeService);
  protected readonly deliveryService = inject(DeliveryAreaService);
  protected readonly notificationService = inject(NotificationService);
  private readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);

  readonly settings = toSignal(this.settingsService.getSettings());
  readonly currentYear = new Date().getFullYear();

  // Mobile Menu Drawer State
  readonly isMobileMenuOpen = signal<boolean>(false);

  readonly userInitial = computed(() => {
    const user = this.authService.currentUser();
    return user?.name ? user.name.trim().charAt(0).toUpperCase() : 'U';
  });

  ngOnInit(): void {
    this.deliveryService.checkInitialPopupTrigger();

  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isMobileMenuOpen()) {
      this.closeMobileMenu();
    }
    if (this.notificationService.isPopoverOpen()) {
      this.notificationService.closePopover();
    }
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.update((open) => !open);
    if (this.isMobileMenuOpen()) {
      this.notificationService.closePopover();
    }
  }

  openMobileMenu(): void {
    this.isMobileMenuOpen.set(true);
    this.notificationService.closePopover();
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }

  toggleNotification(): void {
    this.notificationService.togglePopover();
    if (this.notificationService.isPopoverOpen()) {
      this.closeMobileMenu();
    }
  }

  onNotificationClick(item: AppNotification): void {
    this.notificationService.markAsRead(item.id);
    this.notificationService.closePopover();
    if (item.link) {
      this.router.navigate([item.link]);
    }
  }

  openSignInModal(): void {
    this.authService.openAuthModal('signin');
  }

  openSignInFromMenu(): void {
    this.closeMobileMenu();
    this.openSignInModal();
  }

  logoutFromMenu(): void {
    this.closeMobileMenu();
    this.logout();
  }

  openDeliveryModalFromMenu(): void {
    this.closeMobileMenu();
    this.deliveryService.openModal();
  }

  navigateToFromMenu(path: string): void {
    this.closeMobileMenu();
    this.router.navigate([path]);
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
      'Namaskaram EBUYZY! 👋 I have a question regarding grocery delivery .'
    );
    return `https://wa.me/${clean}?text=${msg}`;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']).then(() => {
      this.authService.openAuthModal('signin', 'You have signed out. Sign in anytime to continue shopping.');
    });
  }

  navigateTo(path: string): void {
    this.router.navigate([path]);
  }
}
