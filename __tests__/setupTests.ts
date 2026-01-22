// Test setup with React Testing Library and jsdom
import '@testing-library/react';

// Mock console to reduce noise during tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};

// Mock localStorage for auth persistence testing
const createStorageMock = () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
});

Object.defineProperty(window, 'localStorage', {
  value: createStorageMock(),
});

Object.defineProperty(window, 'sessionStorage', {
  value: createStorageMock(),
});

// Mock axios for all tests
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    defaults: {
      headers: {
        common: {}
      }
    },
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() }
    }
  })),
  isAxiosError: jest.fn()
}));

// Polyfill TextEncoder/TextDecoder for PKCE tests
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Polyfill crypto.subtle for PKCE tests (Node.js 15+)
const nodeCrypto = require('crypto');

// Use webcrypto if available (Node 15+), otherwise use crypto directly
const webcrypto = nodeCrypto.webcrypto || nodeCrypto;

// Setup global.crypto for Node.js environment paths in PKCE
if (!global.crypto || !global.crypto.subtle) {
  Object.defineProperty(global, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true
  });
}

// Setup window.crypto for browser/jsdom environment paths in PKCE
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'crypto', {
    value: {
      subtle: webcrypto.subtle,
      getRandomValues: (array: Uint8Array) => {
        return webcrypto.getRandomValues(array);
      }
    },
    writable: true,
    configurable: true
  });
}