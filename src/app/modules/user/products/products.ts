import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminProductService } from '../../../core/services/admin-product.service';
import { CategoryService } from '../../../core/services/category.service';
import { CartService } from '../../../core/services/cart.service';
import { Product } from '../../../core/models/product.model';

export interface CategoryTile {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
  count: number;
}

@Component({
  selector: 'app-user-products',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './products.html',
  styleUrl: './products.css',
})
export class Products implements OnInit {
  private readonly productService = inject(AdminProductService);
  private readonly categoryService = inject(CategoryService);
  protected readonly cartService = inject(CartService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly products = toSignal(this.productService.getProducts(), { initialValue: [] });
  readonly categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });

  readonly selectedCategoryId = signal<string>('all');
  readonly searchQuery = signal<string>('');
  readonly sortBy = signal<'featured' | 'price-low' | 'price-high' | 'name'>('featured');
  readonly inStockOnly = signal<boolean>(false);

  ngOnInit(): void {
    // Check if category is passed via query params (e.g. /products?category=cat-2)
    this.route.queryParams.subscribe((params) => {
      const cat = params['category'];
      if (cat && cat !== this.selectedCategoryId()) {
        this.selectedCategoryId.set(cat);
        this.scrollToProducts();
      }
      if (params['search'] && params['search'] !== this.searchQuery()) {
        this.searchQuery.set(params['search']);
      }
    });
  }

  // Categories formatted as visual tiles with icons and dynamic counts
  readonly categoryTiles = computed<CategoryTile[]>(() => {
    const allProds = this.products();
    const cats = this.categories();

    const iconsMap: Record<string, string> = {
      'cat-1': '🥬',
      'cat-2': '🌾',
      'cat-3': '🥥',
      'cat-4': '🌶️',
      'cat-5': '🥛',
      'cat-6': '🍌'
    };

    const allTile: CategoryTile = {
      id: 'all',
      name: 'All Produce',
      slug: 'all',
      icon: '🧺',
      description: 'Every fresh Kerala staple in stock',
      count: allProds.length
    };

    const tiles: CategoryTile[] = cats.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: iconsMap[c.id] || '🛒',
      description: c.description || 'Fresh daily farm harvest',
      count: allProds.filter((p) => p.categoryId === c.id).length
    }));

    return [allTile, ...tiles];
  });

  // Selected category title helper
  readonly activeCategoryTitle = computed(() => {
    const selectedId = this.selectedCategoryId();
    if (selectedId === 'all') return 'All Kerala Produce';
    const found = this.categories().find((c) => c.id === selectedId);
    return found ? found.name : 'Category Produce';
  });

  // Filtered and sorted products
  readonly filteredProducts = computed(() => {
    let list = this.products();
    const catId = this.selectedCategoryId();
    const query = this.searchQuery().trim().toLowerCase();
    const inStock = this.inStockOnly();
    const sort = this.sortBy();

    // 1. Category Filter
    if (catId !== 'all') {
      list = list.filter((p) => p.categoryId === catId);
    }

    // 2. Search Query Filter
    if (query) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.categoryName && p.categoryName.toLowerCase().includes(query)) ||
          p.unit.toLowerCase().includes(query)
      );
    }

    // 3. In-Stock Filter
    if (inStock) {
      list = list.filter((p) => p.inStock && p.stock > 0);
    }

    // 4. Sorting
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'price-low':
          return a.price - b.price;
        case 'price-high':
          return b.price - a.price;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'featured':
        default:
          return 0;
      }
    });
  });

  selectCategory(catId: string, shouldScroll: boolean = true): void {
    this.selectedCategoryId.set(catId);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { category: catId === 'all' ? null : catId },
      queryParamsHandling: 'merge'
    });

    if (shouldScroll) {
      this.scrollToProducts();
    }
  }

  scrollToProducts(): void {
    // Small timeout ensures DOM and route state are updated
    setTimeout(() => {
      const el = document.getElementById('listed-products');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  }

  setSortBy(sort: 'featured' | 'price-low' | 'price-high' | 'name'): void {
    this.sortBy.set(sort);
  }

  toggleInStockOnly(): void {
    this.inStockOnly.update((v) => !v);
  }

  getItemQty(productId: string): number {
    return this.cartService.getItemQuantity(productId);
  }

  addToCart(product: Product): void {
    this.cartService.addToCart(product);
  }

  decrementItem(productId: string): void {
    this.cartService.decrementItem(productId);
  }

  resetFilters(): void {
    this.selectedCategoryId.set('all');
    this.searchQuery.set('');
    this.inStockOnly.set(false);
    this.sortBy.set('featured');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { category: null, search: null }
    });
  }
}
