import { Component, inject, signal } from '@angular/core';
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
  readonly manualPincode = signal<string>('682030');

  closeModal(): void {
    this.deliveryService.closeModal();
    this.currentStep.set('prompt');
    this.checkResult.set(null);
    this.errorMessage.set(null);
  }

  // 1. Allow GPS & Check Store Radius
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
        const result = this.deliveryService.checkCoordinates(latitude, longitude);
        this.checkResult.set(result);
        this.currentStep.set('result');
      },
      (error) => {
        let msg = 'Location access was not granted.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Location permission was denied. You can check with your Pincode or use Kakkanad store location.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Location information is currently unavailable from your device.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Location request timed out. Please try again.';
        }
        this.errorMessage.set(msg);
        this.currentStep.set('fallback_pincode');
      },
      { timeout: 9000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  }

  // Quick Demo Simulator (for testing within store radius)
  simulateKakkanadLocation(): void {
    this.currentStep.set('checking');
    setTimeout(() => {
      // Simulate coordinates 1.8 km from Kakkanad store
      const result = this.deliveryService.checkCoordinates(10.0125, 76.3562);
      this.checkResult.set(result);
      this.currentStep.set('result');
    }, 400);
  }

  // Fallback Manual Pincode Check
  checkManualPincode(): void {
    const pin = this.manualPincode().trim();
    if (!pin) return;

    this.currentStep.set('checking');
    setTimeout(() => {
      const result = this.deliveryService.checkLocation(pin);
      this.checkResult.set(result);
      this.currentStep.set('result');
    }, 300);
  }

  confirmAndContinue(): void {
    const res = this.checkResult();
    if (res && res.isDeliverable) {
      this.deliveryService.confirmLocation({
        locality: res.locality,
        pincode: res.pincode,
        distanceKm: res.distanceKm,
        isDeliverable: true,
        verified: true
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
