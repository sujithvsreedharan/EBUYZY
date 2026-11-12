import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminProductService } from '../../../core/services/admin-product.service';
import { CategoryService } from '../../../core/services/category.service';
import { Product } from '../../../core/models/product.model';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './products.html',
  styleUrl: './products.css',
})
export class Products {
  private readonly fb = inject(FormBuilder);
  private readonly productService = inject(AdminProductService);
  private readonly categoryService = inject(CategoryService);

  // Reactive data streams to Signals
  readonly products = toSignal(this.productService.getProducts(), { initialValue: [] });
  readonly categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });

  // State Signals
  readonly searchQuery = signal<string>('');
  readonly selectedCategoryId = signal<string>('all');
  readonly isFormOpen = signal<boolean>(false);
  readonly editingProduct = signal<Product | null>(null);
  readonly productToDelete = signal<Product | null>(null);
  readonly isSubmitting = signal<boolean>(false);

  // Reactive form for Add/Edit product
  readonly productForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    categoryId: ['', [Validators.required]],
    price: [null, [Validators.required, Validators.min(1)]],
    unit: ['1 kg', [Validators.required]],
    imageUrl: ['', [Validators.required]],
    stock: [10, [Validators.required, Validators.min(0)]],
    inStock: [true]
  });

  // KPI calculations
  readonly inStockCount = computed(() => this.products().filter((p) => p.inStock && p.stock > 0).length);
  readonly lowStockCount = computed(() => this.products().filter((p) => p.stock < 10 && p.stock > 0).length);
  readonly outOfStockCount = computed(() => this.products().filter((p) => !p.inStock || p.stock === 0).length);

  // Filtered products computed list
  readonly filteredProducts = computed(() => {
    const list = this.products();
    const query = this.searchQuery().trim().toLowerCase();
    const catId = this.selectedCategoryId();

    return list.filter((p) => {
      const matchesCategory = catId === 'all' || p.categoryId === catId;
      const matchesQuery =
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.unit.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query);

      return matchesCategory && matchesQuery;
    });
  });

  getCategoryName(catId: string): string {
    const found = this.categories().find((c) => c.id === catId);
    return found ? found.name : 'Produce';
  }

  // Inline stock actions
  incrementStock(product: Product): void {
    this.productService.updateStock(product.id, product.stock + 1).subscribe();
  }

  decrementStock(product: Product): void {
    if (product.stock > 0) {
      this.productService.updateStock(product.id, product.stock - 1).subscribe();
    }
  }

  toggleInStock(product: Product): void {
    this.productService.toggleInStock(product.id).subscribe();
  }

  // Modal open / close handlers
  openAddModal(): void {
    this.editingProduct.set(null);
    this.productForm.reset({
      name: '',
      categoryId: this.categories()[0]?.id || '',
      price: null,
      unit: '1 kg',
      imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=300&auto=format&fit=crop&q=60',
      stock: 15,
      inStock: true
    });
    this.isFormOpen.set(true);
  }

  openEditModal(product: Product): void {
    this.editingProduct.set(product);
    this.productForm.setValue({
      name: product.name,
      categoryId: product.categoryId,
      price: product.price,
      unit: product.unit,
      imageUrl: product.imageUrl,
      stock: product.stock,
      inStock: product.inStock
    });
    this.isFormOpen.set(true);
  }

  closeFormModal(): void {
    this.isFormOpen.set(false);
    this.editingProduct.set(null);
    this.productForm.reset();
  }

  setUnit(unit: string): void {
    this.productForm.patchValue({ unit });
  }

  toggleFormInStock(): void {
    const current = this.productForm.get('inStock')?.value;
    this.productForm.patchValue({ inStock: !current });
  }

  saveProduct(): void {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const formVal = this.productForm.getRawValue();
    const categoryName = this.getCategoryName(formVal.categoryId);

    if (this.editingProduct()) {
      this.productService
        .updateProduct(this.editingProduct()!.id, {
          ...formVal,
          categoryName
        })
        .subscribe({
          next: () => {
            this.isSubmitting.set(false);
            this.closeFormModal();
          },
          error: () => this.isSubmitting.set(false)
        });
    } else {
      this.productService
        .addProduct({
          name: formVal.name,
          categoryId: formVal.categoryId,
          categoryName,
          price: Number(formVal.price),
          unit: formVal.unit,
          imageUrl: formVal.imageUrl,
          stock: Number(formVal.stock),
          inStock: Boolean(formVal.inStock)
        })
        .subscribe({
          next: () => {
            this.isSubmitting.set(false);
            this.closeFormModal();
          },
          error: () => this.isSubmitting.set(false)
        });
    }
  }

  confirmDelete(product: Product): void {
    this.productToDelete.set(product);
  }

  executeDelete(id: string): void {
    this.productService.deleteProduct(id).subscribe({
      next: () => {
        this.productToDelete.set(null);
      }
    });
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedCategoryId.set('all');
  }
}
