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

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.errorMessage.set('Geolocation is not supported by your browser.');
      this.currentStep.set('error');
      return;
    }

    this.currentStep.set('checking');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        // Send GPS coordinates to backend /api/getStoreDetails API
        this.deliveryService.checkAvailabilityWithApi(latitude, longitude).subscribe({
          next: (result) => {
            this.checkResult.set(result);
            this.currentStep.set('result');
          },
          error: (err) => {
            console.error('Store availability check error:', err);
            this.errorMessage.set('Could not check store availability at this time. Please try again.');
            this.currentStep.set('error');
          }
        });
      },
      (error) => {
        let msg = 'Location access was not granted.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Location permission was denied. Please allow location access in your device or browser settings.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Location information is currently unavailable from your device. Please ensure GPS/Location is enabled.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Location request timed out. Please tap Allow GPS to try again.';
        }
        this.errorMessage.set(msg);
        this.currentStep.set('error');
      },
      { timeout: 15000, enableHighAccuracy: false, maximumAge: 30000 }
    );
  }

  confirmAndContinue(): void {
    const res = this.checkResult();
    if (res && res.isDeliverable) {
      this.deliveryService.confirmLocation({
        locality: res.storeAddress || res.locality || res.storeName || 'My Location',
        pincode: res.pincode,
        distanceKm: res.distanceKm,
        isDeliverable: true,
        verified: true,
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
