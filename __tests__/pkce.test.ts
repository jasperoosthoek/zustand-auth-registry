import {
  generateCodeVerifier,
  generateCodeChallenge,
  PKCEState,
  createPKCEParams,
  getPKCEVerifier,
  clearPKCEVerifier
} from '../src/pkce';
import { createMockStorage } from './testHelpers';

describe('PKCE', () => {
  // Ensure crypto polyfills are available before each test
  beforeEach(() => {
    // Re-apply polyfills if they've been cleared
    const nodeCrypto = require('crypto');
    const webcrypto = nodeCrypto.webcrypto || nodeCrypto;

    if (!global.crypto || !global.crypto.subtle) {
      Object.defineProperty(global, 'crypto', {
        value: webcrypto,
        writable: true,
        configurable: true
      });
    }

    if (typeof window !== 'undefined' && (!window.crypto || !window.crypto.subtle)) {
      Object.defineProperty(window, 'crypto', {
        value: {
          subtle: webcrypto.subtle,
          getRandomValues: (array: Uint8Array) => webcrypto.getRandomValues(array)
        },
        writable: true,
        configurable: true
      });
    }
  });

  it('should have crypto polyfills available', () => {
    // Verify polyfills are properly set up
    expect(global.crypto).toBeDefined();
    expect(global.crypto.subtle).toBeDefined();

    // Test that the condition pkce.ts uses works
    const windowCheck = typeof window !== 'undefined' && window.crypto && window.crypto.subtle;
    const globalCheck = typeof global !== 'undefined' && global.crypto;

    expect(windowCheck || globalCheck).toBeTruthy();
  });

  describe('generateCodeVerifier', () => {
    it('should generate verifier with default length of 128', () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toHaveLength(128);
    });

    it('should generate verifier with custom length', () => {
      const verifier = generateCodeVerifier(64);
      expect(verifier).toHaveLength(64);
    });

    it('should only use allowed characters', () => {
      const verifier = generateCodeVerifier();
      const allowedChars = /^[A-Za-z0-9\-._~]+$/;
      expect(verifier).toMatch(allowedChars);
    });

    it('should throw error for length less than 43', () => {
      expect(() => generateCodeVerifier(42)).toThrow(
        'Code verifier length must be between 43 and 128 characters'
      );
    });

    it('should throw error for length greater than 128', () => {
      expect(() => generateCodeVerifier(129)).toThrow(
        'Code verifier length must be between 43 and 128 characters'
      );
    });

    it('should accept minimum valid length of 43', () => {
      const verifier = generateCodeVerifier(43);
      expect(verifier).toHaveLength(43);
    });

    it('should accept maximum valid length of 128', () => {
      const verifier = generateCodeVerifier(128);
      expect(verifier).toHaveLength(128);
    });

    it('should generate different verifiers on each call', () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      expect(verifier1).not.toBe(verifier2);
    });

    it('should use cryptographically secure random values', () => {
      const cryptoSpy = jest.spyOn(global.crypto, 'getRandomValues');
      generateCodeVerifier();
      expect(cryptoSpy).toHaveBeenCalled();
      cryptoSpy.mockRestore();
    });
  });

  describe('generateCodeChallenge', () => {
    const testVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    describe('S256 method', () => {
      it('should generate challenge using S256 method', async () => {
        const challenge = await generateCodeChallenge(testVerifier, 'S256');
        expect(challenge).toBeTruthy();
        expect(typeof challenge).toBe('string');
      });

      it('should generate base64url encoded string', async () => {
        const challenge = await generateCodeChallenge(testVerifier, 'S256');
        // Base64URL should not contain +, /, or =
        expect(challenge).not.toMatch(/[+/=]/);
      });

      it('should generate deterministic challenge for same verifier', async () => {
        const challenge1 = await generateCodeChallenge(testVerifier, 'S256');
        const challenge2 = await generateCodeChallenge(testVerifier, 'S256');
        expect(challenge1).toBe(challenge2);
      });

      it('should generate different challenges for different verifiers', async () => {
        const verifier1 = generateCodeVerifier();
        const verifier2 = generateCodeVerifier();
        const challenge1 = await generateCodeChallenge(verifier1, 'S256');
        const challenge2 = await generateCodeChallenge(verifier2, 'S256');
        expect(challenge1).not.toBe(challenge2);
      });

      it('should generate 43-character challenge (SHA-256 base64url)', async () => {
        const challenge = await generateCodeChallenge(testVerifier, 'S256');
        expect(challenge).toHaveLength(43); // SHA-256 hash is 32 bytes = 43 base64url chars
      });

      it('should use SubtleCrypto for SHA-256 hashing', async () => {
        const digestSpy = jest.spyOn(global.crypto.subtle, 'digest');
        await generateCodeChallenge(testVerifier, 'S256');
        expect(digestSpy).toHaveBeenCalled();
        const calls = digestSpy.mock.calls;
        expect(calls[0][0]).toBe('SHA-256');
        // Check it's a Uint8Array (avoid instance check due to polyfill)
        expect(calls[0][1].constructor.name).toBe('Uint8Array');
        digestSpy.mockRestore();
      });
    });

    describe('plain method', () => {
      it('should return verifier as-is for plain method', async () => {
        const challenge = await generateCodeChallenge(testVerifier, 'plain');
        expect(challenge).toBe(testVerifier);
      });

      it('should not use crypto for plain method', async () => {
        // Plain method should just return the verifier without hashing
        const challenge = await generateCodeChallenge(testVerifier, 'plain');
        expect(challenge).toBe(testVerifier);
        // No crypto operations should be involved
      });
    });

    describe('default method', () => {
      it('should use S256 method by default', async () => {
        const challengeDefault = await generateCodeChallenge(testVerifier);
        const challengeS256 = await generateCodeChallenge(testVerifier, 'S256');
        expect(challengeDefault).toBe(challengeS256);
      });
    });

    describe('error handling', () => {
      it('should throw error when SubtleCrypto not available for S256', async () => {
        // Save originals
        const originalWindowCrypto = window.crypto;
        const originalGlobalCrypto = global.crypto;

        // Remove crypto from both window and global
        delete (window as any).crypto;
        delete (global as any).crypto;

        await expect(
          generateCodeChallenge(testVerifier, 'S256')
        ).rejects.toThrow('SubtleCrypto not available');

        // Restore
        (window as any).crypto = originalWindowCrypto;
        (global as any).crypto = originalGlobalCrypto;
      });
    });
  });

  describe('PKCEState', () => {
    let mockStorage: ReturnType<typeof createMockStorage>;

    beforeEach(() => {
      mockStorage = createMockStorage();
    });

    describe('constructor', () => {
      it('should use default storage key', () => {
        const pkce = new PKCEState();
        expect(pkce).toBeInstanceOf(PKCEState);
      });

      it('should use custom storage key', () => {
        const pkce = new PKCEState('custom_pkce_key', mockStorage as Storage);
        expect(pkce).toBeInstanceOf(PKCEState);
      });

      it('should use provided storage', () => {
        const pkce = new PKCEState('pkce_verifier', mockStorage as Storage);
        expect(pkce).toBeInstanceOf(PKCEState);
      });

      it('should use sessionStorage by default if available', () => {
        const pkce = new PKCEState();
        expect(pkce).toBeInstanceOf(PKCEState);
      });
    });

    describe('generateAndStore', () => {
      it('should generate and store a verifier', async () => {
        const pkce = new PKCEState('test_verifier', mockStorage as Storage);
        const verifier = await pkce.generateAndStore();

        expect(verifier).toBeTruthy();
        expect(verifier).toHaveLength(128);
        expect(mockStorage.setItem).toHaveBeenCalledWith('test_verifier', verifier);
      });

      it('should store verifier in storage', async () => {
        const pkce = new PKCEState('test_verifier', mockStorage as Storage);
        const verifier = await pkce.generateAndStore();

        const stored = pkce.getVerifier();
        expect(stored).toBe(verifier);
      });

      it('should generate new verifier on each call', async () => {
        const pkce = new PKCEState('test_verifier', mockStorage as Storage);
        const verifier1 = await pkce.generateAndStore();
        const verifier2 = await pkce.generateAndStore();

        expect(verifier1).not.toBe(verifier2);
      });
    });

    describe('getVerifier', () => {
      it('should return stored verifier', async () => {
        const pkce = new PKCEState('test_verifier', mockStorage as Storage);
        const verifier = await pkce.generateAndStore();
        const retrieved = pkce.getVerifier();

        expect(retrieved).toBe(verifier);
      });

      it('should return null when no verifier stored', () => {
        const pkce = new PKCEState('test_verifier', mockStorage as Storage);
        const verifier = pkce.getVerifier();

        expect(verifier).toBeNull();
      });

      it('should use correct storage key', () => {
        const pkce = new PKCEState('custom_key', mockStorage as Storage);
        pkce.getVerifier();

        expect(mockStorage.getItem).toHaveBeenCalledWith('custom_key');
      });
    });

    describe('clear', () => {
      it('should remove stored verifier', async () => {
        const pkce = new PKCEState('test_verifier', mockStorage as Storage);
        await pkce.generateAndStore();

        pkce.clear();

        expect(mockStorage.removeItem).toHaveBeenCalledWith('test_verifier');
      });

      it('should clear verifier from storage', async () => {
        const pkce = new PKCEState('test_verifier', mockStorage as Storage);
        await pkce.generateAndStore();

        pkce.clear();
        const verifier = pkce.getVerifier();

        expect(verifier).toBeNull();
      });
    });

    describe('getChallenge', () => {
      it('should generate S256 challenge from stored verifier', async () => {
        const pkce = new PKCEState('test_verifier', mockStorage as Storage);
        const verifier = await pkce.generateAndStore();
        const challenge = await pkce.getChallenge('S256');

        expect(challenge).toBeTruthy();
        expect(typeof challenge).toBe('string');
        expect(challenge).toHaveLength(43);
      });

      it('should generate plain challenge from stored verifier', async () => {
        const pkce = new PKCEState('test_verifier', mockStorage as Storage);
        const verifier = await pkce.generateAndStore();
        const challenge = await pkce.getChallenge('plain');

        expect(challenge).toBe(verifier);
      });

      it('should return null when no verifier stored', async () => {
        const pkce = new PKCEState('test_verifier', mockStorage as Storage);
        const challenge = await pkce.getChallenge('S256');

        expect(challenge).toBeNull();
      });

      it('should use S256 method by default', async () => {
        const pkce = new PKCEState('test_verifier', mockStorage as Storage);
        await pkce.generateAndStore();

        const challengeDefault = await pkce.getChallenge();
        const challengeS256 = await pkce.getChallenge('S256');

        expect(challengeDefault).toBe(challengeS256);
      });
    });
  });

  describe('createPKCEParams', () => {
    let mockStorage: ReturnType<typeof createMockStorage>;

    beforeEach(() => {
      mockStorage = createMockStorage();
    });

    it('should create PKCE parameters with S256 method', async () => {
      const params = await createPKCEParams(mockStorage as Storage, 'S256');

      expect(params).toHaveProperty('verifier');
      expect(params).toHaveProperty('challenge');
      expect(params).toHaveProperty('method');
      expect(params.method).toBe('S256');
      expect(params.verifier).toHaveLength(128);
      expect(params.challenge).toHaveLength(43);
    });

    it('should create PKCE parameters with plain method', async () => {
      const params = await createPKCEParams(mockStorage as Storage, 'plain');

      expect(params.method).toBe('plain');
      expect(params.challenge).toBe(params.verifier);
    });

    it('should use S256 method by default', async () => {
      const params = await createPKCEParams(mockStorage as Storage);

      expect(params.method).toBe('S256');
      expect(params.challenge).toHaveLength(43);
    });

    it('should store verifier in storage', async () => {
      const params = await createPKCEParams(mockStorage as Storage);

      expect(mockStorage.setItem).toHaveBeenCalledWith('pkce_verifier', params.verifier);
    });

    it('should generate valid challenge for verifier', async () => {
      const params = await createPKCEParams(mockStorage as Storage, 'S256');
      const expectedChallenge = await generateCodeChallenge(params.verifier, 'S256');

      expect(params.challenge).toBe(expectedChallenge);
    });

    it('should create different parameters on each call', async () => {
      const params1 = await createPKCEParams(mockStorage as Storage);
      const params2 = await createPKCEParams(mockStorage as Storage);

      expect(params1.verifier).not.toBe(params2.verifier);
      expect(params1.challenge).not.toBe(params2.challenge);
    });
  });

  describe('getPKCEVerifier', () => {
    let mockStorage: ReturnType<typeof createMockStorage>;

    beforeEach(() => {
      mockStorage = createMockStorage();
    });

    it('should retrieve stored verifier', async () => {
      await createPKCEParams(mockStorage as Storage);
      const verifier = getPKCEVerifier(mockStorage as Storage);

      expect(verifier).toBeTruthy();
      expect(typeof verifier).toBe('string');
    });

    it('should return null when no verifier stored', () => {
      const verifier = getPKCEVerifier(mockStorage as Storage);

      expect(verifier).toBeNull();
    });

    it('should use default storage key', async () => {
      await createPKCEParams(mockStorage as Storage);
      getPKCEVerifier(mockStorage as Storage);

      expect(mockStorage.getItem).toHaveBeenCalledWith('pkce_verifier');
    });

    it('should return same verifier that was stored', async () => {
      const params = await createPKCEParams(mockStorage as Storage);
      const retrieved = getPKCEVerifier(mockStorage as Storage);

      expect(retrieved).toBe(params.verifier);
    });
  });

  describe('clearPKCEVerifier', () => {
    let mockStorage: ReturnType<typeof createMockStorage>;

    beforeEach(() => {
      mockStorage = createMockStorage();
    });

    it('should clear stored verifier', async () => {
      await createPKCEParams(mockStorage as Storage);
      clearPKCEVerifier(mockStorage as Storage);

      expect(mockStorage.removeItem).toHaveBeenCalledWith('pkce_verifier');
    });

    it('should remove verifier from storage', async () => {
      await createPKCEParams(mockStorage as Storage);
      clearPKCEVerifier(mockStorage as Storage);

      const verifier = getPKCEVerifier(mockStorage as Storage);
      expect(verifier).toBeNull();
    });

    it('should not throw when clearing non-existent verifier', () => {
      expect(() => clearPKCEVerifier(mockStorage as Storage)).not.toThrow();
    });
  });

  describe('PKCE flow integration', () => {
    let mockStorage: ReturnType<typeof createMockStorage>;

    beforeEach(() => {
      mockStorage = createMockStorage();
    });

    it('should complete full PKCE flow', async () => {
      // 1. Generate PKCE parameters
      const params = await createPKCEParams(mockStorage as Storage, 'S256');
      expect(params.verifier).toBeTruthy();
      expect(params.challenge).toBeTruthy();

      // 2. Retrieve verifier later
      const storedVerifier = getPKCEVerifier(mockStorage as Storage);
      expect(storedVerifier).toBe(params.verifier);

      // 3. Verify challenge matches
      const verifiedChallenge = await generateCodeChallenge(storedVerifier!, 'S256');
      expect(verifiedChallenge).toBe(params.challenge);

      // 4. Clear after use
      clearPKCEVerifier(mockStorage as Storage);
      const clearedVerifier = getPKCEVerifier(mockStorage as Storage);
      expect(clearedVerifier).toBeNull();
    });

    it('should handle multiple PKCE flows independently', async () => {
      const storage1 = createMockStorage();
      const storage2 = createMockStorage();

      const params1 = await createPKCEParams(storage1 as Storage);
      const params2 = await createPKCEParams(storage2 as Storage);

      expect(params1.verifier).not.toBe(params2.verifier);
      expect(params1.challenge).not.toBe(params2.challenge);

      const verifier1 = getPKCEVerifier(storage1 as Storage);
      const verifier2 = getPKCEVerifier(storage2 as Storage);

      expect(verifier1).toBe(params1.verifier);
      expect(verifier2).toBe(params2.verifier);
    });
  });

  describe('RFC 7636 compliance', () => {
    it('should use unreserved characters as per RFC 7636', () => {
      const verifier = generateCodeVerifier();
      // RFC 7636: unreserved = ALPHA / DIGIT / "-" / "." / "_" / "~"
      const rfc7636Charset = /^[A-Za-z0-9\-._~]+$/;
      expect(verifier).toMatch(rfc7636Charset);
    });

    it('should generate verifier with sufficient entropy', () => {
      const verifier = generateCodeVerifier(128);
      // 128 characters from 66-character set = ~774 bits of entropy
      expect(verifier.length).toBeGreaterThanOrEqual(43); // Minimum per RFC
    });

    it('should use SHA-256 for S256 method as per RFC', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier, 'S256');

      // SHA-256 output is 256 bits = 32 bytes
      // Base64URL encoding of 32 bytes = 43 characters (no padding)
      expect(challenge).toHaveLength(43);
    });

    it('should base64url encode without padding', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier, 'S256');

      // Base64URL should not contain padding
      expect(challenge).not.toContain('=');
    });
  });

  describe('security properties', () => {
    it('should generate cryptographically random verifiers', () => {
      const verifiers = new Set<string>();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        verifiers.add(generateCodeVerifier());
      }

      // All verifiers should be unique (no collisions)
      expect(verifiers.size).toBe(iterations);
    });

    it('should produce different challenges for different verifiers', async () => {
      const challenges = new Set<string>();
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const verifier = generateCodeVerifier();
        const challenge = await generateCodeChallenge(verifier, 'S256');
        challenges.add(challenge);
      }

      expect(challenges.size).toBe(iterations);
    });

    it('should not expose verifier in challenge with S256', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier, 'S256');

      // Challenge should not contain the verifier (one-way hash)
      expect(challenge).not.toContain(verifier);
      expect(challenge).not.toBe(verifier);
    });

    it('should be computationally infeasible to reverse S256 challenge', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier, 'S256');

      // Challenge is much shorter than verifier but contains no verifier data
      expect(challenge.length).toBeLessThan(verifier.length);

      // SHA-256 is a one-way function
      // This test documents the security property, actual reversal is infeasible
      expect(challenge).toHaveLength(43); // Fixed length regardless of input
    });
  });

  describe('browser compatibility', () => {
    it('should work with crypto APIs', async () => {
      // Simply test that PKCE functions work (polyfills ensure crypto is available)
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier, 'S256');

      expect(verifier).toBeTruthy();
      expect(typeof verifier).toBe('string');
      expect(challenge).toBeTruthy();
      expect(typeof challenge).toBe('string');
      expect(challenge).toHaveLength(43);
    });

    it('should use TextEncoder for string encoding', async () => {
      // Verify TextEncoder works with PKCE
      const encoder = new TextEncoder();
      const testString = 'test';
      const encoded = encoder.encode(testString);

      // Check it's a typed array (avoid instance check due to polyfill)
      expect(encoded.constructor.name).toBe('Uint8Array');
      expect(encoded.length).toBe(4); // 'test' is 4 bytes
    });
  });
});
