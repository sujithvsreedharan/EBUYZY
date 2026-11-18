import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminProductService } from '../../../core/services/admin-product.service';
import { CategoryService } from '../../../core/services/category.service';
import { CartService } from '../../../core/services/cart.service';
import { Product } from '../../../core/models/product.model';
import { Category } from '../../../core/models/category.model';

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
  imports: [CommonModule, FormsModule, DecimalPipe],
  templateUrl: './products.html',
  styleUrl: './products.css',
})
export class Products implements OnInit {
  private readonly productService = inject(AdminProductService);
  private readonly categoryService = inject(CategoryService);
  protected readonly cartService = inject(CartService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly totalProductsCount = signal<number>(0);

  readonly selectedCategoryId = signal<string>('all');
  readonly searchQuery = signal<string>('');
  readonly sortBy = signal<'featured' | 'price-low' | 'price-high' | 'name'>('featured');
  readonly inStockOnly = signal<boolean>(false);

  ngOnInit(): void {
    this.categoryService.getCategories().subscribe({
      next: (response) => {
        console.log('Categories in Products component:', response);
        this.categories.set(response);
      },
      error: (error) => {
        console.error('Category API error in Products:', error);
      }
    });

    this.productService.getAllProductsResponse().subscribe({
      next: (response) => {
        console.log('Products page all products (Recordset 1):', response.products);
        console.log('Products page total product count (Recordset 3):', response.totalRecords);
        this.products.set(response.products);
        this.totalProductsCount.set(response.totalRecords);
      },
      error: (error) => {
        console.error('Products API error in Products page:', error);
      }
    });

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
      'cat-6': '🍌',
      'FRUITS_VEG': '🥦',
      'FRUITS-VEG': '🍎',
      'GROCERY': '🌾',
      'DAIRY_BREAKFAST': '🥛',
      'DAIRY-EGGS': '🥚',
      'BAKERY_STAPLES': '🍞',
      'SNACKS': '🍿',
      'SNACKS_BEV': '☕',
      'BEVERAGES': '🧃',
      'PERSONAL-CARE': '🧴'
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
      slug: c.slug || '',
      icon: iconsMap[c.id] || (c.code ? iconsMap[c.code] : undefined) || '🛒',
      description: c.description || 'Fresh daily farm harvest',
      count: c.productCount ?? 0,
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

  readonly selectedProductForUnits = signal<Product | null>(null);

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
