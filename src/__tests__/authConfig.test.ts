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

  describe('OAuth token extraction', () => {
    it('should use custom extractTokens function when provided', () => {
      const customExtractTokens = jest.fn().mockReturnValue({
        accessToken: 'custom-access',
        refreshToken: 'custom-refresh',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600000
      });

      const config = {
        axios: mockAxios,
        tokenUrl: '/oauth/token',
        extractTokens: customExtractTokens
      };

      const validated = validateAuthConfig(config);
      const testData = { custom_field: 'test-data' };
      const result = validated.extractTokens(testData);

      expect(customExtractTokens).toHaveBeenCalledWith(testData);
      expect(result.accessToken).toBe('custom-access');
      expect(result.refreshToken).toBe('custom-refresh');
    });

    it('should use custom OAuth field extractors', () => {
      const extractAccessToken = jest.fn().mockReturnValue('custom-access-token');
      const extractRefreshToken = jest.fn().mockReturnValue('custom-refresh-token');
      const extractExpiresIn = jest.fn().mockReturnValue(7200);
      const extractTokenType = jest.fn().mockReturnValue('Custom');
      const extractScope = jest.fn().mockReturnValue(['read', 'write']);

      const config = {
        axios: mockAxios,
        tokenUrl: '/oauth/token',
        extractAccessToken,
        extractRefreshToken,
        extractExpiresIn,
        extractTokenType,
        extractScope
      };

      const validated = validateAuthConfig(config);
      const testData = {
        access_token: 'standard-access',
        refresh_token: 'standard-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'read write'
      };
      
      const result = validated.extractTokens(testData);

      expect(extractAccessToken).toHaveBeenCalledWith(testData);
      expect(extractRefreshToken).toHaveBeenCalledWith(testData);
      expect(extractExpiresIn).toHaveBeenCalledWith(testData);
      expect(extractTokenType).toHaveBeenCalledWith(testData);
      expect(extractScope).toHaveBeenCalledWith(testData);

      expect(result.accessToken).toBe('custom-access-token');
      expect(result.refreshToken).toBe('custom-refresh-token');
      expect(result.tokenType).toBe('Custom');
      expect(result.scope).toEqual(['read', 'write']);
      expect(result.expiresAt).toBeGreaterThan(Date.now() + 7199000); // ~7200 seconds from now
    });

    it('should handle OAuth response with standard fields', () => {
      const config = {
        axios: mockAxios,
        tokenUrl: '/oauth/token'
      };

      const validated = validateAuthConfig(config);
      const oauthResponse = {
        access_token: 'oauth-access-token',
        refresh_token: 'oauth-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'read write profile'
      };

      const result = validated.extractTokens(oauthResponse);

      expect(result.accessToken).toBe('oauth-access-token');
      expect(result.refreshToken).toBe('oauth-refresh-token');
      expect(result.tokenType).toBe('Bearer');
      expect(result.scope).toEqual(['read', 'write', 'profile']);
      expect(result.expiresAt).toBeGreaterThan(Date.now() + 3599000);
    });

    it('should handle OAuth response without optional fields', () => {
      const config = {
        axios: mockAxios,
        tokenUrl: '/oauth/token'
      };

      const validated = validateAuthConfig(config);
      const minimalResponse = {
        access_token: 'minimal-token'
      };

      const result = validated.extractTokens(minimalResponse);

      expect(result.accessToken).toBe('minimal-token');
      expect(result.refreshToken).toBeUndefined();
      expect(result.tokenType).toBe('Bearer'); // Default
      expect(result.scope).toBeUndefined();
      expect(result.expiresAt).toBeUndefined();
    });

    it('should fallback to legacy token extraction', () => {
      const extractToken = jest.fn().mockReturnValue('legacy-token');

      const config = {
        axios: mockAxios,
        loginUrl: '/auth/login',
        extractToken
      };

      const validated = validateAuthConfig(config);
      const legacyResponse = {
        auth_token: 'django-token',
        user: { id: 1, name: 'Test User' }
      };

      const result = validated.extractTokens(legacyResponse);

      expect(extractToken).toHaveBeenCalledWith(legacyResponse);
      expect(result.accessToken).toBe('legacy-token');
      expect(result.tokenType).toBe('Bearer'); // Standard default
      expect(result.refreshToken).toBeUndefined();
    });

    it('should handle auth_token field without extractToken function', () => {
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
        tokenUrl: '/oauth/token'
      };

      const validated = validateAuthConfig(config);
      const invalidResponse = {
        user: { id: 1, name: 'Test' },
        message: 'Success'
      };

      expect(() => validated.extractTokens(invalidResponse)).toThrow(
        'No valid token found in response. Provide extractTokens, extractToken, or ensure response contains access_token/auth_token field.'
      );
    });

    it('should provide helpful error message for invalid responses', () => {
      const config = {
        axios: mockAxios,
        loginUrl: '/auth/login'
      };

      const validated = validateAuthConfig(config);
      const emptyResponse = {};

      expect(() => validated.extractTokens(emptyResponse)).toThrow(
        /No valid token found in response/
      );
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