import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeliveryAreaService, DeliveryCheckResult } from '../../../core/services/delivery-area.service';
import { SettingsService } from '../../../core/services/settings.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-delivery-area-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './delivery-area-modal.html',
  styleUrl: './delivery-area-modal.css'
})
export class DeliveryAreaModal {
  protected readonly deliveryService = inject(DeliveryAreaService);
  private readonly settingsService = inject(SettingsService);

  readonly settings = toSignal(this.settingsService.getSettings());

  // Modal Step State: 'prompt' | 'checking' | 'result' | 'error'
  readonly currentStep = signal<'prompt' | 'checking' | 'result' | 'error'>('prompt');
  readonly checkResult = signal<DeliveryCheckResult | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly detectedCoords = signal<{ lat: number; lng: number } | null>(null);

  // Dynamic store name and service radius from live API result
  readonly storeName = computed(() => this.checkResult()?.storeName || '');
  readonly storeRadius = computed(() => this.checkResult()?.serviceRadiusKm || 0);

  closeModal(): void {
    this.deliveryService.closeModal();
    this.currentStep.set('prompt');
    this.checkResult.set(null);
    this.errorMessage.set(null);
  }

  // Allow GPS & Check Store Availability via Backend /api/getStoreDetails API
  requestGpsAndCheck(): void {
    this.errorMessage.set(null);
    this.currentStep.set('checking');
    console.log('[DeliveryModal] GPS button clicked. Requesting location...');

    // If browser does not expose geolocation (e.g. non-HTTPS mobile browser)
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      console.warn('[DeliveryModal] navigator.geolocation is not available (likely insecure HTTP origin). Falling back to network IP location...');
      this.fallbackToNetworkLocation('GPS is restricted on insecure HTTP connections. Attempting network location...');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        console.log('[DeliveryModal] Device GPS coordinates received:', { latitude, longitude });
        this.verifyWithBackend(latitude, longitude);
      },
      (error) => {
        console.warn('[DeliveryModal] GPS error callback reached:', error.code, error.message);
        // Mobile browsers block GPS over HTTP (non-localhost) origins with PERMISSION_DENIED.
        // Fall back to IP network geolocation automatically so the backend API is still reached!
        this.fallbackToNetworkLocation(
          error.code === error.PERMISSION_DENIED
            ? 'GPS was blocked (mobile browsers require HTTPS for GPS). Trying network location...'
            : 'GPS timed out. Trying network location...'
        );
      },
      { timeout: 10000, enableHighAccuracy: false, maximumAge: 30000 }
    );
  }

  // Fallback to free IP-based geolocation when GPS is blocked by mobile HTTP security
  fallbackToNetworkLocation(initialReason?: string): void {
    console.log('[DeliveryModal] Fetching network location from IP...');
    this.currentStep.set('checking');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    fetch('https://ipwho.is/', { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Network IP location failed');
        return res.json();
      })
      .then((data) => {
        if (data && data.success && data.latitude != null && data.longitude != null) {
          console.log('[DeliveryModal] Network location obtained successfully:', {
            lat: data.latitude,
            lon: data.longitude,
            city: data.city
          });
          this.verifyWithBackend(Number(data.latitude), Number(data.longitude));
        } else {
          throw new Error('Invalid IP location payload');
        }
      })
      .catch((err) => {
        console.warn('[DeliveryModal] Network location fetch failed:', err);
        let msg = initialReason || 'Could not detect location.';
        if (typeof window !== 'undefined' && !window.isSecureContext) {
          msg = 'Mobile browsers require HTTPS or Chrome flag for GPS on IP addresses. Enable location permission or try again.';
        }
        this.errorMessage.set(msg);
        this.currentStep.set('error');
      });
  }

  // Sends coordinates directly to backend /api/getStoreDetails API
  verifyWithBackend(latitude: number, longitude: number): void {
    console.log('[DeliveryModal] Calling backend /api/getStoreDetails with coordinates:', { latitude, longitude });
    this.detectedCoords.set({ lat: latitude, lng: longitude });

    this.deliveryService.checkAvailabilityWithApi(latitude, longitude).subscribe({
      next: (result) => {
        console.log('[DeliveryModal] Backend /api/getStoreDetails response received:', result);
        this.checkResult.set(result);
        this.currentStep.set('result');
      },
      error: (err) => {
        console.error('[DeliveryModal] Backend /api/getStoreDetails error:', err);
        this.errorMessage.set('Could not connect to backend store service. Please verify your connection and try again.');
        this.currentStep.set('error');
      }
    });
  }

  confirmAndContinue(): void {
    const res = this.checkResult();
    const coords = this.detectedCoords();
    if (res && res.isDeliverable) {
      this.deliveryService.confirmLocation({
        locality: res.storeAddress || res.locality || res.storeName || 'My Location',
        pincode: res.pincode,
        distanceKm: res.distanceKm,
        isDeliverable: true,
        verified: true,
        latitude: coords?.lat,
        longitude: coords?.lng,
        storeName: res.storeName
      });
    }
    this.closeModal();
  }

  retry(): void {
    this.currentStep.set('prompt');
    this.checkResult.set(null);
    this.errorMessage.set(null);
  }
}
