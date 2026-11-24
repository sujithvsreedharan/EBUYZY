import { Injectable, signal, computed, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SettingsService } from './settings.service';
import { StoreDetailsResponse } from '../models/settings.model';

export interface DeliveryLocation {
  locality: string;
  pincode: string;
  landmark?: string;
  isDeliverable: boolean;
  distanceKm?: number;
  verified: boolean;
  notes?: string;
  latitude?: number;
  longitude?: number;
  storeName?: string;
}

export interface DeliveryCheckResult {
  isDeliverable: boolean;
  locality: string;
  pincode: string;
  distanceKm: number;
  message: string;
  description?: string;
  serviceRadiusKm?: number;
  storeName?: string;
  storeAddress?: string;
  deliveryTime?: string;
  minOrderAmount?: number;
  deliveryFee?: number;
}

@Injectable({
  providedIn: 'root'
})
export class DeliveryAreaService {
  private readonly settingsService = inject(SettingsService);

  private readonly STORAGE_LOCATION_KEY = 'ebuyzy_delivery_location';
  private readonly STORAGE_PROMPT_KEY = 'ebuyzy_delivery_prompt_dismissed';

  // Reactive state signals
  readonly isModalOpen = signal<boolean>(false);
  readonly selectedLocation = signal<DeliveryLocation | null>(this.getStoredLocation());

  readonly hasVerifiedLocation = computed(() => {
    const loc = this.selectedLocation();
    return !!loc && loc.verified && loc.isDeliverable;
  });

  constructor() {
    this.checkInitialPopupTrigger();
  }

  private getStoredLocation(): DeliveryLocation | null {
    try {
      const data = localStorage.getItem(this.STORAGE_LOCATION_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  /**
   * On initial app open, check if location permission is already available or prompt user
   */
  private checkInitialPopupTrigger(): void {
    if (typeof window === 'undefined' || window.location.pathname.startsWith('/admin')) {
      return;
    }

    const stored = this.getStoredLocation();

    // If user already verified a location, sync settings with saved coordinates
    if (stored && stored.latitude != null && stored.longitude != null) {
      this.settingsService.getSettings(stored.latitude, stored.longitude).subscribe({
        error: (err) => console.warn('Could not sync store settings for stored location:', err)
      });
      return;
    }

    // If no verified location yet, check if browser geolocation permission is already granted
    const dismissed = sessionStorage.getItem(this.STORAGE_PROMPT_KEY);

    if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((permissionStatus) => {
          if (permissionStatus.state === 'granted') {
            // Permission already granted: detect user location and check store availability via backend API
            this.autoDetectLocationAndCheckStore();
          } else if (!dismissed) {
            // Show modal prompt
            setTimeout(() => this.isModalOpen.set(true), 600);
          }
        })
        .catch(() => {
          if (!dismissed) {
            setTimeout(() => this.isModalOpen.set(true), 600);
          }
        });
    } else if (!dismissed) {
      setTimeout(() => this.isModalOpen.set(true), 600);
    }
  }

  /**
   * Silently detects user's location and checks availability when permission is already granted
   */
  autoDetectLocationAndCheckStore(): void {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        this.checkAvailabilityWithApi(latitude, longitude).subscribe({
          next: (res) => {
            if (res.isDeliverable) {
              this.confirmLocation({
                locality: res.storeAddress || res.locality || res.storeName || '',
                pincode: res.pincode,
                distanceKm: res.distanceKm,
                isDeliverable: true,
                verified: true,
                latitude,
                longitude,
                storeName: res.storeName
              });
            }
          },
          error: (err) => console.warn('Auto store check failed:', err)
        });
      },
      (err) => console.warn('Could not retrieve current position:', err),
      { timeout: 12000, enableHighAccuracy: false, maximumAge: 60000 }
    );
  }

  openModal(): void {
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    try {
      sessionStorage.setItem(this.STORAGE_PROMPT_KEY, 'true');
    } catch {}
  }

  /**
   * Live API verification: Sends latitude & longitude directly to backend /api/getStoreDetails
   */
  checkAvailabilityWithApi(latitude: number, longitude: number): Observable<DeliveryCheckResult> {
    return this.settingsService.getStoreDetails(latitude, longitude).pipe(
      map((res: StoreDetailsResponse) => {
        const store = res.storeDetails && res.storeDetails.length > 0 ? res.storeDetails[0] : null;
        const delivery = res.deliveryDetails && res.deliveryDetails.length > 0 ? res.deliveryDetails[0] : null;

        // Apply live store details from backend into settings
        if (store) {
          this.settingsService.applyStoreDetails(res);
        }

        const isDeliverable = res.status === 1;
        const radius = store?.radius != null ? Number(store.radius) : undefined;
        const distanceKm = store?.DISTANCE_KM != null ? Number(Number(store.DISTANCE_KM).toFixed(1)) : 0;

        const minTime = delivery?.min_time != null ? delivery.min_time : null;
        const maxTime = delivery?.['max-time'] != null ? delivery['max-time'] : null;
        const deliveryTimeStr = minTime != null && maxTime != null ? `${minTime}-${maxTime} mins express` : '';

        const storeName = store?.store_name || '';
        const storeAddress = store?.address || '';
        const locality = storeAddress || (isDeliverable ? 'Store Area' : '');

        return {
          isDeliverable,
          locality,
          pincode: '',
          distanceKm,
          message: res.message || (isDeliverable ? 'Store Available' : 'Store Unavailable'),
          description: res.description || '',
          serviceRadiusKm: radius,
          storeName,
          storeAddress,
          deliveryTime: deliveryTimeStr,
          minOrderAmount: delivery?.min_order_price,
          deliveryFee: delivery?.fixed_charge
        };
      }),
      catchError((err) => {
        console.error('getStoreDetails API error:', err);
        return of({
          isDeliverable: false,
          locality: '',
          pincode: '',
          distanceKm: 0,
          message: 'Store service unavailable',
          description: 'Could not connect to the store service. Please check your network and try again.'
        });
      })
    );
  }

  confirmLocation(loc: DeliveryLocation): void {
    try {
      localStorage.setItem(this.STORAGE_LOCATION_KEY, JSON.stringify(loc));
      sessionStorage.setItem(this.STORAGE_PROMPT_KEY, 'true');
    } catch {}

    this.selectedLocation.set(loc);
    this.closeModal();
  }

  clearLocation(): void {
    try {
      localStorage.removeItem(this.STORAGE_LOCATION_KEY);
    } catch {}
    this.selectedLocation.set(null);
  }
}
