import { validateAuthConfig } from '../src/authConfig';
import { createMockAxios } from './testHelpers';

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
        } as any);
      }).toThrow('AuthConfig: axios instance is required');
    });

    it('should validate that loginUrl is required', () => {
      expect(() => {
        validateAuthConfig({
          axios: mockAxios,
          logoutUrl: '/logout',
        } as any);
      }).toThrow('AuthConfig: loginUrl is required');
    });

    it('should accept missing logoutUrl', () => {
      expect(() => {
        validateAuthConfig({
          axios: mockAxios,
          loginUrl: '/login',
        });
      }).not.toThrow();
    });

    it('should pass validation with all required fields', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
      };

      expect(() => validateAuthConfig(config)).not.toThrow();
    });
  });

  describe('default values', () => {
    it('should apply default persistence settings (disabled by default)', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
      };

      const validated = validateAuthConfig(config);

      expect(validated.persistence).toEqual({
        enabled: false,
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
      };

      const validated = validateAuthConfig(config);
      const headerValue = validated.formatAuthHeader('test-token');

      expect(headerValue).toBe('Bearer test-token');
    });

    it('should apply default auto-refresh settings', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
      };

      const validated = validateAuthConfig(config);

      expect(validated.autoRefresh).toBe(true);
      expect(validated.refreshThreshold).toBe(300000); // 5 minutes
    });

    it('should preserve custom formatAuthHeader', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
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
        persistence: {
          enabled: true,
          storage: customStorage,
          tokenKey: 'custom_token',
          userKey: 'custom_user'
        }
      };

      const validated = validateAuthConfig(config);

      expect(validated.persistence).toEqual({
        enabled: true,
        storage: customStorage,
        tokenKey: 'custom_token',
        refreshTokenKey: 'refresh_token',
        userKey: 'custom_user',
        expiryKey: 'expires_at'
      });
    });
  });

  describe('optional fields', () => {
    it('should handle missing getUserUrl', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
      };

      const validated = validateAuthConfig(config);
      expect(validated.getUserUrl).toBeUndefined();
    });

    it('should preserve getUserUrl when provided', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        getUserUrl: '/me',
      };

      const validated = validateAuthConfig(config);
      expect(validated.getUserUrl).toBe('/me');
    });

    it('should preserve refreshUrl when provided', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        refreshUrl: '/auth/refresh',
      };

      const validated = validateAuthConfig(config);
      expect(validated.refreshUrl).toBe('/auth/refresh');
    });

    it('should preserve authCheckUrl when provided', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        authCheckUrl: '/auth/check',
      };

      const validated = validateAuthConfig(config);
      expect(validated.authCheckUrl).toBe('/auth/check');
    });

    it('should preserve callback functions', () => {
      const onError = jest.fn();
      const onLogin = jest.fn();
      const onLogout = jest.fn();

      const config = {
        axios: mockAxios,
        loginUrl: '/login',
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

  describe('token extraction', () => {
    it('should use custom extractTokens function when provided', () => {
      const customExtractTokens = jest.fn().mockReturnValue({
        accessToken: 'custom-access',
        refreshToken: 'custom-refresh',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600000
      });

      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        extractTokens: customExtractTokens
      };

      const validated = validateAuthConfig(config);
      const testData = { custom_field: 'test-data' };
      const result = validated.extractTokens(testData);

      expect(customExtractTokens).toHaveBeenCalledWith(testData);
      expect(result.accessToken).toBe('custom-access');
      expect(result.refreshToken).toBe('custom-refresh');
    });

    it('should handle OAuth 2.0 response with standard fields', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login'
      };

      const validated = validateAuthConfig(config);
      const oauthResponse = {
        access_token: 'oauth-access-token',
        refresh_token: 'oauth-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      const result = validated.extractTokens(oauthResponse);

      expect(result.accessToken).toBe('oauth-access-token');
      expect(result.refreshToken).toBe('oauth-refresh-token');
      expect(result.tokenType).toBe('Bearer');
      expect(result.expiresAt).toBeGreaterThan(Date.now() + 3599000);
    });

    it('should handle OAuth response without optional fields', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login'
      };

      const validated = validateAuthConfig(config);
      const minimalResponse = {
        access_token: 'minimal-token'
      };

      const result = validated.extractTokens(minimalResponse);

      expect(result.accessToken).toBe('minimal-token');
      expect(result.refreshToken).toBeUndefined();
      expect(result.tokenType).toBe('Bearer');
      expect(result.expiresAt).toBeUndefined();
    });

    it('should handle auth_token field', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/auth/login'
      };

      const validated = validateAuthConfig(config);
      const response = {
        auth_token: 'auto-extracted-token'
      };

      const result = validated.extractTokens(response);

      expect(result.accessToken).toBe('auto-extracted-token');
      expect(result.tokenType).toBe('Bearer');
    });

    it('should handle generic token field', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/auth/login'
      };

      const validated = validateAuthConfig(config);
      const response = {
        token: 'generic-token'
      };

      const result = validated.extractTokens(response);

      expect(result.accessToken).toBe('generic-token');
      expect(result.tokenType).toBe('Bearer');
    });

    it('should throw error when no valid token fields found', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login'
      };

      const validated = validateAuthConfig(config);
      const invalidResponse = {
        user: { id: 1, name: 'Test' },
        message: 'Success'
      };

      expect(() => validated.extractTokens(invalidResponse)).toThrow(
        /No token found in response/
      );
    });
  });

  describe('cookie auth configuration', () => {
    it('should not have cookieAuth by default', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login'
      };

      const validated = validateAuthConfig(config);
      expect(validated.cookieAuth).toBeUndefined();
    });

    it('should configure cookie auth with defaults', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        cookieAuth: {
          enabled: true
        }
      };

      const validated = validateAuthConfig(config);

      expect(validated.cookieAuth?.enabled).toBe(true);
      expect(validated.cookieAuth?.csrf.enabled).toBe(false);
      expect(validated.cookieAuth?.csrf.headerName).toBe('X-CSRFToken');
      expect(typeof validated.cookieAuth?.csrf.getToken).toBe('function');
    });

    it('should configure cookie auth with CSRF', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        cookieAuth: {
          enabled: true,
          csrf: {
            enabled: true,
            headerName: 'X-CSRF-Token',
            cookieName: 'csrf_token'
          }
        }
      };

      const validated = validateAuthConfig(config);

      expect(validated.cookieAuth?.enabled).toBe(true);
      expect(validated.cookieAuth?.csrf.enabled).toBe(true);
      expect(validated.cookieAuth?.csrf.headerName).toBe('X-CSRF-Token');
      expect(typeof validated.cookieAuth?.csrf.getToken).toBe('function');
    });
  });

  describe('storage interface compliance', () => {
    it('should work with localStorage', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        persistence: {
          enabled: true,
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
        persistence: {
          enabled: true,
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
        persistence: {
          enabled: true,
          storage: customStorage as Storage
        }
      };

      const validated = validateAuthConfig(config);
      expect(validated.persistence.storage).toBe(customStorage);
    });
  });

  describe('SSR compatibility', () => {
    it('should handle missing window object gracefully', () => {
      const originalWindow = global.window;
      delete (global as any).window;

      const config = {
        axios: mockAxios,
        loginUrl: '/login'
      };

      const validated = validateAuthConfig(config);
      expect(validated.persistence.storage).toEqual({});

      global.window = originalWindow;
    });
  });

  describe('user extraction', () => {
    it('should not have extractUser by default', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login'
      };

      const validated = validateAuthConfig(config);
      expect(validated.extractUser).toBeUndefined();
    });

    it('should use extractUser function when provided', () => {
      const extractUser = jest.fn().mockReturnValue({ id: 1, name: 'Test' });

      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        extractUser
      };

      const validated = validateAuthConfig(config);
      const response = { user: { id: 1, name: 'Test' } };
      const result = validated.extractUser!(response);

      expect(extractUser).toHaveBeenCalledWith(response);
      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should normalize string extractUser to function', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        extractUser: 'user'
      };

      const validated = validateAuthConfig(config);
      expect(typeof validated.extractUser).toBe('function');

      const response = { user: { id: 1, name: 'Test' } };
      const result = validated.extractUser!(response);

      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should extract nested field using string key', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        extractUser: 'account'
      };

      const validated = validateAuthConfig(config);
      const response = { account: { id: 2, email: 'test@example.com' } };
      const result = validated.extractUser!(response);

      expect(result).toEqual({ id: 2, email: 'test@example.com' });
    });

    it('should return null when string key not found', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        extractUser: 'user'
      };

      const validated = validateAuthConfig(config);
      const response = { data: { something: 'else' } };
      const result = validated.extractUser!(response);

      expect(result).toBeNull();
    });

    it('should handle custom extractUser returning null', () => {
      const extractUser = jest.fn().mockReturnValue(null);

      const config = {
        axios: mockAxios,
        loginUrl: '/login',
        extractUser
      };

      const validated = validateAuthConfig(config);
      const response = { authenticated: true };
      const result = validated.extractUser!(response);

      expect(result).toBeNull();
    });
  });
});
