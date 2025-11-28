/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0
 * RFC 7636: https://tools.ietf.org/html/rfc7636
 */

/**
 * Generate a random code verifier for PKCE
 * @param length - Length of the verifier (43-128 characters, default 128)
 * @returns Random code verifier string
 */
export function generateCodeVerifier(length: number = 128): string {
  if (length < 43 || length > 128) {
    throw new Error('Code verifier length must be between 43 and 128 characters');
  }

  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);

  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(randomValues);
  } else if (typeof global !== 'undefined' && global.crypto) {
    global.crypto.getRandomValues(randomValues);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < length; i++) {
      randomValues[i] = Math.floor(Math.random() * 256);
    }
  }

  let verifier = '';
  for (let i = 0; i < length; i++) {
    verifier += charset[randomValues[i] % charset.length];
  }

  return verifier;
}

/**
 * Generate a code challenge from a code verifier
 * @param verifier - The code verifier
 * @param method - Challenge method ('S256' or 'plain', default 'S256')
 * @returns Code challenge string
 */
export async function generateCodeChallenge(
  verifier: string,
  method: 'S256' | 'plain' = 'S256'
): Promise<string> {
  if (method === 'plain') {
    return verifier;
  }

  // S256 method: BASE64URL(SHA256(ASCII(code_verifier)))
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    // Browser environment
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await window.crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(hash));
  } else if (typeof global !== 'undefined' && global.crypto) {
    // Node.js environment
    const crypto = global.crypto;
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(hash));
  } else {
    throw new Error('SubtleCrypto not available. PKCE S256 requires Web Crypto API.');
  }
}

/**
 * Base64URL encode a byte array
 * @param buffer - Byte array to encode
 * @returns Base64URL encoded string
 */
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...Array.from(buffer)));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * PKCE state management for storing verifier during OAuth flow
 */
export class PKCEState {
  private storageKey: string;
  private storage: Storage;

  constructor(storageKey: string = 'pkce_verifier', storage?: Storage) {
    this.storageKey = storageKey;

    if (storage) {
      this.storage = storage;
    } else if (typeof window !== 'undefined' && window.sessionStorage) {
      this.storage = window.sessionStorage;
    } else {
      // Fallback in-memory storage
      this.storage = new Map() as any;
    }
  }

  /**
   * Generate and store a new PKCE code verifier
   * @returns Code verifier string
   */
  async generateAndStore(): Promise<string> {
    const verifier = generateCodeVerifier();
    this.storage.setItem(this.storageKey, verifier);
    return verifier;
  }

  /**
   * Get the stored code verifier
   * @returns Code verifier string or null if not found
   */
  getVerifier(): string | null {
    return this.storage.getItem(this.storageKey);
  }

  /**
   * Clear the stored code verifier
   */
  clear(): void {
    this.storage.removeItem(this.storageKey);
  }

  /**
   * Generate code challenge from stored verifier
   * @param method - Challenge method ('S256' or 'plain')
   * @returns Code challenge string or null if no verifier stored
   */
  async getChallenge(method: 'S256' | 'plain' = 'S256'): Promise<string | null> {
    const verifier = this.getVerifier();
    if (!verifier) return null;
    return generateCodeChallenge(verifier, method);
  }
}

/**
 * Helper to create PKCE parameters for authorization request
 * @param storage - Optional storage for verifier
 * @param method - Challenge method ('S256' or 'plain', default 'S256')
 * @returns PKCE parameters including verifier and challenge
 */
export async function createPKCEParams(
  storage?: Storage,
  method: 'S256' | 'plain' = 'S256'
): Promise<{ verifier: string; challenge: string; method: string }> {
  const pkce = new PKCEState('pkce_verifier', storage);
  const verifier = await pkce.generateAndStore();
  const challenge = await generateCodeChallenge(verifier, method);

  return {
    verifier,
    challenge,
    method,
  };
}

/**
 * Helper to retrieve and validate stored PKCE verifier
 * @param storage - Optional storage to retrieve from
 * @returns Code verifier or null if not found
 */
export function getPKCEVerifier(storage?: Storage): string | null {
  const pkce = new PKCEState('pkce_verifier', storage);
  return pkce.getVerifier();
}

/**
 * Helper to clear stored PKCE verifier
 * @param storage - Optional storage to clear from
 */
export function clearPKCEVerifier(storage?: Storage): void {
  const pkce = new PKCEState('pkce_verifier', storage);
  pkce.clear();
}
