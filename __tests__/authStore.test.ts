import { createAuthStore } from '../src/authStore';
import { validateAuthConfig } from '../src/authConfig';
import { TestUser, createMockAxios, createMockStorage, resetAllMocks } from './testHelpers';
import { testConfigs, createStorageQuotaError } from './testUtils';

describe('createAuthStore', () => {
  let mockAxios: any;

  beforeEach(() => {
    resetAllMocks();
    mockAxios = createMockAxios();
  });

  describe('initial state', () => {
    it('should create store with empty initial state when no persistence', () => {
      const config = validateAuthConfig({
        ...testConfigs.withoutPersistence,
        axios: mockAxios
      });

      const store = createAuthStore(config);
      const state = store.getState();

      expect(state.user).toBeNull();
      expect(state.tokens).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('should restore state from localStorage when available', () => {
      const mockStorage = window.localStorage as jest.Mocked<Storage>;
      mockStorage.getItem.mockImplementation((key: string) => {
        if (key === 'token') return 'stored-token';
        if (key === 'user') return JSON.stringify({ id: 1, email: 'test@example.com', name: 'Test User' });
        return null;
      });

      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        persistence: { enabled: true }
      });

      const store = createAuthStore(config);
      const state = store.getState();

      expect(state.tokens?.accessToken).toBe('stored-token');
      expect(state.user).toEqual({ id: 1, email: 'test@example.com', name: 'Test User' });
      expect(state.isAuthenticated).toBe(true);
    });

    it('should handle corrupted user data in storage', () => {
      const mockStorage = window.localStorage as jest.Mocked<Storage>;
      mockStorage.getItem.mockImplementation((key: string) => {
        if (key === 'token') return 'stored-token';
        if (key === 'user') return 'invalid-json';
        return null;
      });

      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        persistence: { enabled: true }
      });

      const store = createAuthStore(config);
      const state = store.getState();

      expect(state.tokens?.accessToken).toBe('stored-token');
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(true);
    });

    it('should work with custom storage keys', () => {
      const mockStorage = window.sessionStorage as jest.Mocked<Storage>;
      mockStorage.getItem.mockImplementation((key: string) => {
        if (key === 'custom_token') return 'stored-token';
        if (key === 'custom_user') return JSON.stringify({ id: 1, email: 'test@example.com', name: 'Test User' });
        return null;
      });

      const config = validateAuthConfig({
        ...testConfigs.withCustomStorage,
        axios: mockAxios
      });

      const store = createAuthStore(config);
      const state = store.getState();

      expect(state.tokens?.accessToken).toBe('stored-token');
      expect(state.user).toEqual({ id: 1, email: 'test@example.com', name: 'Test User' });
    });
  });

  describe('setTokens', () => {
    it('should update tokens and storage', () => {
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        persistence: { enabled: true }
      });

      const store = createAuthStore(config);
      const { setTokens } = store.getState();

      setTokens({ accessToken: 'new-token', tokenType: 'Bearer' });

      const state = store.getState();
      expect(state.tokens?.accessToken).toBe('new-token');
      expect(state.isAuthenticated).toBe(true);
      expect(window.localStorage.setItem).toHaveBeenCalledWith('token', 'new-token');
    });

    it('should handle storage errors gracefully', () => {
      const onError = jest.fn();
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        onError,
        persistence: { enabled: true }
      });

      const mockStorage = window.localStorage as jest.Mocked<Storage>;
      mockStorage.setItem.mockImplementation(() => {
        throw createStorageQuotaError();
      });

      const store = createAuthStore(config);
      const { setTokens } = store.getState();

      setTokens({ accessToken: 'new-token', tokenType: 'Bearer' });

      const state = store.getState();
      expect(state.tokens?.accessToken).toBe('new-token');
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should not write to storage when persistence disabled', () => {
      const config = validateAuthConfig({
        ...testConfigs.withoutPersistence,
        axios: mockAxios
      });

      const store = createAuthStore(config);
      const { setTokens } = store.getState();

      setTokens({ accessToken: 'new-token', tokenType: 'Bearer' });

      expect(window.localStorage.setItem).not.toHaveBeenCalled();
      expect(store.getState().tokens?.accessToken).toBe('new-token');
    });
  });

  describe('setUser', () => {
    it('should update user and storage', () => {
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        persistence: { enabled: true }
      });

      const store = createAuthStore(config);
      const { setUser } = store.getState();

      const user: TestUser = { id: 1, email: 'test@example.com', name: 'Test User' };
      setUser(user);

      const state = store.getState();
      expect(state.user).toEqual(user);
      expect(window.localStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(user));
    });

    it('should handle storage errors for user data', () => {
      const onError = jest.fn();
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        onError,
        persistence: { enabled: true }
      });

      const mockStorage = window.localStorage as jest.Mocked<Storage>;
      mockStorage.setItem.mockImplementation((key: string) => {
        if (key === 'user') throw createStorageQuotaError();
      });

      const store = createAuthStore(config);
      const { setUser } = store.getState();

      const user: TestUser = { id: 1, email: 'test@example.com', name: 'Test User' };
      setUser(user);

      expect(store.getState().user).toEqual(user);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('unsetUser', () => {
    it('should clear user and tokens from state and storage', () => {
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        persistence: { enabled: true }
      });

      const store = createAuthStore(config);
      const { setTokens, setUser, unsetUser } = store.getState();

      // Set initial data
      setTokens({ accessToken: 'token', tokenType: 'Bearer' });
      setUser({ id: 1, email: 'test@example.com', name: 'Test User' });

      // Clear data
      unsetUser();

      const state = store.getState();
      expect(state.user).toBeNull();
      expect(state.tokens).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('token');
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('user');
    });

    it('should handle storage removal errors', () => {
      const onError = jest.fn();
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        onError,
        persistence: { enabled: true }
      });

      const mockStorage = window.localStorage as jest.Mocked<Storage>;
      mockStorage.removeItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      const store = createAuthStore(config);
      const { unsetUser } = store.getState();

      unsetUser();

      const state = store.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('persistence configurations', () => {
    it('should work with sessionStorage', () => {
      const mockSessionStorage = window.sessionStorage as jest.Mocked<Storage>;
      mockSessionStorage.getItem.mockImplementation((key: string) => {
        if (key === 'token') return 'session-token';
        return null;
      });

      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        persistence: {
          enabled: true,
          storage: window.sessionStorage
        }
      });

      const store = createAuthStore(config);
      expect(store.getState().tokens?.accessToken).toBe('session-token');

      const { setTokens } = store.getState();
      setTokens({ accessToken: 'new-session-token', tokenType: 'Bearer' });

      expect(mockSessionStorage.setItem).toHaveBeenCalledWith('token', 'new-session-token');
    });

    it('should work with custom storage implementation', () => {
      const customStorage = createMockStorage();
      customStorage.getItem.mockReturnValue('custom-token');

      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        persistence: {
          enabled: true,
          storage: customStorage as Storage
        }
      });

      const store = createAuthStore(config);
      expect(store.getState().tokens?.accessToken).toBe('custom-token');

      const { setTokens } = store.getState();
      setTokens({ accessToken: 'new-custom-token', tokenType: 'Bearer' });

      expect(customStorage.setItem).toHaveBeenCalledWith('token', 'new-custom-token');
    });
  });

  describe('SSR compatibility', () => {
    it('should work when localStorage is not available', () => {
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout',
        persistence: {
          storage: {} as Storage
        }
      });

      const store = createAuthStore(config);
      const { setTokens, setUser, unsetUser } = store.getState();

      // Should not throw errors
      expect(() => {
        setTokens({ accessToken: 'token', tokenType: 'Bearer' });
        setUser({ id: 1, email: 'test@example.com', name: 'Test User' });
        unsetUser();
      }).not.toThrow();
    });
  });

  describe('authentication state logic', () => {
    it('should set isAuthenticated to true when tokens exist', () => {
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout'
      });

      const store = createAuthStore(config);
      const { setTokens } = store.getState();

      setTokens({ accessToken: 'token', tokenType: 'Bearer' });
      expect(store.getState().isAuthenticated).toBe(true);
    });

    it('should set isAuthenticated to false after unsetUser', () => {
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/login',
        logoutUrl: '/logout'
      });

      const store = createAuthStore(config);
      const { setTokens, unsetUser } = store.getState();

      setTokens({ accessToken: 'token', tokenType: 'Bearer' });
      expect(store.getState().isAuthenticated).toBe(true);

      unsetUser();
      expect(store.getState().isAuthenticated).toBe(false);
    });
  });

  describe('OAuth storage operations', () => {
    it('should handle optional refresh token removal', () => {
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/oauth/token',
        persistence: {
          enabled: true,
          storage: window.localStorage
        }
      });

      const store = createAuthStore(config);

      // Clear previous test state
      (window.localStorage.setItem as jest.Mock).mockClear();
      (window.localStorage.removeItem as jest.Mock).mockClear();

      // Set tokens with refresh token
      store.getState().setTokens({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer'
      });

      expect(window.localStorage.setItem).toHaveBeenCalledWith('refresh_token', 'refresh-token');

      // Update tokens without refresh token
      store.getState().setTokens({
        accessToken: 'new-access-token',
        tokenType: 'Bearer'
      });

      expect(window.localStorage.removeItem).toHaveBeenCalledWith('refresh_token');
    });

    it('should handle optional expiry removal', () => {
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/oauth/token',
        persistence: {
          enabled: true,
          storage: window.localStorage
        }
      });

      const store = createAuthStore(config);

      // First, set tokens with both refresh token and expiry
      const expiresAt = Date.now() + 3600000;
      store.getState().setTokens({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        expiresAt
      });

      // Clear mocks after initial setup
      (window.localStorage.setItem as jest.Mock).mockClear();
      (window.localStorage.removeItem as jest.Mock).mockClear();

      // Now update tokens with refresh token but without expiry
      store.getState().setTokens({
        accessToken: 'new-access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer'
      });

      // Verify that expires_at was removed when not provided
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('expires_at');
      expect(window.localStorage.setItem).toHaveBeenCalledWith('token', 'new-access-token');
      expect(window.localStorage.setItem).toHaveBeenCalledWith('refresh_token', 'refresh-token');
    });

    it('should handle storage errors during refresh token operations', () => {
      const onError = jest.fn();
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/oauth/token',
        onError,
        persistence: {
          enabled: true,
          storage: window.localStorage
        }
      });

      const store = createAuthStore(config);
      const error = new Error('Storage quota exceeded');

      // Mock storage error for removeItem
      (window.localStorage.removeItem as jest.Mock).mockImplementation(() => {
        throw error;
      });

      // Set tokens without refresh token (should trigger removeItem)
      store.getState().setTokens({
        accessToken: 'access-token',
        tokenType: 'Bearer'
      });

      expect(onError).toHaveBeenCalledWith(error);
    });

    it('should handle tokens without expiry information', () => {
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/oauth/token'
      });

      const store = createAuthStore(config);

      // Set tokens without expiry
      store.getState().setTokens({
        accessToken: 'access-token',
        tokenType: 'Bearer'
      });

      const isExpired = store.getState().isTokenExpired();
      expect(isExpired).toBe(false);
    });

    it('should return false when no expiration timestamp available', () => {
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/oauth/token'
      });

      const store = createAuthStore(config);

      // No tokens set at all
      const isExpired = store.getState().isTokenExpired();
      expect(isExpired).toBe(false);
    });

    it('should correctly identify expired tokens', () => {
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/oauth/token'
      });

      const store = createAuthStore(config);

      // Set expired tokens
      const expiredTime = Date.now() - 1000;
      store.getState().setTokens({
        accessToken: 'expired-token',
        tokenType: 'Bearer',
        expiresAt: expiredTime
      });

      const isExpired = store.getState().isTokenExpired();
      expect(isExpired).toBe(true);
    });

    it('should correctly identify valid tokens', () => {
      const config = validateAuthConfig({
        axios: mockAxios,
        loginUrl: '/oauth/token'
      });

      const store = createAuthStore(config);

      // Set future expiry
      const futureTime = Date.now() + 3600000;
      store.getState().setTokens({
        accessToken: 'valid-token',
        tokenType: 'Bearer',
        expiresAt: futureTime
      });

      const isExpired = store.getState().isTokenExpired();
      expect(isExpired).toBe(false);
    });
  });
});
