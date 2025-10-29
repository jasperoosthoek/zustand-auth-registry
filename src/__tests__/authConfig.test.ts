import { validateAuthConfig } from '../authConfig';
import { createMockAxios } from './testHelpers';
import { testConfigs } from './testUtils';

describe('validateAuthConfig', () => {
  let mockAxios: any;

  beforeEach(() => {
    mockAxios = createMockAxios();
  });

  describe('required field validation', () => {
    it('should validate that axios is required', () => {
      expect(() => {
        validateAuthConfig({
          loginUrl: '/login',
          logoutUrl: '/logout',
          extractToken: (data) => data.token
        } as any);
      }).toThrow('AuthConfig: axios instance is required');
    });

    it('should validate that loginUrl is required', () => {
      expect(() => {
        validateAuthConfig({
          axios: mockAxios,
          logoutUrl: '/logout',
          extractToken: (data) => data.token
        } as any);
      }).toThrow('AuthConfig: tokenUrl or loginUrl is required');
    });

    it('should accept missing logoutUrl (OAuth compatible)', () => {
      expect(() => {
        validateAuthConfig({
          axios: mockAxios,
          loginUrl: '/login',
          extractToken: (data) => data.token
        } as any);
      }).not.toThrow();
    });

    it('should accept missing extractToken (OAuth compatible)', () => {
      expect(() => {
        validateAuthConfig({
          axios: mockAxios,
          loginUrl: '/login',
          logoutUrl: '/logout'
        } as any);
      }).not.toThrow();
    });

    it('should pass validation with all required fields', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        extractToken: (data: any) => data.token
      };

      expect(() => validateAuthConfig(config)).not.toThrow();
    });
  });

  describe('default values', () => {
    it('should apply default persistence settings', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        extractToken: (data: any) => data.token
      };

      const validated = validateAuthConfig(config);

      expect(validated.persistence).toEqual({
        enabled: true,
        storage: expect.any(Object),
        tokenKey: 'token',
        refreshTokenKey: 'refresh_token',
        userKey: 'user',
        expiryKey: 'expires_at'
      });
    });

    it('should apply default Bearer auth header format', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        extractToken: (data: any) => data.token
      };

      const validated = validateAuthConfig(config);
      const headerValue = validated.formatAuthHeader('test-token');

      expect(headerValue).toBe('Bearer test-token');
    });

    it('should preserve custom formatAuthHeader', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        extractToken: (data: any) => data.token,
        formatAuthHeader: (token: string) => `Token ${token}`
      };

      const validated = validateAuthConfig(config);
      const headerValue = validated.formatAuthHeader('test-token');

      expect(headerValue).toBe('Token test-token');
    });

    it('should preserve custom persistence settings', () => {
      const customStorage = window.sessionStorage;
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        extractToken: (data: any) => data.token,
        persistence: {
          enabled: false,
          storage: customStorage,
          tokenKey: 'custom_token',
          userKey: 'custom_user'
        }
      };

      const validated = validateAuthConfig(config);

      expect(validated.persistence).toEqual({
        enabled: false,
        storage: customStorage,
        tokenKey: 'custom_token',
        refreshTokenKey: 'refresh_token', // OAuth defaults are still applied
        userKey: 'custom_user',
        expiryKey: 'expires_at' // OAuth defaults are still applied
      });
    });
  });

  describe('optional fields', () => {
    it('should handle missing getUserUrl', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        extractToken: (data: any) => data.token
      };

      const validated = validateAuthConfig(config);
      expect(validated.getUserUrl).toBeUndefined();
    });

    it('should preserve getUserUrl when provided', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        getUserUrl: '/me',
        extractToken: (data: any) => data.token
      };

      const validated = validateAuthConfig(config);
      expect(validated.getUserUrl).toBe('/me');
    });

    it('should preserve callback functions', () => {
      const onError = jest.fn();
      const onLogin = jest.fn();
      const onLogout = jest.fn();

      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        extractToken: (data: any) => data.token,
        onError,
        onLogin,
        onLogout
      };

      const validated = validateAuthConfig(config);
      expect(validated.onError).toBe(onError);
      expect(validated.onLogin).toBe(onLogin);
      expect(validated.onLogout).toBe(onLogout);
    });
  });

  describe('storage interface compliance', () => {
    it('should work with localStorage', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        extractToken: (data: any) => data.token,
        persistence: {
          storage: window.localStorage
        }
      };

      const validated = validateAuthConfig(config);
      expect(validated.persistence.storage).toBe(window.localStorage);
    });

    it('should work with sessionStorage', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        extractToken: (data: any) => data.token,
        persistence: {
          storage: window.sessionStorage
        }
      };

      const validated = validateAuthConfig(config);
      expect(validated.persistence.storage).toBe(window.sessionStorage);
    });

    it('should work with custom storage implementation', () => {
      const customStorage = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn()
      };

      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        extractToken: (data: any) => data.token,
        persistence: {
          storage: customStorage as Storage
        }
      };

      const validated = validateAuthConfig(config);
      expect(validated.persistence.storage).toBe(customStorage);
    });
  });

  describe('SSR compatibility', () => {
    it('should handle missing window object gracefully', () => {
      // Temporarily remove window object
      const originalWindow = global.window;
      delete (global as any).window;

      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        extractToken: (data: any) => data.token
      };

      const validated = validateAuthConfig(config);
      expect(validated.persistence.storage).toEqual({});

      // Restore window
      global.window = originalWindow;
    });
  });
});