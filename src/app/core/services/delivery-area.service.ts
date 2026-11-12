import { Injectable, signal, computed, inject } from '@angular/core';
import { SettingsService } from './settings.service';

export interface ServicedArea {
  name: string;
  pincode: string;
  distanceKm: number;
  keywords: string[];
}

export const SERVICED_AREAS: ServicedArea[] = [
  {
    name: 'Kakkanad Hub',
    pincode: '682030',
    distanceKm: 0.5,
    keywords: ['kakkanad', 'civil station', 'collectorate', 'junction', 'padamughal road', 'seaport airport']
  },
  {
    name: 'Infopark Phase 1 & 2',
    pincode: '682042',
    distanceKm: 1.8,
    keywords: ['infopark', 'smartcity', 'rajagiri', 'chittethukara', 'wipro', 'tcs', 'phase 1', 'phase 2', 'olive greens']
  },
  {
    name: 'Padamugal',
    pincode: '682021',
    distanceKm: 2.1,
    keywords: ['padamugal', 'padamughal', 'church', 'sunrise gardens']
  },
  {
    name: 'Vazhakkala',
    pincode: '682021',
    distanceKm: 2.8,
    keywords: ['vazhakkala', 'vazhakala', 'temple', 'asset summit']
  },
  {
    name: 'Chittethukara',
    pincode: '682037',
    distanceKm: 2.4,
    keywords: ['chittethukara', 'masjid', 'green valley']
  },
  {
    name: 'Thrikkakara',
    pincode: '682021',
    distanceKm: 3.1,
    keywords: ['thrikkakara', 'thrikakkara', 'temple', 'model engineering college', 'mec']
  },
  {
    name: 'Palarivattom',
    pincode: '682025',
    distanceKm: 3.9,
    keywords: ['palarivattom', 'bypass', 'medical centre', 'haritha nagar']
  },
  {
    name: 'Edappally Toll',
    pincode: '682024',
    distanceKm: 4.2,
    keywords: ['edappally', 'edapally', 'toll', 'lulu', 'metro']
  },
  {
    name: 'CUSAT & South Kalamassery',
    pincode: '682022',
    distanceKm: 4.4,
    keywords: ['cusat', 'kalamassery', 'university']
  }
];

export interface DeliveryLocation {
  locality: string;
  pincode: string;
  landmark?: string;
  isDeliverable: boolean;
  distanceKm?: number;
  verified: boolean;
  notes?: string;
}

