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

  constructor(private http: HttpClient) { };

  // Store coordinates (Mukkam / Kozhikode store from EB_STORE_GEO_LOCATION)
  private readonly defaultSettings: ShopSettings = {
    shopName: 'Ebuyzy Main Store',
    shopLatitude: 11.2497,
    shopLongitude: 75.7792,
    deliveryRadiusKm: 5,
    deliveryFee: 12,
    minOrderAmount: 100,
    whatsappNumber: '9876543210',
    isOpen: true,
    shopAddress: 'Mukkam, Kozhikode, Kerala'
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
    } catch { }
  }

  /**
   * API CALL: /api/getStoreDetails
   * Sends latitude and longitude to backend to check store availability, delivery charges & distance
   */
  getStoreDetails(
    latitude: number = this.defaultSettings.shopLatitude,
    longitude: number = this.defaultSettings.shopLongitude
  ): Observable<StoreDetailsResponse> {
    const lat = Number(latitude);
    const lon = Number(longitude);

    return this.http.post<StoreDetailsResponse>(
      `${this.apiUrl}/api/getStoreDetails`,
      { latitude: lat, longitude: lon }
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
      return {
        ...this.defaultSettings,
        isOpen: res?.status === 1
      };
    }

    const settings: ShopSettings = {
      shopName: store.store_name || this.defaultSettings.shopName,
      shopLatitude: Number(store.lattitude || this.defaultSettings.shopLatitude),
      shopLongitude: Number(store.longitude || this.defaultSettings.shopLongitude),
      deliveryRadiusKm: Number(store.radius || this.defaultSettings.deliveryRadiusKm),
      deliveryFee: delivery && delivery.fixed_charge != null ? Number(delivery.fixed_charge) : this.defaultSettings.deliveryFee,
      minOrderAmount: delivery && delivery.min_order_price != null ? Number(delivery.min_order_price) : this.defaultSettings.minOrderAmount,
      whatsappNumber: store.mob || this.defaultSettings.whatsappNumber,
      isOpen: res.status === 1,
      shopAddress: store.address || this.defaultSettings.shopAddress,
      distanceKm: store.DISTANCE_KM != null ? Number(store.DISTANCE_KM) : undefined,
      minDeliveryTime: delivery && delivery.min_time != null ? Number(delivery.min_time) : undefined,
      maxDeliveryTime: delivery && delivery['max-time'] != null ? Number(delivery['max-time']) : undefined
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
    latitude: number = this.defaultSettings.shopLatitude,
    longitude: number = this.defaultSettings.shopLongitude
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
