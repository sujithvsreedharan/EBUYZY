import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SettingsService } from '../../../core/services/settings.service';
import { ShopSettings } from '../../../core/models/settings.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(SettingsService);

  readonly isLoading = signal<boolean>(true);
  readonly isSaving = signal<boolean>(false);
  readonly showSuccessBanner = signal<boolean>(false);

  readonly settingsForm: FormGroup = this.fb.group({
    shopName: ['', [Validators.required, Validators.minLength(2)]],
    whatsappNumber: ['', [Validators.required, Validators.pattern(/^[0-9]{10,12}$/)]],
    shopLatitude: [null, [Validators.required]],
    shopLongitude: [null, [Validators.required]],
    deliveryRadiusKm: [4.5, [Validators.required, Validators.min(0.5), Validators.max(25)]],
    deliveryFee: [25, [Validators.required, Validators.min(0)]],
    minOrderAmount: [150, [Validators.required, Validators.min(0)]],
    shopAddress: ['', [Validators.required]],
    isOpen: [true]
  });

  ngOnInit(): void {
    this.settingsService.getSettings().subscribe((data: ShopSettings) => {
      this.settingsForm.patchValue({
        shopName: data.shopName,
        whatsappNumber: data.whatsappNumber,
        shopLatitude: data.shopLatitude,
        shopLongitude: data.shopLongitude,
        deliveryRadiusKm: data.deliveryRadiusKm,
        deliveryFee: data.deliveryFee,
        minOrderAmount: data.minOrderAmount,
        shopAddress: data.shopAddress || '',
        isOpen: data.isOpen
      });
      this.isLoading.set(false);
    });
  }

  toggleShopOpen(): void {
    const current = this.settingsForm.get('isOpen')?.value;
    this.settingsForm.patchValue({ isOpen: !current });
  }

  saveSettings(): void {
    if (this.settingsForm.invalid) {
      this.settingsForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.showSuccessBanner.set(false);

    const formVal = this.settingsForm.getRawValue();

    this.settingsService
      .updateSettings({
        shopName: formVal.shopName,
        whatsappNumber: formVal.whatsappNumber,
        shopLatitude: Number(formVal.shopLatitude),
        shopLongitude: Number(formVal.shopLongitude),
        deliveryRadiusKm: Number(formVal.deliveryRadiusKm),
        deliveryFee: Number(formVal.deliveryFee),
        minOrderAmount: Number(formVal.minOrderAmount),
        shopAddress: formVal.shopAddress,
        isOpen: Boolean(formVal.isOpen)
      })
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.showSuccessBanner.set(true);
          setTimeout(() => this.showSuccessBanner.set(false), 4000);
        },
        error: () => {
          this.isSaving.set(false);
        }
      });
  }
}