export interface DeliveryCheckResult {
  isDeliverable: boolean;
  locality: string;
  pincode: string;
  distanceKm: number;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class DeliveryAreaService {
  private readonly settingsService = inject(SettingsService);

  private readonly STORAGE_LOCATION_KEY = 'ebuyzy_delivery_location';
  private readonly STORAGE_PROMPT_KEY = 'ebuyzy_delivery_prompt_dismissed';

  // Kakkanad Store Hub Coordinates
  readonly STORE_LAT = 10.0159;
  readonly STORE_LNG = 76.3419;
  readonly MAX_RADIUS_KM = 4.5;

  readonly servicedAreas = SERVICED_AREAS;

  // Reactive state signals
  readonly isModalOpen = signal<boolean>(false);
  readonly selectedLocation = signal<DeliveryLocation | null>(this.getStoredLocation());

  readonly hasVerifiedLocation = computed(() => {
    const loc = this.selectedLocation();
    return !!loc && loc.verified && loc.isDeliverable;
  });

  constructor() {
    // Check if user has already confirmed or skipped location in this browser session
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

  private checkInitialPopupTrigger(): void {
    // Only auto-trigger on customer storefront (not inside /admin)
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin')) {
      const stored = this.getStoredLocation();
      const dismissed = sessionStorage.getItem(this.STORAGE_PROMPT_KEY);

      // If user hasn't verified their delivery location yet and hasn't dismissed in this session:
      if (!stored && !dismissed) {
        setTimeout(() => {
          this.isModalOpen.set(true);
        }, 500);
      }
    }
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
   * Checks entered text (pincode or locality name) against Kakkanad 4.5 km delivery radius
   */
  checkLocation(query: string): DeliveryCheckResult {
    const clean = query.trim().toLowerCase();
    const digits = clean.replace(/\D/g, '');

    // 1. Direct Pincode match among serviced areas
    if (digits.length === 6) {
      const matchByPin = this.servicedAreas.find((a) => a.pincode === digits);
      if (matchByPin) {
        return {
          isDeliverable: true,
          locality: matchByPin.name,
          pincode: matchByPin.pincode,
          distanceKm: matchByPin.distanceKm,
          message: `Great news! We deliver to ${matchByPin.name} (${matchByPin.pincode}) in 30-45 minutes!`
        };
      } else {
        // If pincode is outside Kakkanad 4.5 km zone
        const approxDistance = digits.startsWith('682') ? 8.5 : 25;
        return {
          isDeliverable: false,
          locality: `Pincode ${digits}`,
          pincode: digits,
          distanceKm: approxDistance,
          message: `Sorry, pincode ${digits} is outside our 4.5 km Kakkanad delivery radius.`
        };
      }
    }

    // 2. Keyword or locality name match
    for (const area of this.servicedAreas) {
      if (
        area.name.toLowerCase().includes(clean) ||
        area.keywords.some((k) => clean.includes(k) || k.includes(clean))
      ) {
        return {
          isDeliverable: true,
          locality: area.name,
          pincode: area.pincode,
          distanceKm: area.distanceKm,
          message: `Great news! We deliver to ${area.name} in 30-45 minutes!`
        };
      }
    }

    // 3. Known unserviced Kochi / Kerala places
    const outsideKochiKeywords = [
      'aluva', 'marine drive', 'fort kochi', 'mattancherry', 'tripunithura', 'angamaly',
      'ernakulam south', 'ernakulam north', 'thrissur', 'trivandrum', 'calicut', 'kollam'
    ];
    for (const place of outsideKochiKeywords) {
      if (clean.includes(place)) {
        return {
          isDeliverable: false,
          locality: clean.charAt(0).toUpperCase() + clean.slice(1),
          pincode: 'Outside',
          distanceKm: 12.0,
          message: `We currently deliver within 4.5 km of Kakkanad, Kochi. We haven't expanded to ${clean} yet.`
        };
      }
    }

    // 4. Default: outside service radius
    return {
      isDeliverable: false,
      locality: clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Unknown location',
      pincode: digits || '',
      distanceKm: 15.0,
      message: `We could not match "${query}" to our 4.5 km Kakkanad delivery zone.`
    };
  }

  /**
   * Check GPS coordinates against Kakkanad Store Hub using Haversine formula
   */
  checkCoordinates(lat: number, lng: number): DeliveryCheckResult {
    const distanceKm = this.calculateHaversineDistance(
      this.STORE_LAT,
      this.STORE_LNG,
      lat,
      lng
    );

    const roundedDistance = Math.round(distanceKm * 10) / 10;
    const isDeliverable = roundedDistance <= this.MAX_RADIUS_KM;

    if (isDeliverable) {
      // Find closest known locality
      const closest = this.servicedAreas.reduce((prev, curr) =>
        Math.abs(curr.distanceKm - roundedDistance) < Math.abs(prev.distanceKm - roundedDistance)
          ? curr
          : prev
      );

      return {
        isDeliverable: true,
        locality: `${closest.name} area`,
        pincode: closest.pincode,
        distanceKm: roundedDistance,
        message: `You are ~${roundedDistance} km from our Kakkanad store! Express 30-45 min delivery is available.`
      };
    } else {
      return {
        isDeliverable: false,
        locality: 'Current GPS Location',
        pincode: '',
        distanceKm: roundedDistance,
        message: `Your location is ~${roundedDistance} km away, which is outside our 4.5 km Kakkanad express delivery radius.`
      };
    }
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

