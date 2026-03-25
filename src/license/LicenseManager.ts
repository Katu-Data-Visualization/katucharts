/**
 * Singleton that manages license state globally across all chart instances.
 * Validates HMAC-SHA256 signed license keys offline.
 */

import { hmacSha256 } from './hmac';

declare const __KATU_LICENSE_SECRET__: string;

export interface LicensePayload {
  customer: string;
  domains?: string[];
  expiry?: string;
}

class LicenseManagerClass {
  private licenseKey: string | null = null;
  private payload: LicensePayload | null = null;
  private valid = false;

  setKey(key: string): boolean {
    this.licenseKey = key;
    this.payload = null;
    this.valid = false;

    const result = this.validate(key);
    if (result) {
      this.payload = result;
      this.valid = true;
    }

    return this.valid;
  }

  isLicensed(): boolean {
    return this.valid;
  }

  getPayload(): LicensePayload | null {
    return this.payload;
  }

  private validate(key: string): LicensePayload | null {
    try {
      const dotIndex = key.indexOf('.');
      if (dotIndex === -1) return null;

      const payloadB64 = key.substring(0, dotIndex);
      const signatureHex = key.substring(dotIndex + 1);

      const secret = typeof __KATU_LICENSE_SECRET__ !== 'undefined'
        ? __KATU_LICENSE_SECRET__
        : 'dev-secret-change-me';

      const expectedSig = hmacSha256(secret, payloadB64);
      if (!this.constantTimeEqual(expectedSig, signatureHex)) return null;

      const jsonStr = atob(payloadB64);
      const payload = JSON.parse(jsonStr) as LicensePayload;

      if (!payload.customer) return null;
      if (!this.checkExpiry(payload.expiry)) return null;
      if (!this.checkDomain(payload.domains)) return null;

      return payload;
    } catch {
      return null;
    }
  }

  private constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  private checkExpiry(expiry?: string): boolean {
    if (!expiry) return true;
    try {
      return new Date(expiry).getTime() >= Date.now();
    } catch {
      return false;
    }
  }

  private checkDomain(domains?: string[]): boolean {
    if (!domains || domains.length === 0) return true;
    if (typeof window === 'undefined') return true;

    const hostname = window.location.hostname;
    return domains.some(d => {
      if (d.startsWith('*.')) {
        const suffix = d.substring(1);
        return hostname.endsWith(suffix) || hostname === d.substring(2);
      }
      return hostname === d;
    });
  }
}

export const LicenseManager = new LicenseManagerClass();
