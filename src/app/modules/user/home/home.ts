import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminProductService } from '../../../core/services/admin-product.service';
import { CategoryService } from '../../../core/services/category.service';
import { CartService } from '../../../core/services/cart.service';
import { SettingsService } from '../../../core/services/settings.service';
import { Product } from '../../../core/models/product.model';
import { Category } from '../../../core/models/category.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private readonly productService = inject(AdminProductService);
  private readonly categoryService = inject(CategoryService);
  protected readonly cartService = inject(CartService);
  private readonly settingsService = inject(SettingsService);

  readonly categories = signal<Category[]>([]);
  readonly products = signal<Product[]>([]);
  readonly totalProductsCount = signal<number>(0);

  ngOnInit(): void {
    this.categoryService.getCategories().subscribe({
      next: (response) => {
        console.log('Categories in Home component:', response);
        this.categories.set(response);
      },
      error: (error) => {
        console.error('Category API error in Home:', error);
      }
    });

    this.productService.getHomePageProductsResponse().subscribe({
      next: (response) => {
        console.log('Home offered products (Recordset 1):', response.offeredProducts);
        console.log('Home total product count (Recordset 3):', response.totalProducts);
        this.products.set(response.offeredProducts);
        this.totalProductsCount.set(response.totalProducts);
      },
      error: (error) => {
        console.error('Offered products API error in Home:', error);
      }
    });
  }

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

  readonly selectedProductForUnits = signal<Product | null>(null);

  selectCategory(catId: string): void {
    this.selectedCategoryId.set(catId);
  }

  getItemQty(productId: string): number {
    return this.cartService.getItemQuantity(productId);
  }

  getGroupCartQty(product: Product): number {
    if (!product.variants || product.variants.length <= 1) {
      return this.cartService.getItemQuantity(product.id);
    }
    return product.variants.reduce((total, v) => total + this.cartService.getItemQuantity(v.id), 0);
  }

  openUnitModal(product: Product): void {
    this.selectedProductForUnits.set(product);
  }

  closeUnitModal(): void {
    this.selectedProductForUnits.set(null);
  }

  handleCardAddClick(product: Product): void {
    if (product.variants && product.variants.length > 1) {
      this.openUnitModal(product);
    } else {
      this.addToCart(product);
    }
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
