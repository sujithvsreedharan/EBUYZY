import { Component, Input, Output, EventEmitter, OnInit, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Product } from '../../../core/models/product.model';
import { AdminProductService } from '../../../core/services/admin-product.service';
import { CartService } from '../../../core/services/cart.service';

@Component({
  selector: 'app-product-detail-modal',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      (click)="onBackdropClick($event)">

      <!-- Modal Card -->
      <div
        class="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col md:flex-row max-h-[92vh] animate-in zoom-in-95 duration-200"
        (click)="$event.stopPropagation()">

        <!-- Close Button -->
        <button
          type="button"
          (click)="closeModal()"
          aria-label="Close product details"
          class="absolute top-3.5 right-3.5 z-20 w-8 h-8 rounded-full bg-white/90 dark:bg-gray-800/90 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white shadow-md hover:shadow-lg flex items-center justify-center border border-gray-200 dark:border-gray-700 transition-all duration-150">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- ================= LEFT COLUMN: IMAGES SLIDER / CAROUSEL ================= -->
        <div class="w-full md:w-1/2 bg-gray-50 dark:bg-gray-800/50 p-4 sm:p-6 flex flex-col items-center justify-between relative border-b md:border-b-0 md:border-r border-gray-100 dark:border-gray-800 shrink-0 select-none">

          <!-- Main Image Slide Container -->
          <div class="relative w-full aspect-square max-h-[280px] sm:max-h-[320px] flex items-center justify-center overflow-hidden rounded-2xl bg-white dark:bg-gray-900/60 shadow-xs border border-gray-100 dark:border-gray-800/60">
            @if (activeImageUrl()) {
              <img
                [src]="activeImageUrl()"
                [alt]="activeProduct().name"
                class="w-full h-full object-contain p-2 transition-all duration-300 transform"
                loading="eager"
                onerror="this.src='/logo/ebuyzy-icon-2.png'" />
            } @else {
              <img
                src="/logo/ebuyzy-icon-2.png"
                [alt]="activeProduct().name"
                class="w-24 h-24 object-contain opacity-70" />
            }

            <!-- Slide Counter Badge (when multiple images) -->
            @if (images().length > 1) {
              <span class="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-black/60 text-white backdrop-blur-xs shadow-xs">
                {{ currentSlideIndex() + 1 }} / {{ images().length }}
              </span>
            }

            <!-- Previous Slide Button -->
            @if (images().length > 1) {
              <button
                type="button"
                (click)="prevSlide($event)"
                aria-label="Previous image"
                class="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-md flex items-center justify-center transition-transform hover:scale-110 active:scale-95 border border-gray-200 dark:border-gray-700">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            }

            <!-- Next Slide Button -->
            @if (images().length > 1) {
              <button
                type="button"
                (click)="nextSlide($event)"
                aria-label="Next image"
                class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-md flex items-center justify-center transition-transform hover:scale-110 active:scale-95 border border-gray-200 dark:border-gray-700">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            }
          </div>

          <!-- Thumbnails Strip / Indicators (when multiple images) -->
          @if (images().length > 1) {
            <div class="flex items-center gap-2 mt-3 overflow-x-auto max-w-full py-1 px-1">
              @for (img of images(); track $index) {
                <button
                  type="button"
                  (click)="goToSlide($index)"
                  [attr.aria-label]="'Go to image ' + ($index + 1)"
                  class="relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all duration-150 shrink-0 bg-white dark:bg-gray-900"
                  [ngClass]="currentSlideIndex() === $index ? 'border-[#FF9500] ring-2 ring-[#FF9500]/30 scale-105' : 'border-gray-200 dark:border-gray-700 opacity-60 hover:opacity-100'">
                  <img
                    [src]="img"
                    alt="Thumbnail"
                    class="w-full h-full object-cover"
                    onerror="this.src='/logo/ebuyzy-icon-2.png'" />
                </button>
              }
            </div>
          }
        </div>

        <!-- ================= RIGHT COLUMN: PRODUCT DETAILS & ACTIONS ================= -->
        <div class="w-full md:w-1/2 p-5 sm:p-6 flex flex-col justify-between overflow-y-auto space-y-4">
          
          <div class="space-y-3.5">
            <!-- Badges Row: Category & In-Stock -->
            <div class="flex flex-wrap items-center gap-2">
              @if (activeProduct().categoryName || activeProduct().category) {
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40">
                  {{ activeProduct().categoryName || activeProduct().category }}
                </span>
              }

              @if (activeProduct().inStock && activeProduct().stock > 0) {
                @if (activeProduct().stock < 10) {
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    Only {{ activeProduct().stock }} left in stock
                  </span>
                } @else {
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    In Stock
                  </span>
                }
              } @else {
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/40">
                  Out of Stock
                </span>
              }
            </div>

            <!-- Product Title -->
            <h2 class="text-xl sm:text-2xl font-black text-gray-900 dark:text-white leading-tight">
              {{ activeProduct().name }}
            </h2>

            <!-- Price & Savings Section -->
            <div class="flex items-baseline flex-wrap gap-2.5 pt-0.5">
              <span class="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                ₹{{ activeProduct().price }}
              </span>

              @if (activeProduct().mrp && activeProduct().mrp! > activeProduct().price) {
                <span class="text-sm sm:text-base font-semibold text-gray-400 dark:text-gray-500 line-through">
                  ₹{{ activeProduct().mrp }}
                </span>

                <span class="px-2 py-0.5 rounded-lg text-xs font-black bg-emerald-600 text-white shadow-xs">
                  @if (activeProduct().offerType === 'PERCENT') {
                    {{ (activeProduct().offerValue ?? activeProduct().offerPercentage ?? activeProduct().discountPercentage) | number:'1.0-0' }}% OFF
                  } @else {
                    ₹{{ activeProduct().offerValue ?? activeProduct().offerAmount ?? activeProduct().discountPrice }} OFF
                  }
                </span>
              }
            </div>

            <!-- Unit / Pack Size Selection -->
            <div>
              <span class="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                Pack Size / Unit
              </span>

              @if (product?.variants && product!.variants!.length > 1) {
                <!-- Multi-unit Variants Switcher -->
                <div class="flex flex-wrap gap-2">
                  @for (variant of product!.variants; track variant.id) {
                    <button
                      type="button"
                      (click)="selectVariant(variant)"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all duration-150"
                      [ngClass]="activeProduct().id === variant.id ? 'border-[#FF9500] bg-[#FF9500]/10 text-[#FF9500] shadow-xs' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'">
                      {{ variant.unit }} &bull; ₹{{ variant.price }}
                    </button>
                  }
                </div>
              } @else {
                <span class="inline-block px-3 py-1 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                  {{ activeProduct().unit || '1 unit' }}
                </span>
              }
            </div>

            <!-- Product Details / Description -->
            <div class="pt-2 border-t border-gray-100 dark:border-gray-800">
              <span class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">
                Product Details
              </span>
              <p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed max-h-32 overflow-y-auto">
                {{ activeProduct().details || activeDescription() || 'Freshly sourced high-quality grocery produce, carefully packed and delivered to your doorstep.' }}
              </p>
            </div>
          </div>

          <!-- Bottom Action Buttons -->
          <div class="pt-4 border-t border-gray-100 dark:border-gray-800">
            @if (activeProduct().inStock && activeProduct().stock > 0) {
              @if (currentCartQty() > 0) {
                <!-- Quantity Stepper -->
                <div class="flex items-center justify-between p-2 rounded-2xl bg-amber-50/80 dark:bg-gray-800 border border-amber-200 dark:border-gray-700">
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      (click)="onDecrement()"
                      class="w-10 h-10 rounded-xl bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-black text-lg flex items-center justify-center shadow-xs border border-gray-200 dark:border-gray-600 transition-colors active:scale-95">
                      &minus;
                    </button>
                    <span class="w-10 text-center font-black text-base text-gray-900 dark:text-white">
                      {{ currentCartQty() }}
                    </span>
                    <button
                      type="button"
                      (click)="onAdd()"
                      class="w-10 h-10 rounded-xl bg-[#FF9500] hover:bg-[#e08300] text-white font-black text-lg flex items-center justify-center shadow-xs transition-colors active:scale-95">
                      &#43;
                    </button>
                  </div>

                  <span class="text-xs font-extrabold text-amber-900 dark:text-amber-400 mr-2">
                    ₹{{ activeProduct().price * currentCartQty() }} in cart
                  </span>
                </div>
              } @else {
                <!-- Add to Cart Button -->
                <button
                  type="button"
                  (click)="onAdd()"
                  class="w-full py-3.5 px-6 rounded-2xl bg-[#FF9500] hover:bg-[#e08300] text-white font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all duration-150 active:scale-98">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                      d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>Add to Cart</span>
                </button>
              }
            } @else {
              <button
                type="button"
                disabled
                class="w-full py-3 px-6 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-bold text-sm cursor-not-allowed">
                Currently Out of Stock
              </button>
            }
          </div>

        </div>
      </div>
    </div>
  `
})
export class ProductDetailModalComponent implements OnInit {
  @Input() product: Product | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() addToCart = new EventEmitter<Product>();
  @Output() decrement = new EventEmitter<string>();

  private readonly productService = inject(AdminProductService);
  private readonly cartService = inject(CartService);

  readonly currentSlideIndex = signal<number>(0);
  readonly images = signal<string[]>([]);
  readonly selectedVariant = signal<Product | null>(null);
  readonly activeDescription = signal<string | null>(null);

  // Computes which variant is currently active
  readonly activeProduct = computed<Product>(() => {
    return this.selectedVariant() || this.product || ({} as Product);
  });

  // Current main display image
  readonly activeImageUrl = computed<string>(() => {
    const list = this.images();
    const idx = this.currentSlideIndex();
    if (list.length > 0 && list[idx]) {
      return list[idx];
    }
    return this.activeProduct().imageUrl || '/logo/ebuyzy-icon-2.png';
  });

  // Current item quantity in cart
  readonly currentCartQty = computed<number>(() => {
    const p = this.activeProduct();
    return p.id ? this.cartService.getItemQuantity(p.id) : 0;
  });

  ngOnInit(): void {
    if (this.product) {
      this.selectedVariant.set(this.product);
      this.loadProductImagesAndDetails(this.product);
    }
  }

  private loadProductImagesAndDetails(prod: Product): void {
    // 1. Start immediately with primary product image
    const mainImg = prod.imageUrl || (prod.productImage ? this.productService.resolveImageUrl(prod.productImage) : '/logo/ebuyzy-icon-2.png');
    let initialList: string[] = [];

    if (prod.galleryImages && prod.galleryImages.length > 0) {
      initialList = prod.galleryImages.map(img => this.productService.resolveImageUrl(img));
      if (!initialList.includes(mainImg) && !mainImg.includes('ebuyzy-icon-2')) {
        initialList.unshift(mainImg);
      }
    } else {
      initialList = [mainImg];
    }

    this.images.set(initialList);
    this.currentSlideIndex.set(0);

    // 2. Fetch full product details from API to ensure all gallery images from EB_PRODUCT_IMAGE are loaded
    if (prod.id) {
      this.productService.getProductById(prod.id).subscribe({
        next: (res) => {
          if (res?.success && res.data) {
            const data = res.data;
            if (data.PRODUCT_DESC && !this.product?.details) {
              this.activeDescription.set(data.PRODUCT_DESC);
            }

            if (data.galleryImages && Array.isArray(data.galleryImages) && data.galleryImages.length > 0) {
              const fetchedList = data.galleryImages.map((img: string) => this.productService.resolveImageUrl(img));
              // Ensure primary image is at the start if available
              if (!fetchedList.includes(mainImg) && !mainImg.includes('ebuyzy-icon-2')) {
                fetchedList.unshift(mainImg);
              }
              this.images.set(fetchedList);
            }
          }
        },
        error: (err) => console.log('Could not fetch extra product images for modal:', err)
      });
    }
  }

  selectVariant(variant: Product): void {
    this.selectedVariant.set(variant);
    this.loadProductImagesAndDetails(variant);
  }

  prevSlide(event?: Event): void {
    event?.stopPropagation();
    const count = this.images().length;
    if (count > 1) {
      this.currentSlideIndex.update((i) => (i > 0 ? i - 1 : count - 1));
    }
  }

  nextSlide(event?: Event): void {
    event?.stopPropagation();
    const count = this.images().length;
    if (count > 1) {
      this.currentSlideIndex.update((i) => (i < count - 1 ? i + 1 : 0));
    }
  }

  goToSlide(index: number): void {
    this.currentSlideIndex.set(index);
  }

  onAdd(): void {
    this.addToCart.emit(this.activeProduct());
  }

  onDecrement(): void {
    this.decrement.emit(this.activeProduct().id);
  }

  closeModal(): void {
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    this.closeModal();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeModal();
    } else if (event.key === 'ArrowLeft') {
      this.prevSlide();
    } else if (event.key === 'ArrowRight') {
      this.nextSlide();
    }
  }
}
