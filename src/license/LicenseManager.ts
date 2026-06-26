/**
 * Singleton that manages license state globally across all chart instances.
 *
 * Validation is hybrid:
 *  - Offline: Ed25519 signature check, synchronous and instant. The bundle
 *    carries only the public key, so it can verify keys but never sign them.
 *  - Online: a background POST to the issuing backend confirms the key is
 *    genuine, the subscription is active, and the current host is within the
 *    key's seat limit. Results are cached with an offline grace window. In
 *    'strict' mode, once the grace window lapses a successful online check
 *    becomes mandatory; in 'lenient' mode an unreachable backend falls back to
 *    the offline signature.
 */

import { ed25519 } from '@noble/curves/ed25519.js';

declare const __KATU_LICENSE_PUBLIC_KEY__: string;
declare const __KATU_LICENSE_VERIFY_URL__: string;

export interface LicensePayload {
  customer: string;
  domains?: string[];
  expiry?: string;
  kid?: string;
}

export type LicenseMode = 'strict' | 'lenient';

export interface LicenseConfig {
  /** Backend endpoint for the online check, e.g. https://api.host/api/v1/license/verify */
  verifyUrl?: string;
  /** Behaviour once the offline grace window lapses. Defaults to 'lenient'. */
  mode?: LicenseMode;
  /** How long an offline/unconfirmed key keeps working since its last successful
   *  online 'valid', in milliseconds. Defaults to 7 days. */
  gracePeriodMs?: number;
  /** Background re-check cadence while a key is set, in milliseconds. Defaults to 1 hour. */
  recheckIntervalMs?: number;
}

type OnlineResult = 'valid' | 'invalid' | 'unreachable';

interface CacheEntry {
  kid: string;
  lastResult: OnlineResult;
  lastValidAt: number;
  updatedAt: number;
}

const CACHE_KEY = 'katucharts_license';
const DEFAULT_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_RECHECK_MS = 60 * 60 * 1000;
const VERIFY_TIMEOUT_MS = 8000;

/**
 * Production Ed25519 public key (hex), used to verify license signatures when no
 * build-time key is injected. Safe to ship: it can verify keys but never sign
 * them. A build may override it via the KATU_LICENSE_PUBLIC_KEY env var (e.g. to
 * pair with a local development signing key).
 */
const DEFAULT_PUBLIC_KEY = '3ab57dfcba56a3c6b1949906ef075ff6536f2a40b328a77733e4d8d837cb6abe';

const DEFAULT_VERIFY_URL = 'https://charts.katudv.com/api/v1/license/verify';

const BUILTIN_VERIFY_URL =
  typeof __KATU_LICENSE_VERIFY_URL__ !== 'undefined' ? __KATU_LICENSE_VERIFY_URL__ : DEFAULT_VERIFY_URL;

class LicenseManagerClass {
  private licenseKey: string | null = null;
  private payload: LicensePayload | null = null;
  private offlineValid = false;

  private verifyUrl: string | null = BUILTIN_VERIFY_URL || null;
  private mode: LicenseMode = 'lenient';
  private gracePeriodMs = DEFAULT_GRACE_MS;
  private recheckIntervalMs = DEFAULT_RECHECK_MS;

  private cache: CacheEntry | null = null;
  private pending = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  private listeners = new Set<(licensed: boolean) => void>();
  private lastEmitted: boolean | null = null;

  configure(config: LicenseConfig): void {
    if (config.verifyUrl !== undefined) this.verifyUrl = config.verifyUrl || null;
    if (config.mode) this.mode = config.mode;
    if (config.gracePeriodMs !== undefined) this.gracePeriodMs = config.gracePeriodMs;
    if (config.recheckIntervalMs !== undefined) this.recheckIntervalMs = config.recheckIntervalMs;

    if (this.offlineValid && this.verifyUrl) {
      this.startOnlineChecks();
    }
    this.emit();
  }

