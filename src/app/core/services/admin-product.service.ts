import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { Product } from '../models/product.model';

@Injectable({
  providedIn: 'root'
})
export class AdminProductService {
  private readonly STORAGE_KEY = 'ebuyzy_products';

  // In-memory initial mock product inventory for EBUYZY (Kerala 3-5 km delivery radius)
  private readonly defaultProducts: Product[] = [
    {
      id: 'prod-101',
      name: 'Palakkadan Matta Rice (Vadi)',
      categoryId: 'cat-2',
      categoryName: 'Kerala Rice & Grains',
      price: 295,
      unit: '5 kg',
      imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=200&auto=format&fit=crop&q=60',
      stock: 22,
      inStock: true,
      createdAt: '2026-10-01T08:00:00Z',
      updatedAt: '2026-11-05T09:30:00Z'
    },
    {
      id: 'prod-102',
      name: 'Fresh Mature Coconut (Pacha Thenga)',
      categoryId: 'cat-3',
      categoryName: 'Coconut & Oils',
      price: 38,
      unit: '1 pc',
      imageUrl: 'https://images.unsplash.com/photo-1525385133512-2f3bdd039054?w=200&auto=format&fit=crop&q=60',
      stock: 4, // Low stock (< 10)
      inStock: true,
      createdAt: '2026-10-02T08:00:00Z',
      updatedAt: '2026-11-06T06:00:00Z'
    },
    {
      id: 'prod-103',
      name: 'Raw Nendran Banana (Ethakka)',
      categoryId: 'cat-6',
      categoryName: 'Fruits & Kerala Bananas',
      price: 64,
      unit: '1 kg',
      imageUrl: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=200&auto=format&fit=crop&q=60',
      stock: 6, // Low stock (< 10)
      inStock: true,
      createdAt: '2026-10-05T08:00:00Z',
      updatedAt: '2026-11-06T07:15:00Z'
    },
    {
      id: 'prod-104',
      name: 'Pure Cold-Pressed Coconut Oil',
      categoryId: 'cat-3',
      categoryName: 'Coconut & Oils',
      price: 310,
      unit: '1 L',
      imageUrl: 'https://images.unsplash.com/photo-1471193945509-9ad0617afabf?w=200&auto=format&fit=crop&q=60',
      stock: 18,
      inStock: true,
      createdAt: '2026-10-01T08:00:00Z',
      updatedAt: '2026-11-04T12:00:00Z'
    },
    {
      id: 'prod-105',
      name: 'Fresh Tapioca (Nadan Kappa)',
      categoryId: 'cat-1',
      categoryName: 'Vegetables & Greens',
      price: 36,
      unit: '1 kg',
      imageUrl: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=200&auto=format&fit=crop&q=60',
      stock: 7, // Low stock (< 10)
      inStock: true,
      createdAt: '2026-10-10T08:00:00Z',
      updatedAt: '2026-11-06T08:30:00Z'
    },
    {
      id: 'prod-106',
      name: 'Fresh Green Curry Leaves (Kari Vepila)',
      categoryId: 'cat-1',
      categoryName: 'Vegetables & Greens',
      price: 12,
      unit: '1 bunch',
      imageUrl: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=200&auto=format&fit=crop&q=60',
      stock: 3, // Low stock (< 10)
      inStock: true,
      createdAt: '2026-10-12T08:00:00Z',
      updatedAt: '2026-11-06T09:00:00Z'
    },
    {
      id: 'prod-107',
      name: 'Wayanad Whole Black Pepper (Kurumulaku)',
      categoryId: 'cat-4',
      categoryName: 'Spices & Malabar Masala',
      price: 195,
      unit: '200 g',
      imageUrl: 'https://images.unsplash.com/photo-1599940824399-b87987ceb72a?w=200&auto=format&fit=crop&q=60',
      stock: 14,
      inStock: true,
      createdAt: '2026-10-08T08:00:00Z',
      updatedAt: '2026-11-02T10:00:00Z'
    },
    {
      id: 'prod-108',
      name: 'Milma Toned Milk (Pasteurised)',
      categoryId: 'cat-5',
      categoryName: 'Dairy & Daily Essentials',
      price: 27,
      unit: '500 ml',
      imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=200&auto=format&fit=crop&q=60',
      stock: 35,
      inStock: true,
      createdAt: '2026-10-01T08:00:00Z',
      updatedAt: '2026-11-06T05:00:00Z'
    },
    {
      id: 'prod-109',
      name: 'Fresh Ginger (Pacha Inji)',
      categoryId: 'cat-1',
      categoryName: 'Vegetables & Greens',
      price: 48,
      unit: '250 g',
      imageUrl: 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=200&auto=format&fit=crop&q=60',
      stock: 5, // Low stock (< 10)
      inStock: true,
      createdAt: '2026-10-15T08:00:00Z',
      updatedAt: '2026-11-06T08:00:00Z'
    },
    {
      id: 'prod-110',
      name: 'Idukki Green Cardamom (Elakkaya)',
      categoryId: 'cat-4',
      categoryName: 'Spices & Malabar Masala',
      price: 275,
      unit: '100 g',
      imageUrl: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?w=200&auto=format&fit=crop&q=60',
      stock: 16,
      inStock: true,
      createdAt: '2026-10-10T08:00:00Z',
      updatedAt: '2026-11-03T11:00:00Z'
    }
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
    } catch {}
  }

  /**
   * HTTP CLIENT REPLACEMENT SPOT:
   * Replace with: return this.http.get<Product[]>('/api/admin/products');
   */
  getProducts(): Observable<Product[]> {
    return this.productsSubject.asObservable().pipe(delay(150));
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

  updateStock(id: string, newStock: number): Observable<Product> {
    const list = this.productsSubject.value;
    const index = list.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error(`Product ${id} not found`);
    }

    const updated: Product = {
      ...list[index],
      stock: newStock,
      inStock: newStock > 0 ? list[index].inStock : false,
      updatedAt: new Date().toISOString()
    };

    const nextList = [...list];
    nextList[index] = updated;
    this.persistProducts(nextList);
    this.productsSubject.next(nextList);

    return of(updated).pipe(delay(150));
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

  addProduct(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Observable<Product> {
    const now = new Date().toISOString();
    const created: Product = {
      ...product,
      id: 'prod-' + Date.now(),
      createdAt: now,
      updatedAt: now
    };

    const nextList = [created, ...this.productsSubject.value];
    this.persistProducts(nextList);
    this.productsSubject.next(nextList);
    return of(created).pipe(delay(200));
  }

  updateProduct(id: string, updates: Partial<Product>): Observable<Product> {
    const list = this.productsSubject.value;
    const index = list.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error(`Product ${id} not found`);
    }

    const updated: Product = {
      ...list[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const nextList = [...list];
    nextList[index] = updated;
    this.persistProducts(nextList);
    this.productsSubject.next(nextList);

    return of(updated).pipe(delay(200));
  }

  deleteProduct(id: string): Observable<boolean> {
    const filtered = this.productsSubject.value.filter(p => p.id !== id);
    this.persistProducts(filtered);
    this.productsSubject.next(filtered);
    return of(true).pipe(delay(150));
  }
}
