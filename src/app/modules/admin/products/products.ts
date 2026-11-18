import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
export class Products implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly productService = inject(AdminProductService);
  private readonly categoryService = inject(CategoryService);

  // Reactive data streams to Signals
  readonly products = signal<Product[]>([]);
  readonly categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });

  // State Signals
  readonly searchQuery = signal<string>('');
  readonly selectedCategoryId = signal<string>('all');
  readonly isFormOpen = signal<boolean>(false);
  readonly editingProduct = signal<Product | null>(null);
  readonly productToDelete = signal<Product | null>(null);
  readonly isSubmitting = signal<boolean>(false);
  readonly isDeleting = signal<boolean>(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  // Reactive form for Add/Edit product
  readonly productForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    categoryId: ['', [Validators.required]],
    mrp: [null, [Validators.required, Validators.min(1)]],
    price: [null],
    unit: ['1 kg', [Validators.required]],
    imageUrl: ['', [Validators.required]],
    stock: [10, [Validators.required, Validators.min(0)]],
    description: [''],
    offerType: [''],
    offerValue: [null],
    isFeatured: [false],
    inStock: [true]
  });

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
    this.productService.getProducts().subscribe({
      next: (data) => this.products.set(data),
      error: (err) => console.error('Failed to load products:', err)
    });
  }

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
    this.productService.updateStock(product.id, { delta: 1 }).subscribe({
      next: () => this.loadProducts()
    });
  }

  decrementStock(product: Product): void {
    if (product.stock > 0) {
      this.productService.updateStock(product.id, { delta: -1 }).subscribe({
        next: () => this.loadProducts()
      });
    }
  }

  toggleInStock(product: Product): void {
    const nextActive = !product.isActive;
    this.productService.updateProduct(product.id, {
      ...product,
      isActive: nextActive ? 1 : 0
    }).subscribe({
      next: () => this.loadProducts(),
      error: (err) => console.error('Error toggling product status:', err)
    });
  }

  // Modal open / close handlers
  openAddModal(): void {
    this.editingProduct.set(null);
    this.productForm.reset({
      name: '',
      categoryId: this.categories()[0]?.id || '',
      mrp: null,
      price: null,
      unit: '1 kg',
      imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=300&auto=format&fit=crop&q=60',
      stock: 15,
      description: '',
      offerType: '',
      offerValue: null,
      isFeatured: false,
      inStock: true
    });
    this.isFormOpen.set(true);
  }

  openEditModal(product: Product): void {
    this.editingProduct.set(product);
    this.productForm.patchValue({
      name: product.name,
      categoryId: product.categoryId,
      mrp: product.mrp ?? product.price,
      price: product.sellingPrice ?? product.price,
      unit: product.unit,
      imageUrl: product.imageUrl || product.productImage || '',
      stock: product.stock,
      description: product.details || '',
      offerType: product.offerType || '',
      offerValue: product.offerValue ?? null,
      isFeatured: Boolean(product.isFeatured),
      inStock: product.isActive !== undefined ? Boolean(product.isActive) : Boolean(product.inStock)
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
    const mrp = Number(formVal.mrp || formVal.price);
    const sellingPrice = formVal.price ? Number(formVal.price) : mrp;

    if (this.editingProduct()) {
      this.productService
        .updateProduct(this.editingProduct()!.id, {
          name: formVal.name,
          categoryId: formVal.categoryId,
          categoryName,
          mrp,
          sellingPrice,
          price: sellingPrice,
          unit: formVal.unit,
          imageUrl: formVal.imageUrl,
          stock: Number(formVal.stock),
          details: formVal.description,
          offerType: formVal.offerType || null,
          offerValue: formVal.offerValue ? Number(formVal.offerValue) : null,
          isFeatured: Boolean(formVal.isFeatured),
          isActive: formVal.inStock ? 1 : 0,
          inStock: Boolean(formVal.inStock)
        })
        .subscribe({
          next: () => {
            this.isSubmitting.set(false);
            this.closeFormModal();
            this.loadProducts();
          },
          error: () => this.isSubmitting.set(false)
        });
    } else {
      this.productService
        .addProduct({
          productName: formVal.name,
          mrp: mrp,
          sellingPrice: sellingPrice,
          categoryId: formVal.categoryId ? Number(formVal.categoryId) : null,
          categoryName: categoryName,
          description: formVal.description || null,
          unit: formVal.unit || '1 item',
          stock: Number(formVal.stock || 0),
          productImage: formVal.imageUrl || null,
          isFeatured: Boolean(formVal.isFeatured),
          offerType: formVal.offerType || null,
          offerValue: formVal.offerValue ? Number(formVal.offerValue) : null,
          // compatibility fields
          name: formVal.name,
          price: sellingPrice,
          imageUrl: formVal.imageUrl,
          inStock: Boolean(formVal.inStock)
        })
        .subscribe({
          next: () => {
            this.isSubmitting.set(false);
            this.closeFormModal();
            this.loadProducts();
          },
          error: (err) => {
            console.error('Error adding product:', err);
            this.isSubmitting.set(false);
          }
        });
    }
  }

  confirmDelete(product: Product): void {
    this.productToDelete.set(product);
  }

  executeDelete(id: string): void {
    this.isDeleting.set(true);
    this.errorMessage.set(null);

    this.productService.deleteProduct(id).subscribe({
      next: (res) => {
        this.isDeleting.set(false);
        this.productToDelete.set(null);
        const msg = res?.message || 'Product deleted successfully.';
        this.successMessage.set(msg);
        this.loadProducts();
        setTimeout(() => this.successMessage.set(null), 5000);
      },
      error: (err) => {
        this.isDeleting.set(false);
        console.error('Error deleting product:', err);
        this.errorMessage.set(err?.error?.message || 'Failed to delete product.');
        this.productToDelete.set(null);
      }
    });
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedCategoryId.set('all');
  }
}
