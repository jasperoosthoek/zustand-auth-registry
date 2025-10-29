import { act } from '@testing-library/react';

// Mock axios instance for auth testing
export const createMockAxios = () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(), 
  delete: jest.fn(),
  defaults: {
    headers: {
      common: {} as Record<string, string>
    }
  },
  interceptors: {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() }
  }
});

// Mock user types for testing
export interface TestUser {
  id: number;
  email: string;
  name: string;
  role?: string;
}

export const mockUser: TestUser = {
  id: 1,
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin'
};

// Mock API responses
export const mockLoginResponse = {
  auth_token: 'mock-jwt-token-12345',
  user: mockUser
};

// Mock storage for persistence testing
export const createMockStorage = () => {
  const storage: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => storage[key] || null),
    setItem: jest.fn((key: string, value: string) => { storage[key] = value; }),
    removeItem: jest.fn((key: string) => { delete storage[key]; }),
    clear: jest.fn(() => Object.keys(storage).forEach(key => delete storage[key]))
  };
};

// Helper for async operations in tests
export const waitFor = (condition: () => boolean, timeout: number = 5000) => {
  return new Promise<void>((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (condition()) resolve();
      else if (Date.now() - startTime > timeout) reject(new Error('Timeout'));
      else setTimeout(check, 10);
    };
    check();
  });
};

// Helper for simulating user actions
export const simulateUserAction = async (action: () => Promise<void> | void) => {
  await act(async () => {
    await action();
  });
};

// Mock error creator for testing error handling
export const createMockError = (message: string, status: number = 400) => {
  const error = new Error(message);
  (error as any).response = { status, data: { detail: message } };
  return error;
};

// Helper for testing auth header formats
export const extractAuthHeader = (mockAxios: any): string | undefined => {
  return mockAxios.defaults.headers.common['Authorization'];
};

// Helper to reset all mocks
export const resetAllMocks = () => {
  jest.clearAllMocks();
  (window.localStorage.getItem as jest.Mock).mockClear();
  (window.localStorage.setItem as jest.Mock).mockClear();
  (window.localStorage.removeItem as jest.Mock).mockClear();
  (window.localStorage.clear as jest.Mock).mockClear();
};