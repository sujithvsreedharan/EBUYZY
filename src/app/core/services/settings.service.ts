import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, of, tap } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { ShopSettings, StoreDetailsResponse } from '../models/settings.model';
import { HttpClient } from '@angular/common/http';
import { apiUrl } from '../../app.constant';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly STORAGE_KEY = 'ebuyzy_settings';
  private apiUrl = apiUrl;

  constructor(private http: HttpClient) {
    // Initial fetch to populate live settings from backend API
    this.getSettings().subscribe({
      error: (err) => console.warn('SettingsService auto-init getSettings failed:', err)
    });
  };

  // Initial clean state with zero/empty values - data populated purely via API
  private readonly defaultSettings: ShopSettings = {
    shopName: '',
    shopLatitude: 0,
    shopLongitude: 0,
    deliveryRadiusKm: 0,
    deliveryFee: 0,
    minOrderAmount: 0,
    whatsappNumber: '',
    isOpen: false,
    shopAddress: ''
  };

  private readonly settingsSubject = new BehaviorSubject<ShopSettings>(this.getStoredSettings());
  readonly settings$ = this.settingsSubject.asObservable();

  getCurrentSettings(): ShopSettings {
    return this.settingsSubject.value;
  }

  private getStoredSettings(): ShopSettings {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        // Clear out legacy hardcoded demo coordinates
        if (parsed.shopLatitude === 11.2497 || parsed.shopLongitude === 75.7792) {
          localStorage.removeItem(this.STORAGE_KEY);
          return this.defaultSettings;
        }
        return { ...this.defaultSettings, ...parsed };
      }
      return this.defaultSettings;
    } catch {
      return this.defaultSettings;
    }
  }

  private persistSettings(settings: ShopSettings): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch { }
  }

  /**
   * API CALL: /api/getStoreDetails
   * Sends latitude and longitude to backend to check store availability, delivery charges & distance.
   * If coordinates are omitted, backend populates with the store's registered database location.
   */
  getStoreDetails(
    latitude?: number,
    longitude?: number
  ): Observable<StoreDetailsResponse> {
    const payload: { latitude?: number; longitude?: number } = {};
    if (latitude != null && !isNaN(Number(latitude)) && Number(latitude) !== 0) {
      payload.latitude = Number(latitude);
    }
    if (longitude != null && !isNaN(Number(longitude)) && Number(longitude) !== 0) {
      payload.longitude = Number(longitude);
    }

    return this.http.post<StoreDetailsResponse>(
      `${this.apiUrl}/api/getStoreDetails`,
      payload
    ).pipe(
      tap((res) => console.log('SettingsService getStoreDetails response:', res))
    );
  }

  /**
   * Maps backend getStoreDetails response to ShopSettings
   */
  mapStoreResponseToSettings(res: StoreDetailsResponse): ShopSettings {
    const store = (res && res.storeDetails && res.storeDetails.length > 0) ? res.storeDetails[0] : null;
    const delivery = (res && res.deliveryDetails && res.deliveryDetails.length > 0) ? res.deliveryDetails[0] : null;

    if (!store) {
      const current = this.settingsSubject ? this.settingsSubject.value : this.defaultSettings;
      return {
        ...current,
        isOpen: res?.status === 1
      };
    }

    const settings: ShopSettings = {
      shopName: store.store_name || '',
      shopLatitude: Number(store.lattitude || 0),
      shopLongitude: Number(store.longitude || 0),
      deliveryRadiusKm: Number(store.radius || 0),
      deliveryFee: delivery && delivery.fixed_charge != null ? Number(delivery.fixed_charge) : 0,
      minOrderAmount: delivery && delivery.min_order_price != null ? Number(delivery.min_order_price) : 0,
      whatsappNumber: store.mob || '',
      isOpen: res.status === 1,
      shopAddress: store.address || '',
      shopStart: store.open || '',
      shopClose: store.close || '',
      distanceKm: store.DISTANCE_KM != null ? Number(store.DISTANCE_KM) : undefined,
      minDeliveryTime: delivery && delivery.min_time != null ? Number(delivery.min_time) : undefined,
      maxDeliveryTime: delivery && delivery['max-time'] != null ? Number(delivery['max-time']) : undefined,
      shopPeriod: store.days 
    };

    return settings;
  }

  /**
   * Applies and broadcasts live store details received from /api/getStoreDetails
   */
  applyStoreDetails(res: StoreDetailsResponse): ShopSettings {
    const settings = this.mapStoreResponseToSettings(res);
    this.persistSettings(settings);
    this.settingsSubject.next(settings);
    return settings;
  }

  /**
   * Retrieves shop settings populated from /api/getStoreDetails
   */
  getSettings(
    latitude?: number,
    longitude?: number
  ): Observable<ShopSettings> {
    return this.getStoreDetails(latitude, longitude).pipe(
      map((res) => {
        const settings = this.mapStoreResponseToSettings(res);
        this.persistSettings(settings);
        this.settingsSubject.next(settings);
        return settings;
      })
    );
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
