import { Injectable, signal, computed, inject } from '@angular/core';
import { Observable, of, from } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { SettingsService } from './settings.service';
import { StoreDetailsResponse } from '../models/settings.model';

export interface ServicedArea {
  name: string;
  pincode: string;
  distanceKm: number;
  keywords: string[];
}

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
  serviceRadiusKm?: number;
  storeName?: string;
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
                locality: res.locality,
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
      { timeout: 8000, enableHighAccuracy: true, maximumAge: 60000 }
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
   * Live API verification: Calls backend /api/getStoreDetails with latitude & longitude
   */
  checkAvailabilityWithApi(latitude: number, longitude: number): Observable<DeliveryCheckResult> {
    return this.settingsService.getStoreDetails(latitude, longitude).pipe(
      switchMap(async (res: StoreDetailsResponse) => {
        // Sync application settings from backend response
        const mappedSettings = this.settingsService.mapStoreResponseToSettings(res);
        this.settingsService.updateSettings(mappedSettings).subscribe();

        const store = res.storeDetails && res.storeDetails.length > 0 ? res.storeDetails[0] : null;
        const delivery = res.deliveryDetails && res.deliveryDetails.length > 0 ? res.deliveryDetails[0] : null;

        const isDeliverable = res.status === 1;
        const radius = store?.radius != null ? Number(store.radius) : (mappedSettings.deliveryRadiusKm || 5);

        // Distance in km from backend or Haversine formula
        let distanceKm = store?.DISTANCE_KM != null ? Number(Number(store.DISTANCE_KM).toFixed(1)) : 0;
        if (store?.DISTANCE_KM == null || isNaN(distanceKm)) {
          const storeLat = Number(store?.lattitude || mappedSettings.shopLatitude);
          const storeLng = Number(store?.longitude || mappedSettings.shopLongitude);
          distanceKm = Math.round(this.calculateHaversineDistance(storeLat, storeLng, latitude, longitude) * 10) / 10;
        }

        const deliveryTimeStr = delivery?.min_time && delivery?.['max-time']
          ? `${delivery.min_time}-${delivery['max-time']} mins express`
          : '20-30 mins express';

        // Reverse geocoding to retrieve human-readable locality & pincode
        const geoInfo = await this.reverseGeocodeLocality(latitude, longitude);

        let message = res.message;
        if (!message) {
          message = isDeliverable
            ? `Store is available! We deliver to your location in ${deliveryTimeStr}.`
            : `Your location is outside our ${radius} km delivery radius.`;
        }

        return {
          isDeliverable,
          locality: geoInfo.locality || (isDeliverable ? 'Your Location' : 'Current Location'),
          pincode: geoInfo.pincode || '',
          distanceKm,
          message,
          serviceRadiusKm: radius,
          storeName: store?.store_name || mappedSettings.shopName,
          deliveryTime: deliveryTimeStr,
          minOrderAmount: delivery?.min_order_price,
          deliveryFee: delivery?.fixed_charge
        };
      }),
      catchError((err) => {
        console.error('getStoreDetails API error, using fallback calculation:', err);
        return of(this.checkCoordinatesFallback(latitude, longitude));
      })
    );
  }

  /**
   * Pincode Verification: Attempts to locate coordinates from pincode and verify via getStoreDetails
   */
  checkPincodeAvailability(pincode: string): Observable<DeliveryCheckResult> {
    const cleanPin = pincode.trim().replace(/\D/g, '');
    if (cleanPin.length !== 6) {
      return of({
        isDeliverable: false,
        locality: 'Invalid Pincode',
        pincode: cleanPin,
        distanceKm: 0,
        message: 'Please enter a valid 6-digit Indian postal pincode.'
      });
    }

    return from(this.fetchCoordsFromPincode(cleanPin)).pipe(
      switchMap((coords) => {
        if (coords) {
          return this.checkAvailabilityWithApi(coords.lat, coords.lng).pipe(
            map((result) => ({
              ...result,
              locality: coords.locality || result.locality,
              pincode: cleanPin
            }))
          );
        }

        // If geocoding fails, fallback comparison
        return of({
          isDeliverable: false,
          locality: `Pincode ${cleanPin}`,
          pincode: cleanPin,
          distanceKm: 0,
          message: `Could not verify delivery area for pincode ${cleanPin}. Please use GPS to detect your location.`
        });
      }),
      catchError(() =>
        of({
          isDeliverable: false,
          locality: `Pincode ${cleanPin}`,
          pincode: cleanPin,
          distanceKm: 0,
          message: `Delivery verification failed for pincode ${cleanPin}. Please use GPS location.`
        })
      )
    );
  }

  /**
   * Fallback check for coordinates if network or backend API fails
   */
  private checkCoordinatesFallback(lat: number, lng: number): DeliveryCheckResult {
    // Default store coordinates (Mukkam / Kozhikode store from defaultSettings)
    const storeLat = 11.2497;
    const storeLng = 75.7792;
    const maxRadius = 5.0;

    const distanceKm = Math.round(this.calculateHaversineDistance(storeLat, storeLng, lat, lng) * 10) / 10;
    const isDeliverable = distanceKm <= maxRadius;

    return {
      isDeliverable,
      locality: 'Detected Location',
      pincode: '',
      distanceKm,
      message: isDeliverable
        ? `Store is available! You are ~${distanceKm} km from our store.`
        : `Your location is ~${distanceKm} km away, which is outside our ${maxRadius} km delivery radius.`,
      serviceRadiusKm: maxRadius,
      storeName: 'Ebuyzy Store',
      deliveryTime: '20-30 mins express'
    };
  }

  /**
   * Helper reverse geocoder using OpenStreetMap Nominatim
   */
  private async reverseGeocodeLocality(lat: number, lon: number): Promise<{ locality: string; pincode: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
        {
          headers: { 'User-Agent': 'EbuyzyApp/1.0' },
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const locality =
          addr.suburb ||
          addr.neighbourhood ||
          addr.village ||
          addr.town ||
          addr.city_district ||
          addr.city ||
          addr.county ||
          'Your Area';
        const pincode = addr.postcode || '';
        return { locality, pincode };
      }
    } catch {
      // Ignore network timeout
    }
    return { locality: 'Your Location', pincode: '' };
  }

  /**
   * Helper to lookup coordinates from a 6-digit Indian pincode
   */
  private async fetchCoordsFromPincode(pin: string): Promise<{ lat: number; lng: number; locality: string } | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data[0]?.Status === 'Success' && data[0]?.PostOffice?.length > 0) {
          const po = data[0].PostOffice[0];
          const query = `${po.Name}, ${po.District || po.Region}, ${po.State || 'Kerala'}, India`;
          
          // Geocode query to lat/lng
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
            { headers: { 'User-Agent': 'EbuyzyApp/1.0' } }
          );
          if (geoRes.ok) {
            const geoList = await geoRes.json();
            if (geoList && geoList.length > 0) {
              return {
                lat: parseFloat(geoList[0].lat),
                lng: parseFloat(geoList[0].lon),
                locality: po.Name
              };
            }
          }
        }
      }
    } catch {
      // Fallback
    }
    return null;
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

  private calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
