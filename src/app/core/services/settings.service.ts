import { Injectable, inject, Injector } from '@angular/core';
import { Observable, BehaviorSubject, of, tap } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { ShopSettings, StoreDetailsResponse } from '../models/settings.model';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { apiUrl } from '../../app.constant';
import { AuthService } from './auth.service';
import { DeliveryAreaService } from './delivery-area.service';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly authService = inject(AuthService);
  private readonly injector = inject(Injector);
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
    shopAddress: '',
    offerDeliveryFee: 0
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
   * Prompts the "Check Store & Delivery Availability" modal to get latitude and longitude
   */
  promptLocationModal(): void {
    if (typeof window === 'undefined' || window.location.pathname.startsWith('/admin')) {
      return;
    }
    setTimeout(() => {
      try {
        const deliveryService = this.injector.get(DeliveryAreaService);
        if (deliveryService && !deliveryService.isModalOpen()) {
          deliveryService.openModal();
        }
      } catch (err) {
        console.warn('Could not trigger location modal from SettingsService:', err);
      }
    }, 250);
  }

  /**
   * API CALL: /api/getStoreDetails
   * Sends latitude and longitude to backend to check store availability, delivery charges & distance.
   * If coordinates are omitted, checks for stored verified delivery location or retrieves registered store info.
   */
  getStoreDetails(
    latitude?: number,
    longitude?: number
  ): Observable<StoreDetailsResponse> {
    let lat = latitude;
    let lon = longitude;

    // If coordinates not provided, check if user already has a saved delivery location
    if ((lat == null || isNaN(Number(lat)) || Number(lat) === 0) &&
      (lon == null || isNaN(Number(lon)) || Number(lon) === 0)) {
      try {
        const storedLoc = localStorage.getItem('ebuyzy_delivery_location');
        if (storedLoc) {
          const parsed = JSON.parse(storedLoc);
          if (parsed && parsed.latitude && parsed.longitude) {
            lat = Number(parsed.latitude);
            lon = Number(parsed.longitude);
          }
        }
      } catch { }
    }

    // Do NOT pass null or empty coordinates to the backend API!
    // Instead, open the "Check Store & Delivery Availability" modal to get latitude and longitude from user.
    if (lat == null || lon == null || isNaN(Number(lat)) || isNaN(Number(lon)) || Number(lat) === 0 || Number(lon) === 0) {
      this.promptLocationModal();
      return of({
        success: true,
        status: 0,
        requiresLocation: true,
        message: 'Please add your location',
        description: 'Select or add your location to check delivery availability.',
        storeDetails: [],
        deliveryDetails: []
      });
    }

    const payload = {
      latitude: Number(lat),
      longitude: Number(lon)
    };

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
      shopPeriod: store.days,
      offerDeliveryFee: delivery && delivery.offer_charge != null ? Number(delivery.offer_charge) : 0
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

  updateSettings(updates: Partial<ShopSettings>): Observable<ShopSettings> {
    const current = this.settingsSubject.value;
    const updated: ShopSettings = {
      ...current,
      ...updates
    };

    const token = this.authService.getToken() || (typeof localStorage !== 'undefined' ? localStorage.getItem('ebuyzy_token') : null);
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;

    const payload = {
      shopName: updated.shopName,
      whatsappNumber: updated.whatsappNumber,
      storeAddress: updated.shopAddress || '',
      latitude: Number(updated.shopLatitude),
      longitude: Number(updated.shopLongitude),
      deliveryRadiusKm: Number(updated.deliveryRadiusKm),
      deliveryFee: Number(updated.deliveryFee),
      minOrderAmount: Number(updated.minOrderAmount),
      shopOpen: Boolean(updated.isOpen)
    };

    return this.http.post<{ success: boolean; message?: string }>(
      `${this.apiUrl}/api/admin/store/settings/update`,
      payload,
      { headers }
    ).pipe(
      tap(() => {
        this.persistSettings(updated);
        this.settingsSubject.next(updated);
      }),
      map(() => updated)
    );
  }

  toggleShopStatus(): Observable<ShopSettings> {
    const current = this.settingsSubject.value;
    return this.updateSettings({ isOpen: !current.isOpen });
  }
}
