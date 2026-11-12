import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminProductService } from '../../../core/services/admin-product.service';
import { CategoryService } from '../../../core/services/category.service';
import { CartService } from '../../../core/services/cart.service';
import { SettingsService } from '../../../core/services/settings.service';
import { Product } from '../../../core/models/product.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  private readonly productService = inject(AdminProductService);
  private readonly categoryService = inject(CategoryService);
  protected readonly cartService = inject(CartService);
  private readonly settingsService = inject(SettingsService);

  readonly products = toSignal(this.productService.getProducts(), { initialValue: [] });
  readonly categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });
  readonly settings = toSignal(this.settingsService.getSettings());

  readonly searchQuery = signal<string>('');
  readonly selectedCategoryId = signal<string>('all');
  readonly isBottomBarDismissed = signal<boolean>(false);

  readonly filteredProducts = computed(() => {
    const list = this.products();
    const catId = this.selectedCategoryId();
    const query = this.searchQuery().trim().toLowerCase();

    return list.filter((p) => {
      const matchesCat = catId === 'all' || p.categoryId === catId;
      const matchesQuery =
        !query ||
        p.name.toLowerCase().includes(query) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(query)) ||
        p.unit.toLowerCase().includes(query);

      return matchesCat && matchesQuery;
    });
  });

  selectCategory(catId: string): void {
    this.selectedCategoryId.set(catId);
  }

  getItemQty(productId: string): number {
    return this.cartService.getItemQuantity(productId);
  }

  addToCart(product: Product): void {
    // When adding items, ensure the sticky bar is visible
    this.isBottomBarDismissed.set(false);
    this.cartService.addToCart(product);
  }

  decrementItem(productId: string): void {
    this.cartService.decrementItem(productId);
  }

  dismissBottomBar(event: Event): void {
    event.stopPropagation();
    this.isBottomBarDismissed.set(true);
  }
}
