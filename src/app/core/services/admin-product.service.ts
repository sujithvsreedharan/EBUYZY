import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, of, tap } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { Product, AddProductPayload, UpdateProductPayload, UpdateStockPayload, UpdateStockResponse, DeleteProductResponse } from '../models/product.model';
import { HttpClient } from '@angular/common/http';
import { apiUrl } from '../../app.constant';

@Injectable({
  providedIn: 'root'
})
export class AdminProductService {
  private readonly STORAGE_KEY = 'ebuyzy_products';
  private apiUrl = apiUrl

  constructor(
    private http: HttpClient
  ) { }

  // In-memory initial mock product inventory for EBUYZY (Kerala 3-5 km delivery radius)
  private readonly defaultProducts: Product[] = [
  ];

  private readonly productsSubject = new BehaviorSubject<Product[]>(this.getStoredProducts());

  private getStoredProducts(): Product[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : this.defaultProducts;

    } catch {
      return this.defaultProducts;
    }

  }

  private persistProducts(products: Product[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(products));
    } catch { }
  }

  /**
   * Helper to map database table headings / API recordset 1 to frontend Product model:
   * id, code, product, categoryId, category, details, unit, mrp, sellingPrice,
   * discountPrice, discountPercentage, stock, productImage, IS_FEATURED, IS_ACTIVE
   */
  mapApiProduct(raw: any): Product {
    if (!raw) {
      return {} as Product;
    }
    const isAct = raw.IS_ACTIVE !== undefined ? Boolean(raw.IS_ACTIVE) : (raw.isActive !== undefined ? Boolean(raw.isActive) : true);
    const stockNum = Number(raw.stock ?? raw.STOCK_QTY ?? 0);
    const mrp = raw.mrp != null ? Number(raw.mrp) : (raw.MRP != null ? Number(raw.MRP) : undefined);
    const price = Number(raw.sellingPrice ?? raw.SELLING_PRICE ?? raw.price ?? raw.mrp ?? raw.MRP ?? 0);
    let discountPrice = raw.discountPrice != null ? Number(raw.discountPrice) : (raw.DISCOUNT_AMOUNT != null ? Number(raw.DISCOUNT_AMOUNT) : undefined);
    let discountPercentage = raw.discountPercentage != null ? Number(raw.discountPercentage) : (raw.DISCOUNT_PERCENT != null ? Number(raw.DISCOUNT_PERCENT) : undefined);

    if (mrp && mrp > price) {
      if (discountPrice == null || discountPrice <= 0) {
        discountPrice = Number((mrp - price).toFixed(2));
      }
      if (discountPercentage == null || discountPercentage <= 0) {
        discountPercentage = Number((((mrp - price) / mrp) * 100).toFixed(1));
      }
    }

    const offerType = raw.offerType ?? raw.OFFER_TYPE ?? null;
    const offerValue = raw.offerValue != null ? Number(raw.offerValue) : (raw.OFFER_VALUE != null ? Number(raw.OFFER_VALUE) : null);
    const offerAmount = raw.offerAmount != null ? Number(raw.offerAmount) : null;
    const offerPercentage = raw.offerPercentage != null ? Number(raw.offerPercentage) : null;

    return {
      id: String(raw.id ?? raw.PRODUCT_SLNO ?? ''),
      code: raw.code || raw.PRODUCT_CODE || '',
      name: raw.product || raw.productName || raw.PRODUCT_NAME || raw.name || '',
      product: raw.product || raw.productName || raw.PRODUCT_NAME || raw.name || '',
      categoryId: String(raw.categoryId ?? raw.CATEGORY_ID ?? raw.CATEGORY_DR ?? ''),
      categoryName: raw.category || raw.CATEGORY_NAME || raw.categoryName || '',
      category: raw.category || raw.CATEGORY_NAME || raw.categoryName || '',
      details: raw.details || raw.PRODUCT_DESC || raw.description || '',
      unit: raw.unit || raw.UNIT || '',
      mrp: mrp,
      sellingPrice: raw.sellingPrice != null ? Number(raw.sellingPrice) : (raw.SELLING_PRICE != null ? Number(raw.SELLING_PRICE) : price),
      discountPrice: discountPrice,
      discountPercentage: discountPercentage,
      price: price,
      stock: stockNum,
      imageUrl: raw.productImage || raw.PRODUCT_IMAGE || raw.imageUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60',
      productImage: raw.productImage || raw.PRODUCT_IMAGE || null,
      isFeatured: Boolean(raw.IS_FEATURED ?? raw.isFeatured),
      isActive: isAct,
      inStock: stockNum > 0 && isAct,
      offerType: offerType,
      offerValue: offerValue,
      offerAmount: offerAmount,
      offerPercentage: offerPercentage,
      createdAt: raw.createdAt ?? raw.CREATED_AT,
      updatedAt: raw.updatedAt ?? raw.UPDATED_AT,
    };
  }

  /**
   * Intelligently groups products that share the same base name & category into a single
   * parent product containing an array of unit variants (e.g., Atta 1kg & Atta 5kg).
   */
  groupProductVariants(products: Product[]): Product[] {
    const groups = new Map<string, Product[]>();

    for (const prod of products) {
      // Strip trailing weights/units like 1kg, 5kg, 1L, 500ml from the product name to find base name
      const baseName = prod.name
        .replace(/\s*\b\d+(\.\d+)?\s*(kg|g|gm|gms|l|litre|litres|ml|pcs|pack|bottle|loaf|bunch|pouch|jar)\b.*$/i, '')
        .trim()
        .toLowerCase() || prod.name.toLowerCase();

      const key = `${prod.categoryId}__${baseName}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(prod);
    }

    const result: Product[] = [];

    for (const [_, items] of groups.entries()) {
      if (items.length === 1) {
        result.push({
          ...items[0],
          variants: [items[0]]
        });
      } else {
        // Sort variants ascending by price
        items.sort((a, b) => a.price - b.price);

        const baseDisplayName = items[0].name
          .replace(/\s*\b\d+(\.\d+)?\s*(kg|g|gm|gms|l|litre|litres|ml|pcs|pack|bottle|loaf|bunch|pouch|jar)\b.*$/i, '')
          .trim() || items[0].name;

        result.push({
          ...items[0],
          name: baseDisplayName,
          variants: items
        });
      }
    }

    return result;
  }

  /**
   * PRODUCTS PAGE API:
   * Calls /api/getAllProducts
   * Recordset 1: All products
   * Recordset 3: Total product count (in pagination.totalRecords)
   */
  getProducts(params: any = {}): Observable<Product[]> {
    return this.http.post<any>(
      `${this.apiUrl}/api/getAllProducts`,
      { includeInactive: 1, pageSize: 50, ...params }
    ).pipe(
      tap((res) => console.log('AdminProductService getAllProducts raw response:', res)),
      map((res) => {
        const items = (res && Array.isArray(res.products) ? res.products : []) as any[];
        const mapped = items.map((p) => this.mapApiProduct(p));
        return this.groupProductVariants(mapped);
      })
    );
  }

  /**
   * HOME PAGE API:
   * Calls /api/getHomePageProducts
   * Recordset 1: Offered products
   * Recordset 3: Total offered product count (in pagination.totalProducts)
   */
  getOfferedProducts(params: any = {}): Observable<Product[]> {
    return this.http.post<any>(
      `${this.apiUrl}/api/getHomePageProducts`,
      params
    ).pipe(
      tap((res) => console.log('AdminProductService getHomePageProducts (offered products) raw response:', res)),
      map((res) => {
        const items = (res && Array.isArray(res.offeredProducts) ? res.offeredProducts : []) as any[];
        const mapped = items.map((p) => this.mapApiProduct(p));
        return this.groupProductVariants(mapped);
      })
    );
  }

  /**
   * Full response helper for Products page (including Recordset 3 totalRecords)
   */
  getAllProductsResponse(params: any = {}): Observable<{ products: Product[]; totalRecords: number; categories: any[] }> {
    return this.http.post<any>(
      `${this.apiUrl}/api/getAllProducts`,
      params
    ).pipe(
      tap((res) => console.log('AdminProductService getAllProducts full response:', res)),
      map((res) => {
        const items = (res && Array.isArray(res.products) ? res.products : []) as any[];
        const mapped = items.map((p) => this.mapApiProduct(p));
        return {
          products: this.groupProductVariants(mapped),
          totalRecords: res?.pagination?.totalRecords ?? mapped.length,
          categories: res?.categories || []
        };
      })
    );
  }

  /**
   * Full response helper for Home page (including Recordset 3 totalProducts)
   */
  getHomePageProductsResponse(params: any = {}): Observable<{ offeredProducts: Product[]; totalProducts: number; categories: any[] }> {
    return this.http.post<any>(
      `${this.apiUrl}/api/getHomePageProducts`,
      params
    ).pipe(
      tap((res) => console.log('AdminProductService getHomePageProducts full response:', res)),
      map((res) => {
        const items = (res && Array.isArray(res.offeredProducts) ? res.offeredProducts : []) as any[];
        const mapped = items.map((p) => this.mapApiProduct(p));
        return {
          offeredProducts: this.groupProductVariants(mapped),
          totalProducts: res?.pagination?.totalProducts ?? mapped.length,
          categories: res?.categories || []
        };
      })
    );
  }

  getLowStockProducts(threshold = 10): Observable<Product[]> {
    return this.productsSubject.asObservable().pipe(
      delay(150),
      map(products => products.filter(p => p.stock < threshold && p.inStock))
    );
  }

  getProductById(id: string): Observable<Product | undefined> {
    return this.productsSubject.asObservable().pipe(
      delay(150),
      map(products => products.find(p => p.id === id))
    );
  }

  /**
   * ADMIN API: /api/admin/updateStock
   * Updates product stock by quantity or delta via PROC_EB_ADMIN_UPDATE_STOCK
   */
  updateStock(
    id: string | number,
    options: number | { quantity?: number; delta?: number } | UpdateStockPayload
  ): Observable<UpdateStockResponse> {
    const numId = Number(id);
    const body: { id: number; quantity?: number; delta?: number } = { id: numId };

    if (typeof options === 'number') {
      body.quantity = options;
    } else if (options) {
      if (options.quantity !== undefined && options.quantity !== null) {
        body.quantity = Number(options.quantity);
      }
      if (options.delta !== undefined && options.delta !== null) {
        body.delta = Number(options.delta);
      }
    }

    return this.http.post<{ success: boolean; data: UpdateStockResponse; message?: string }>(
      `${this.apiUrl}/api/admin/updateStock`,
      body
    ).pipe(
      tap((res) => console.log('AdminProductService updateStock API response:', res)),
      map((res) => {
        const data = res.data;
        const list = this.productsSubject.value;
        const index = list.findIndex(p => p.id === String(numId));
        if (index !== -1) {
          const updated: Product = {
            ...list[index],
            stock: Number(data.quantity),
            inStock: Number(data.quantity) > 0 ? list[index].inStock : false,
            updatedAt: data.updatedAt
          };
          const nextList = [...list];
          nextList[index] = updated;
          this.persistProducts(nextList);
          this.productsSubject.next(nextList);
        }
        return data;
      })
    );
  }

  toggleInStock(id: string): Observable<Product> {
    const list = this.productsSubject.value;
    const index = list.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error(`Product ${id} not found`);
    }

    const updated: Product = {
      ...list[index],
      inStock: !list[index].inStock,
      updatedAt: new Date().toISOString()
    };

    const nextList = [...list];
    nextList[index] = updated;
    this.persistProducts(nextList);
    this.productsSubject.next(nextList);

    return of(updated).pipe(delay(150));
  }

  /**
   * ADMIN API: /api/admin/addProduct
   * Adds a product to the SQL Server database via PROC_EB_ADMIN_ADD_PRODUCT
   */
  addProduct(product: Partial<Product> | AddProductPayload | any): Observable<Product> {
    const payload = {
      productName: product.productName ?? product.name ?? product.product,
      mrp: product.mrp != null ? Number(product.mrp) : Number(product.price ?? product.sellingPrice),
      categoryId: product.categoryId ? Number(product.categoryId) : null,
      categoryName: product.categoryName ?? product.category ?? null,
      description: product.description ?? product.details ?? null,
      unit: product.unit || '1 item',
      sellingPrice: product.sellingPrice != null ? Number(product.sellingPrice) : (product.price != null ? Number(product.price) : null),
      stock: product.stock != null ? Number(product.stock) : 0,
      productImage: product.productImage ?? product.imageUrl ?? null,
      isFeatured: product.isFeatured ? 1 : 0,
      code: product.code || null,
      offerType: product.offerType || null,
      offerValue: product.offerValue != null ? Number(product.offerValue) : null,
      offerStartDate: product.offerStartDate || null,
      offerEndDate: product.offerEndDate || null,
      groupId: product.groupId ? Number(product.groupId) : null
    };

    return this.http.post<{ success: boolean; data: any; message?: string }>(
      `${this.apiUrl}/api/admin/addProduct`,
      payload
    ).pipe(
      tap((res) => console.log('AdminProductService addProduct API response:', res)),
      map((res) => {
        const createdProduct = this.mapApiProduct(res.data);
        const currentList = this.productsSubject.value;
        const updatedList = [createdProduct, ...currentList];
        this.persistProducts(updatedList);
        this.productsSubject.next(updatedList);
        return createdProduct;
      })
    );
  }

  /**
   * ADMIN API: /api/admin/updateProduct
   * Updates an existing product in the database via PROC_EB_ADMIN_UPDATE_PRODUCT
   */
  updateProduct(id: string | number, updates: Partial<Product> | UpdateProductPayload | any): Observable<Product> {
    const numId = Number(id || updates.id);
    const payload = {
      id: numId,
      productName: updates.productName ?? updates.name ?? updates.product,
      mrp: updates.mrp != null ? Number(updates.mrp) : (updates.price != null ? Number(updates.price) : undefined),
      sellingPrice: updates.sellingPrice != null ? Number(updates.sellingPrice) : (updates.price != null ? Number(updates.price) : null),
      categoryId: updates.categoryId ? Number(updates.categoryId) : null,
      categoryName: updates.categoryName ?? updates.category ?? null,
      description: updates.description ?? updates.details ?? null,
      unit: updates.unit || null,
      stock: updates.stock != null ? Number(updates.stock) : null,
      productImage: updates.productImage ?? updates.imageUrl ?? null,
      isFeatured: updates.isFeatured !== undefined ? (updates.isFeatured ? 1 : 0) : null,
      isActive: updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : (updates.inStock !== undefined ? (updates.inStock ? 1 : 0) : null),
      offerType: updates.offerType !== undefined ? (updates.offerType || null) : null,
      offerValue: updates.offerValue != null ? Number(updates.offerValue) : null,
      offerStartDate: updates.offerStartDate || null,
      offerEndDate: updates.offerEndDate || null
    };

    return this.http.post<{ success: boolean; data: any; message?: string }>(
      `${this.apiUrl}/api/admin/updateProduct`,
      payload
    ).pipe(
      tap((res) => console.log('AdminProductService updateProduct API response:', res)),
      map((res) => {
        const updated = this.mapApiProduct(res.data);
        const list = this.productsSubject.value;
        const index = list.findIndex(p => p.id === String(numId));
        if (index !== -1) {
          const nextList = [...list];
          nextList[index] = updated;
          this.persistProducts(nextList);
          this.productsSubject.next(nextList);
        }
        return updated;
      })
    );
  }

  /**
   * ADMIN API: /api/admin/deleteProduct
   * Deletes (soft or hard) a product via PROC_EB_ADMIN_DELETE_PRODUCT
   */
  deleteProduct(
    id: string | number,
    hardDelete: boolean = true
  ): Observable<DeleteProductResponse> {
    const numId = Number(id);

    return this.http.post<DeleteProductResponse>(
      `${this.apiUrl}/api/admin/deleteProduct`,
      { id: numId, hardDelete: hardDelete ? 1 : 0 }
    ).pipe(
      tap((res) => console.log('AdminProductService deleteProduct API response:', res)),
      map((res) => {
        const filtered = this.productsSubject.value.filter(p => p.id !== String(numId));
        this.persistProducts(filtered);
        this.productsSubject.next(filtered);
        return res;
      })
    );
  }
}