  setKey(key: string): boolean {
    this.licenseKey = key;
    this.payload = null;
    this.offlineValid = false;
    this.cache = null;

    const result = this.validate(key);
    if (result) {
      this.payload = result;
      this.offlineValid = true;
      this.cache = this.loadCache(result.kid);
    }

    if (this.offlineValid && this.verifyUrl) {
      this.startOnlineChecks();
    }

    this.emit();
    return this.isLicensed();
  }

  isLicensed(): boolean {
    if (!this.offlineValid) return false;
    if (!this.verifyUrl) return true;

    if (this.cache?.lastResult === 'invalid') return false;

    if (this.cache && this.cache.lastValidAt > 0 && now() - this.cache.lastValidAt < this.gracePeriodMs) {
      return true;
    }

    /**
     * No fresh positive confirmation. Stay optimistic while a check is in flight
     * to avoid a watermark flicker; in strict mode, otherwise withholds the license.
     */
    if (this.pending) return true;
    return this.mode === 'strict' ? false : true;
  }

  getPayload(): LicensePayload | null {
    return this.payload;
  }

  /** Subscribe to license-state transitions. Returns an unsubscribe function. */
  onChange(cb: (licensed: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private startOnlineChecks(): void {
    void this.verifyOnline();
    if (this.timer == null && typeof setInterval !== 'undefined' && this.recheckIntervalMs > 0) {
      this.timer = setInterval(() => void this.verifyOnline(), this.recheckIntervalMs);
      (this.timer as { unref?: () => void })?.unref?.();
    }
  }

  private async verifyOnline(): Promise<void> {
    if (!this.verifyUrl || !this.licenseKey || !this.payload) return;
    if (typeof fetch === 'undefined') return;

    this.pending = true;
    const kid = this.payload.kid ?? '';
    const domain = typeof window !== 'undefined' ? window.location.hostname : '';

    let result: OnlineResult = 'unreachable';
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS) : null;

      const res = await fetch(this.verifyUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: this.licenseKey, domain, kid }),
        signal: controller?.signal,
      });
      if (timeout) clearTimeout(timeout);

      if (res.ok) {
        const data = (await res.json()) as { valid?: boolean };
        result = data.valid ? 'valid' : 'invalid';
      } else if (res.status >= 400 && res.status < 500) {
        result = 'invalid';
      }
    } catch {
      result = 'unreachable';
    }

    this.pending = false;
    this.applyResult(kid, result);
  }

  private applyResult(kid: string, result: OnlineResult): void {
    const prev = this.cache;
    const entry: CacheEntry = {
      kid,
      lastResult: result,
      lastValidAt: result === 'valid' ? now() : prev?.lastValidAt ?? 0,
      updatedAt: now(),
    };
    this.cache = entry;
    this.saveCache(entry);
    this.emit();
  }

  private emit(): void {
    const current = this.isLicensed();
    if (current === this.lastEmitted) return;
    this.lastEmitted = current;
    this.listeners.forEach((cb) => {
      try {
        cb(current);
      } catch {}
    });
  }

  private loadCache(kid?: string): CacheEntry | null {
    if (!kid || typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry;
      return entry.kid === kid ? entry : null;
    } catch {
      return null;
    }
  }

  private saveCache(entry: CacheEntry): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    } catch {}
  }

  private validate(key: string): LicensePayload | null {
    try {
      const dotIndex = key.indexOf('.');
      if (dotIndex === -1) return null;

      const payloadB64 = key.substring(0, dotIndex);
      const signatureHex = key.substring(dotIndex + 1);

      const publicKey = typeof __KATU_LICENSE_PUBLIC_KEY__ !== 'undefined'
        ? __KATU_LICENSE_PUBLIC_KEY__
        : DEFAULT_PUBLIC_KEY;

      const message = new TextEncoder().encode(payloadB64);
      if (!ed25519.verify(hexToBytes(signatureHex), message, hexToBytes(publicKey))) return null;

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

function now(): number {
  return Date.now();
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('invalid hex length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export const LicenseManager = new LicenseManagerClass();
