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

  // Local Image Upload State
  readonly selectedMainFile = signal<File | null>(null);
  readonly mainImagePreview = signal<string | null>(null);
  readonly selectedGalleryFiles = signal<File[]>([]);
  readonly galleryPreviews = signal<string[]>([]);
  readonly existingGalleryImages = signal<string[]>([]);

  // Reactive form for Add/Edit product
  readonly productForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    categoryId: ['', [Validators.required]],
    mrp: [null, [Validators.required, Validators.min(1)]],
    price: [null],
    unit: ['1 kg', [Validators.required]],
    imageUrl: [''],
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

  // Image selection handlers
  onMainImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.selectedMainFile.set(file);
      const reader = new FileReader();
      reader.onload = () => {
        this.mainImagePreview.set(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  removeMainImage(): void {
    this.selectedMainFile.set(null);
    this.mainImagePreview.set(null);
    this.productForm.patchValue({ imageUrl: '' });
  }

  onGalleryImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const newFiles = Array.from(input.files);
      this.selectedGalleryFiles.update(files => [...files, ...newFiles]);

      for (const file of newFiles) {
        const reader = new FileReader();
        reader.onload = () => {
          this.galleryPreviews.update(previews => [...previews, reader.result as string]);
        };
        reader.readAsDataURL(file);
      }
      input.value = '';
    }
  }

  removeNewGalleryImage(index: number): void {
    this.selectedGalleryFiles.update(files => files.filter((_, i) => i !== index));
    this.galleryPreviews.update(previews => previews.filter((_, i) => i !== index));
  }

  removeExistingGalleryImage(index: number): void {
    this.existingGalleryImages.update(imgs => imgs.filter((_, i) => i !== index));
  }

  // Modal open / close handlers
  openAddModal(): void {
    this.editingProduct.set(null);
    this.selectedMainFile.set(null);
    this.mainImagePreview.set(null);
    this.selectedGalleryFiles.set([]);
    this.galleryPreviews.set([]);
    this.existingGalleryImages.set([]);

    this.productForm.reset({
      name: '',
      categoryId: this.categories()[0]?.id || '',
      mrp: null,
      price: null,
      unit: '1 kg',
      imageUrl: '',
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
    this.selectedMainFile.set(null);
    const initialMain = product.imageUrl && !product.imageUrl.includes('ebuyzy-icon-2') ? product.imageUrl : null;
    this.mainImagePreview.set(initialMain);
    this.selectedGalleryFiles.set([]);
    this.galleryPreviews.set([]);
    this.existingGalleryImages.set(product.galleryImages || []);

    // Also fetch product details by ID to populate any gallery images in DB
    this.productService.getProductById(product.id).subscribe({
      next: (res) => {
        if (res?.data?.galleryImages && Array.isArray(res.data.galleryImages)) {
          const resolved = res.data.galleryImages.map((img: string) => this.productService.resolveImageUrl(img));
          this.existingGalleryImages.set(resolved);
        }
      },
      error: () => {}
    });

    this.productForm.patchValue({
      name: product.name,
      categoryId: product.categoryId,
      mrp: product.mrp ?? product.price,
      price: product.sellingPrice ?? product.price,
      unit: product.unit,
      imageUrl: product.imageUrl || '',
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
    this.selectedMainFile.set(null);
    this.mainImagePreview.set(null);
    this.selectedGalleryFiles.set([]);
    this.galleryPreviews.set([]);
    this.existingGalleryImages.set([]);
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

    const executeSave = (mainImg: string | null, galleryImgs: string[]) => {
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
            productImage: mainImg,
            imageUrl: mainImg || '/logo/ebuyzy-icon-2.png',
            galleryImages: galleryImgs,
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
              this.successMessage.set('Product updated successfully!');
              setTimeout(() => this.successMessage.set(null), 4000);
            },
            error: (err) => {
              console.error('Error updating product:', err);
              this.isSubmitting.set(false);
              this.errorMessage.set(err?.error?.message || 'Failed to update product');
              setTimeout(() => this.errorMessage.set(null), 4000);
            }
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
            productImage: mainImg,
            galleryImages: galleryImgs,
            isFeatured: Boolean(formVal.isFeatured),
            offerType: formVal.offerType || null,
            offerValue: formVal.offerValue ? Number(formVal.offerValue) : null,
            // compatibility fields
            name: formVal.name,
            price: sellingPrice,
            imageUrl: mainImg || '/logo/ebuyzy-icon-2.png',
            inStock: Boolean(formVal.inStock)
          })
          .subscribe({
            next: () => {
              this.isSubmitting.set(false);
              this.closeFormModal();
              this.loadProducts();
              this.successMessage.set('Product added successfully!');
              setTimeout(() => this.successMessage.set(null), 4000);
            },
            error: (err) => {
              console.error('Error adding product:', err);
              this.isSubmitting.set(false);
              this.errorMessage.set(err?.error?.message || 'Failed to add product');
              setTimeout(() => this.errorMessage.set(null), 4000);
            }
          });
      }
    };

    // Check if new local files need to be uploaded
    const mainFile = this.selectedMainFile();
    const galleryFiles = this.selectedGalleryFiles();

    if (mainFile || galleryFiles.length > 0) {
      const formData = new FormData();
      if (mainFile) {
        formData.append('mainImage', mainFile);
      }
      for (const file of galleryFiles) {
        formData.append('galleryImages', file);
      }

      this.productService.uploadProductImages(formData).subscribe({
        next: (uploadRes) => {
          const finalMainImg = uploadRes.mainImageUrl || (this.mainImagePreview() && !this.mainImagePreview()?.includes('ebuyzy-icon-2') ? this.mainImagePreview() : null);
          const finalGallery = [
            ...this.existingGalleryImages(),
            ...(uploadRes.galleryImageUrls || [])
          ];
          executeSave(finalMainImg, finalGallery);
        },
        error: (err) => {
          console.error('Image upload failed:', err);
          this.isSubmitting.set(false);
          this.errorMessage.set('Failed to upload image(s). Please try again.');
          setTimeout(() => this.errorMessage.set(null), 4000);
        }
      });
    } else {
      const existingMain = this.mainImagePreview();
      const cleanMain = existingMain && !existingMain.includes('ebuyzy-icon-2') ? existingMain : null;
      executeSave(cleanMain, this.existingGalleryImages());
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
