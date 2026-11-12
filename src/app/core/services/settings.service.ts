import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { ShopSettings } from '../models/settings.model';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly STORAGE_KEY = 'ebuyzy_settings';

  private readonly defaultSettings: ShopSettings = {
    shopName: 'EBUYZY',
    shopLatitude: 10.0159, // Kakkanad, Kochi, Kerala
    shopLongitude: 76.3419,
    deliveryRadiusKm: 4.5, // 3-5 km delivery radius
    deliveryFee: 25, // INR ₹25
    minOrderAmount: 150, // INR ₹150 minimum order
    whatsappNumber: '919847001234', // Indian WhatsApp format (+91 prefix)
    isOpen: true,
    shopAddress: 'Near Infopark Phase 1, Kakkanad, Kochi, Kerala - 682042'
  };

  private readonly settingsSubject = new BehaviorSubject<ShopSettings>(this.getStoredSettings());

  private getStoredSettings(): ShopSettings {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? { ...this.defaultSettings, ...JSON.parse(data) } : this.defaultSettings;
    } catch {
      return this.defaultSettings;
    }
  }

  private persistSettings(settings: ShopSettings): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }

  /**
   * HTTP CLIENT REPLACEMENT SPOT:
   * Replace with: return this.http.get<ShopSettings>('/api/admin/settings');
   */
  getSettings(): Observable<ShopSettings> {
    return this.settingsSubject.asObservable().pipe(delay(100));
  }

  toggleShopStatus(): Observable<ShopSettings> {
    const current = this.settingsSubject.value;
    const updated: ShopSettings = {
      ...current,
      isOpen: !current.isOpen
    };
    this.persistSettings(updated);
    this.settingsSubject.next(updated);
    return of(updated).pipe(delay(150));
  }

  updateSettings(updates: Partial<ShopSettings>): Observable<ShopSettings> {
    const current = this.settingsSubject.value;
    const updated: ShopSettings = {
      ...current,
      ...updates
    };
    this.persistSettings(updated);
    this.settingsSubject.next(updated);
    return of(updated).pipe(delay(200));
  }
}
