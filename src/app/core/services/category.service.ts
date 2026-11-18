import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, of, tap } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { Category } from '../models/category.model';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environment/environment.prod';
import { apiUrl } from '../../app.constant';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private apiUrl = apiUrl


  constructor(
    private http: HttpClient,

  ) { }

  // Mock in-memory storage (easily swappable with HttpClient)
  private readonly categoriesSubject = new BehaviorSubject<Category[]>([
    // { id: 'cat-1', name: 'Vegetables & Greens', slug: 'vegetables-greens', description: 'Fresh local produce sourced daily from Kerala farms', productCount: 14 },
    // { id: 'cat-2', name: 'Kerala Rice & Grains', slug: 'kerala-rice-grains', description: 'Authentic Palakkadan Matta, Jaya, and pulses', productCount: 8 },
    // { id: 'cat-3', name: 'Coconut & Oils', slug: 'coconut-oils', description: 'Pure cold-pressed coconut oil, fresh coconuts, and copra', productCount: 6 },
    // { id: 'cat-4', name: 'Spices & Malabar Masala', slug: 'spices-malabar-masala', description: 'Idukki cardamom, Wayanad black pepper, and turmeric', productCount: 11 },
    // { id: 'cat-5', name: 'Dairy & Daily Essentials', slug: 'dairy-essentials', description: 'Milma milk, curd, ghee, and batter', productCount: 7 },
    // { id: 'cat-6', name: 'Fruits & Kerala Bananas', slug: 'fruits-kerala-bananas', description: 'Nendran, Robusta, Poovan, and seasonal fruits', productCount: 9 }
  ]);


  /**
   * HTTP CLIENT REPLACEMENT SPOT:
   * Replace with: return this.http.get<Category[]>('/api/admin/categories');
   */
  getCategories(): Observable<Category[]> {
    return this.http.post<any>(
      `${this.apiUrl}/api/getCategories`,
      {}
    ).pipe(
      tap((res) => console.log('CategoryService getCategories raw response:', res)),
      map((res) => {
        const items = (res && Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : []) as any[];
        return items.map((c) => ({
          ...c,
          id: String(c.id),
          slug: c.slug || c.code?.toLowerCase() || '',
          productCount: c.productCount ?? 0,
        })) as Category[];
      })
    );
  }

  getCategoryById(id: string): Observable<Category | undefined> {
    return this.categoriesSubject.asObservable().pipe(
      delay(150),
      map(list => list.find(c => c.id === id))
    );
  }

  addCategory(category: Omit<Category, 'id' | 'productCount'>): Observable<Category> {
    const newCategory: Category = {
      ...category,
      id: 'cat-' + Date.now(),
      productCount: 0
    };
    const updated = [...this.categoriesSubject.value, newCategory];
    this.categoriesSubject.next(updated);
    return of(newCategory).pipe(delay(200));
  }

  updateCategory(id: string, updates: Partial<Category>): Observable<Category> {
    const list = this.categoriesSubject.value;
    const index = list.findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error(`Category with ID ${id} not found`);
    }
    const updatedCategory = { ...list[index], ...updates };
    const updatedList = [...list];
    updatedList[index] = updatedCategory;
    this.categoriesSubject.next(updatedList);
    return of(updatedCategory).pipe(delay(200));
  }

  deleteCategory(id: string): Observable<boolean> {
    const list = this.categoriesSubject.value;
    const filtered = list.filter(c => c.id !== id);
    this.categoriesSubject.next(filtered);
    return of(true).pipe(delay(200));
  }
}

