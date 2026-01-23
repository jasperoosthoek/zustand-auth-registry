import { TestUser, createMockAxios, mockUser } from './testHelpers';

// Extended test user types for complex scenarios
export interface ExtendedTestUser extends TestUser {
  permissions?: string[];
  lastLogin?: string;
  isActive?: boolean;
}

export const mockUsers: ExtendedTestUser[] = [
  {
    id: 1,
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    permissions: ['read', 'write', 'delete'],
    isActive: true
  },
  {
    id: 2,
    email: 'user@example.com', 
    name: 'Regular User',
    role: 'user',
    permissions: ['read'],
    isActive: true
  },
  {
    id: 3,
    email: 'inactive@example.com',
    name: 'Inactive User',
    role: 'user',
    permissions: [],
    isActive: false
  }
];

// Different auth configurations for testing
export const createTestAuthConfig = (overrides: any = {}) => ({
  axios: createMockAxios(),
  loginUrl: '/auth/login',
  logoutUrl: '/auth/logout',
  getUserUrl: '/auth/me',
  ...overrides
});

// Mock responses for different scenarios
export const mockResponses = {
  loginSuccess: { 
    data: { 
      auth_token: 'mock-jwt-token-12345',
      user: mockUser 
    } 
  },
  loginFailure: { 
    response: { 
      status: 401, 
      data: { detail: 'Invalid credentials' } 
    } 
  },
  userSuccess: { 
    data: mockUser 
  },
  userFailure: { 
    response: { 
      status: 403, 
      data: { detail: 'Unauthorized' } 
    } 
  },
  logoutSuccess: { 
    data: { message: 'Logged out successfully' } 
  },
  logoutFailure: { 
    response: { 
      status: 500, 
      data: { detail: 'Server error' } 
    } 
  }
};

// Test auth configurations for different scenarios
export const testConfigs = {
  basic: createTestAuthConfig(),
  withPersistence: createTestAuthConfig({
    persistence: {
      enabled: true,
      storage: window.localStorage
    }
  }),
  withTokenFormat: createTestAuthConfig({
    formatAuthHeader: (token: string) => `Token ${token}`
  }),
  withoutGetUser: createTestAuthConfig({
    getUserUrl: undefined
  }),
  withCustomStorage: createTestAuthConfig({
    persistence: {
      enabled: true,
      storage: window.sessionStorage,
      tokenKey: 'custom_token',
      userKey: 'custom_user'
    }
  }),
  withoutPersistence: createTestAuthConfig({
    persistence: {
      enabled: false
    }
  }),
  withCallbacks: createTestAuthConfig({
    onError: jest.fn(),
    onLogin: jest.fn(),
    onLogout: jest.fn()
  })
};

// Helper to create error objects that match Axios error structure
export const createAxiosError = (message: string, status: number = 400, code?: string) => {
  const error = new Error(message) as any;
  error.response = {
    status,
    data: { detail: message },
    statusText: getStatusText(status)
  };
  error.isAxiosError = true;
  if (code) error.code = code;
  return error;
};

// Helper to get HTTP status text
const getStatusText = (status: number): string => {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    500: 'Internal Server Error'
  };
  return statusTexts[status] || 'Unknown';
};

// Helper to simulate storage quota exceeded
export const createStorageQuotaError = () => {
  const error = new Error('QuotaExceededError');
  error.name = 'QuotaExceededError';
  return error;
};