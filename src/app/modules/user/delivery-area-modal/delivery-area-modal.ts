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

  // Modal Step State: 'prompt' | 'checking' | 'result' | 'fallback_pincode'
  readonly currentStep = signal<'prompt' | 'checking' | 'result' | 'fallback_pincode'>('prompt');
  readonly checkResult = signal<DeliveryCheckResult | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly manualPincode = signal<string>('');
  readonly isSubmitting = signal<boolean>(false);

  // Dynamic store name and service radius
  readonly storeName = computed(() => this.checkResult()?.storeName || this.settings()?.shopName || 'Ebuyzy Store');
  readonly storeRadius = computed(() => this.checkResult()?.serviceRadiusKm || this.settings()?.deliveryRadiusKm || 5);

  closeModal(): void {
    this.deliveryService.closeModal();
    this.currentStep.set('prompt');
    this.checkResult.set(null);
    this.errorMessage.set(null);
  }

  // 1. Allow GPS & Check Store Availability via Backend API
  requestGpsAndCheck(): void {
    this.errorMessage.set(null);

    if (!('geolocation' in navigator)) {
      this.currentStep.set('fallback_pincode');
      this.errorMessage.set('Geolocation is not supported by your browser.');
      return;
    }

    this.currentStep.set('checking');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        // Verify with live backend /api/getStoreDetails API
        this.deliveryService.checkAvailabilityWithApi(latitude, longitude).subscribe({
          next: (result) => {
            this.checkResult.set(result);
            this.currentStep.set('result');
          },
          error: (err) => {
            console.error('Delivery check error:', err);
            this.errorMessage.set('Could not verify delivery area at this time. Please try entering your pincode.');
            this.currentStep.set('fallback_pincode');
          }
        });
      },
      (error) => {
        let msg = 'Location access was not granted.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Location permission was denied. You can check delivery availability by entering your pincode.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Location information is currently unavailable from your device.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Location request timed out. Please try again or enter your pincode.';
        }
        this.errorMessage.set(msg);
        this.currentStep.set('fallback_pincode');
      },
      { timeout: 9000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  }

  // Fallback Manual Pincode Check via API
  checkManualPincode(): void {
    const pin = this.manualPincode().trim();
    if (!pin || pin.length < 6) {
      this.errorMessage.set('Please enter a valid 6-digit Indian postal pincode.');
      return;
    }

    this.currentStep.set('checking');
    this.errorMessage.set(null);

    this.deliveryService.checkPincodeAvailability(pin).subscribe({
      next: (result) => {
        this.checkResult.set(result);
        this.currentStep.set('result');
      },
      error: (err) => {
        console.error('Pincode check error:', err);
        this.errorMessage.set('Could not check delivery for this pincode. Please try again.');
        this.currentStep.set('fallback_pincode');
      }
    });
  }

  confirmAndContinue(): void {
    const res = this.checkResult();
    if (res && res.isDeliverable) {
      this.deliveryService.confirmLocation({
        locality: res.locality,
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
