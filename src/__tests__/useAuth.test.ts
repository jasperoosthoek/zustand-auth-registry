import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../useAuth';
import { createAuthRegistry } from '../createAuthRegistry';
import { TestUser, createMockAxios, mockUser, resetAllMocks, extractAuthHeader } from './testHelpers';
import { testConfigs, mockResponses, createAxiosError } from './testUtils';

// Mock axios module
const mockAxios = require('axios');

describe('useAuth', () => {
  let mockAxiosInstance: any;
  let getAuthStore: any;

  beforeEach(() => {
    resetAllMocks();
    mockAxiosInstance = createMockAxios();
    getAuthStore = createAuthRegistry<{ main: TestUser }>();
    
    // Reset axios mocks
    mockAxios.isAxiosError.mockReset();
  });

  describe('hook interface', () => {
    it('should return auth interface with correct methods', () => {
      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance
      });

      const { result } = renderHook(() => useAuth(store));

      expect(result.current).toHaveProperty('login');
      expect(result.current).toHaveProperty('logout');
      expect(result.current).toHaveProperty('getCurrentUser');
      expect(typeof result.current.login).toBe('function');
      expect(typeof result.current.logout).toBe('function');
      expect(typeof result.current.getCurrentUser).toBe('function');
    });
  });

  describe('login functionality', () => {
    it('should login successfully and update state', async () => {
      mockAxiosInstance.post.mockResolvedValue(mockResponses.loginSuccess);
      mockAxiosInstance.get.mockResolvedValue(mockResponses.userSuccess); // Need this for getCurrentUser
      
      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance
      });

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password' });
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password'
      });

      const state = store.getState();
      expect(state.token).toBe('mock-jwt-token-12345');
      expect(extractAuthHeader(mockAxiosInstance)).toBe('Bearer mock-jwt-token-12345');
    });

    it('should fetch current user after login when getUserUrl is provided', async () => {
      mockAxiosInstance.post.mockResolvedValue(mockResponses.loginSuccess);
      mockAxiosInstance.get.mockResolvedValue(mockResponses.userSuccess);

      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance
      });

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password' });
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/auth/me');
      
      const state = store.getState();
      expect(state.user).toEqual(mockUser);
    });

    it('should not fetch user when getUserUrl is not provided', async () => {
      mockAxiosInstance.post.mockResolvedValue(mockResponses.loginSuccess);

      const store = getAuthStore('main', {
        ...testConfigs.withoutGetUser,
        axios: mockAxiosInstance
      });

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password' });
      });

      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });

    it('should call onLogin callback with user data', async () => {
      const onLogin = jest.fn();
      mockAxiosInstance.post.mockResolvedValue(mockResponses.loginSuccess);
      mockAxiosInstance.get.mockResolvedValue(mockResponses.userSuccess);

      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance,
        onLogin
      });

      // Set user in store first (simulating getCurrentUser success)
      store.getState().setUser(mockUser);

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password' });
      });

      expect(onLogin).toHaveBeenCalledWith(mockUser);
    });

    it('should call login callback when provided', async () => {
      const callback = jest.fn();
      mockAxiosInstance.post.mockResolvedValue(mockResponses.loginSuccess);

      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance
      });

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password' }, callback);
      });

      expect(callback).toHaveBeenCalled();
    });

    it('should handle login errors', async () => {
      const onError = jest.fn();
      const loginError = createAxiosError('Invalid credentials', 401);
      mockAxiosInstance.post.mockRejectedValue(loginError);

      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance,
        onError
      });

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.login({ email: 'wrong@example.com', password: 'wrong' });
      });

      expect(onError).toHaveBeenCalledWith(loginError);
      expect(store.getState().isAuthenticated).toBe(false);
      expect(extractAuthHeader(mockAxiosInstance)).toBeUndefined();
    });
  });

  describe('logout functionality', () => {
    it('should logout successfully and clear state', async () => {
      mockAxiosInstance.post.mockResolvedValue(mockResponses.logoutSuccess);
      
      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance
      });

      // Set initial authenticated state
      store.getState().setToken('token');
      store.getState().setUser(mockUser);

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.logout();
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/logout');
      
      const state = store.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBe('');
      expect(state.isAuthenticated).toBe(false);
      expect(extractAuthHeader(mockAxiosInstance)).toBeUndefined();
    });

    it('should call onLogout callback', async () => {
      const onLogout = jest.fn();
      mockAxiosInstance.post.mockResolvedValue(mockResponses.logoutSuccess);

      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance,
        onLogout
      });

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.logout();
      });

      expect(onLogout).toHaveBeenCalled();
    });

    it('should clear state even when logout API fails', async () => {
      const onError = jest.fn();
      const logoutError = createAxiosError('Server error', 500);
      mockAxiosInstance.post.mockRejectedValue(logoutError);

      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance,
        onError
      });

      // Set initial authenticated state
      store.getState().setToken('token');
      store.getState().setUser(mockUser);

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.logout();
      });

      expect(onError).toHaveBeenCalledWith(logoutError);
      
      const state = store.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBe('');
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('getCurrentUser functionality', () => {
    it('should fetch current user successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue(mockResponses.userSuccess);

      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance
      });

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.getCurrentUser();
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/auth/me');
      expect(store.getState().user).toEqual(mockUser);
    });

    it('should not make request when getUserUrl is not configured', async () => {
      const store = getAuthStore('main', {
        ...testConfigs.withoutGetUser,
        axios: mockAxiosInstance
      });

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.getCurrentUser();
      });

      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });

    it('should handle getCurrentUser errors', async () => {
      const onError = jest.fn();
      const userError = createAxiosError('Unauthorized', 401);
      mockAxiosInstance.get.mockRejectedValue(userError);

      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance,
        onError
      });

      // Set initial state
      store.getState().setToken('token');

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.getCurrentUser();
      });

      expect(onError).toHaveBeenCalledWith(userError);
      expect(store.getState().isAuthenticated).toBe(false);
      expect(extractAuthHeader(mockAxiosInstance)).toBeUndefined();
    });
  });

  describe('axios header management', () => {
    it('should set Bearer authorization header by default', async () => {
      mockAxiosInstance.post.mockResolvedValue(mockResponses.loginSuccess);
      mockAxiosInstance.get.mockResolvedValue(mockResponses.userSuccess);

      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance
      });

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password' });
      });

      expect(extractAuthHeader(mockAxiosInstance)).toBe('Bearer mock-jwt-token-12345');
    });

    it('should use custom auth header format', async () => {
      mockAxiosInstance.post.mockResolvedValue(mockResponses.loginSuccess);
      mockAxiosInstance.get.mockResolvedValue(mockResponses.userSuccess);

      const store = getAuthStore('main', {
        ...testConfigs.withTokenFormat,
        axios: mockAxiosInstance
      });

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.login({ email: 'test@example.com', password: 'password' });
      });

      expect(extractAuthHeader(mockAxiosInstance)).toBe('Token mock-jwt-token-12345');
    });

    it('should remove authorization header on logout', async () => {
      mockAxiosInstance.post.mockResolvedValue(mockResponses.logoutSuccess);

      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance
      });

      // Set initial header
      mockAxiosInstance.defaults.headers.common['Authorization'] = 'Bearer token';

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.logout();
      });

      expect(extractAuthHeader(mockAxiosInstance)).toBeUndefined();
    });
  });

  describe('useEffect behavior', () => {
    it('should set axios headers when token exists on mount', () => {
      const mockStorage = window.localStorage as jest.Mocked<Storage>;
      mockStorage.getItem.mockImplementation((key: string) => {
        if (key === 'token') return 'existing-token';
        if (key === 'user') return JSON.stringify(mockUser);
        return null;
      });

      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance
      });

      renderHook(() => useAuth(store));

      expect(extractAuthHeader(mockAxiosInstance)).toBe('Bearer existing-token');
    });

    it('should fetch current user when token exists but user is missing', async () => {
      mockAxiosInstance.get.mockResolvedValue(mockResponses.userSuccess);
      
      const mockStorage = window.localStorage as jest.Mocked<Storage>;
      mockStorage.getItem.mockImplementation((key: string) => {
        if (key === 'token') return 'existing-token';
        return null;
      });

      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance
      });

      renderHook(() => useAuth(store));

      // Wait for useEffect to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/auth/me');
    });

    it('should handle 403 errors during initialization', async () => {
      mockAxios.isAxiosError.mockReturnValue(true);
      const forbiddenError = createAxiosError('Forbidden', 403);
      mockAxiosInstance.get.mockRejectedValue(forbiddenError);

      const mockStorage = window.localStorage as jest.Mocked<Storage>;
      mockStorage.getItem.mockImplementation((key: string) => {
        if (key === 'token') return 'expired-token';
        return null;
      });

      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance
      });

      renderHook(() => useAuth(store));

      // Wait for useEffect to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      expect(store.getState().isAuthenticated).toBe(false);
      expect(extractAuthHeader(mockAxiosInstance)).toBeUndefined();
    });
  });

  describe('OAuth 2.0 Features', () => {
    describe('token refresh functionality', () => {
      it('should return false when no refresh token available', async () => {
        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance
        });

        // Set tokens without refresh token
        store.getState().setTokens({
          accessToken: 'current-token',
          tokenType: 'Bearer'
        });

        const { result } = renderHook(() => useAuth(store));

        let refreshResult: boolean;
        await act(async () => {
          refreshResult = await result.current.refreshTokens();
        });

        expect(refreshResult!).toBe(false);
        expect(mockAxiosInstance.post).not.toHaveBeenCalled();
      });

      it('should successfully refresh tokens and update state', async () => {
        const refreshResponse = {
          data: {
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
            token_type: 'Bearer'
          }
        };
        mockAxiosInstance.post.mockResolvedValue(refreshResponse);

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          tokenUrl: '/oauth/token'
        });

        // Set tokens with refresh token
        store.getState().setTokens({
          accessToken: 'old-access-token',
          refreshToken: 'old-refresh-token',
          tokenType: 'Bearer',
          expiresAt: Date.now() + 300000
        });

        const { result } = renderHook(() => useAuth(store));

        let refreshResult: boolean;
        await act(async () => {
          refreshResult = await result.current.refreshTokens();
        });

        expect(refreshResult!).toBe(true);
        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/oauth/token', {
          grant_type: 'refresh_token',
          refresh_token: 'old-refresh-token'
        });

        const state = store.getState();
        expect(state.tokens?.accessToken).toBe('new-access-token');
        expect(state.tokens?.refreshToken).toBe('new-refresh-token');
        expect(state.token).toBe('new-access-token'); // Backward compatibility
      });

      it('should call onTokenRefresh callback after successful refresh', async () => {
        const onTokenRefresh = jest.fn();
        const refreshResponse = {
          data: {
            access_token: 'new-token',
            refresh_token: 'new-refresh',
            expires_in: 3600,
            token_type: 'Bearer'
          }
        };
        mockAxiosInstance.post.mockResolvedValue(refreshResponse);

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          tokenUrl: '/oauth/token',
          onTokenRefresh
        });

        store.getState().setTokens({
          accessToken: 'old-token',
          refreshToken: 'old-refresh',
          tokenType: 'Bearer'
        });

        const { result } = renderHook(() => useAuth(store));

        await act(async () => {
          await result.current.refreshTokens();
        });

        expect(onTokenRefresh).toHaveBeenCalledWith({
          accessToken: 'new-token',
          refreshToken: 'new-refresh',
          expiresAt: expect.any(Number),
          tokenType: 'Bearer'
        });
      });

      it('should handle refresh failure and clear state', async () => {
        const refreshError = new Error('Refresh failed');
        mockAxiosInstance.post.mockRejectedValue(refreshError);

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          tokenUrl: '/oauth/token'
        });

        // Set initial state with user and tokens
        store.getState().setTokens({
          accessToken: 'old-token',
          refreshToken: 'old-refresh',
          tokenType: 'Bearer'
        });
        store.getState().setUser(mockUser);

        const { result } = renderHook(() => useAuth(store));

        let refreshResult: boolean;
        await act(async () => {
          refreshResult = await result.current.refreshTokens();
        });

        expect(refreshResult!).toBe(false);
        
        const state = store.getState();
        expect(state.user).toBeNull();
        expect(state.tokens).toBeNull();
        expect(state.isAuthenticated).toBe(false);
        expect(mockAxiosInstance.defaults.headers.common['Authorization']).toBeUndefined();
      });

      it('should call onError callback when refresh fails', async () => {
        const onError = jest.fn();
        const refreshError = new Error('Network error');
        mockAxiosInstance.post.mockRejectedValue(refreshError);

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          tokenUrl: '/oauth/token',
          onError
        });

        store.getState().setTokens({
          accessToken: 'old-token',
          refreshToken: 'old-refresh',
          tokenType: 'Bearer'
        });

        const { result } = renderHook(() => useAuth(store));

        await act(async () => {
          await result.current.refreshTokens();
        });

        expect(onError).toHaveBeenCalledWith(refreshError);
      });
    });

    describe('auto-refresh timing', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should refresh tokens immediately when already expired', async () => {
        const refreshResponse = {
          data: {
            access_token: 'refreshed-token',
            refresh_token: 'new-refresh',
            expires_in: 3600,
            token_type: 'Bearer'
          }
        };
        mockAxiosInstance.post.mockResolvedValue(refreshResponse);

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          tokenUrl: '/oauth/token',
          autoRefresh: true
        });

        // Set expired tokens
        const expiredTime = Date.now() - 1000; // 1 second ago
        store.getState().setTokens({
          accessToken: 'expired-token',
          refreshToken: 'valid-refresh',
          tokenType: 'Bearer',
          expiresAt: expiredTime
        });

        await act(async () => {
          renderHook(() => useAuth(store));
        });

        // Should attempt refresh immediately
        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/oauth/token', {
          grant_type: 'refresh_token',
          refresh_token: 'valid-refresh'
        });
      });

      it('should clear state when token expired and no refresh available', async () => {
        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          autoRefresh: true
        });

        // Set expired tokens without refresh token
        const expiredTime = Date.now() - 1000;
        store.getState().setTokens({
          accessToken: 'expired-token',
          tokenType: 'Bearer',
          expiresAt: expiredTime
        });
        store.getState().setUser(mockUser);

        await act(async () => {
          renderHook(() => useAuth(store));
        });

        const state = store.getState();
        expect(state.user).toBeNull();
        expect(state.tokens).toBeNull();
        expect(state.isAuthenticated).toBe(false);
      });

      it('should set up auto-refresh timer before token expiry', async () => {
        const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
        const refreshResponse = {
          data: {
            access_token: 'refreshed-token',
            refresh_token: 'new-refresh',
            expires_in: 3600,
            token_type: 'Bearer'
          }
        };
        mockAxiosInstance.post.mockResolvedValue(refreshResponse);

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          tokenUrl: '/oauth/token',
          autoRefresh: true,
          refreshThreshold: 300000 // 5 minutes
        });

        // Set tokens that expire in 10 minutes
        const futureExpiry = Date.now() + 600000; // 10 minutes
        store.getState().setTokens({
          accessToken: 'valid-token',
          refreshToken: 'valid-refresh',
          tokenType: 'Bearer',
          expiresAt: futureExpiry
        });

        await act(async () => {
          renderHook(() => useAuth(store));
        });

        // Timer should be set for 5 minutes from now (10 - 5 threshold)
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 300000);

        // Fast-forward to when refresh should happen
        await act(async () => {
          jest.advanceTimersByTime(300000);
        });

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/oauth/token', {
          grant_type: 'refresh_token',
          refresh_token: 'valid-refresh'
        });

        setTimeoutSpy.mockRestore();
      });

      it('should respect refreshThreshold configuration', async () => {
        const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          autoRefresh: true,
          refreshThreshold: 120000 // 2 minutes
        });

        // Set tokens that expire in 5 minutes
        const futureExpiry = Date.now() + 300000;
        store.getState().setTokens({
          accessToken: 'valid-token',
          refreshToken: 'valid-refresh',
          tokenType: 'Bearer',
          expiresAt: futureExpiry
        });

        await act(async () => {
          renderHook(() => useAuth(store));
        });

        // Timer should be set for 3 minutes from now (5 - 2 threshold)
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 180000);
        
        setTimeoutSpy.mockRestore();
      });

      it('should cleanup timers when component unmounts', async () => {
        const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          autoRefresh: true
        });

        const futureExpiry = Date.now() + 600000;
        store.getState().setTokens({
          accessToken: 'valid-token',
          refreshToken: 'valid-refresh',
          tokenType: 'Bearer',
          expiresAt: futureExpiry
        });

        const { unmount } = renderHook(() => useAuth(store));

        await act(async () => {
          unmount();
        });

        expect(clearTimeoutSpy).toHaveBeenCalled();
        
        clearTimeoutSpy.mockRestore();
      });

      it('should not set up timer when autoRefresh is disabled', async () => {
        const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          autoRefresh: false
        });

        const futureExpiry = Date.now() + 600000;
        store.getState().setTokens({
          accessToken: 'valid-token',
          refreshToken: 'valid-refresh',
          tokenType: 'Bearer',
          expiresAt: futureExpiry
        });

        await act(async () => {
          renderHook(() => useAuth(store));
        });

        expect(setTimeoutSpy).not.toHaveBeenCalled();
        
        setTimeoutSpy.mockRestore();
      });
    });

    describe('enhanced error handling', () => {
      it('should handle 403 errors during token validation', async () => {
        const error403 = {
          response: { status: 403 },
          isAxiosError: true
        };
        
        mockAxios.isAxiosError.mockReturnValue(true);
        mockAxiosInstance.get.mockRejectedValue(error403);

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          userInfoUrl: '/oauth/userinfo'
        });

        // Set tokens and trigger user info fetch
        store.getState().setTokens({
          accessToken: 'invalid-token',
          tokenType: 'Bearer'
        });

        await act(async () => {
          renderHook(() => useAuth(store));
        });

        const state = store.getState();
        expect(state.user).toBeNull();
        expect(state.tokens).toBeNull();
        expect(state.isAuthenticated).toBe(false);
        expect(mockAxiosInstance.defaults.headers.common['Authorization']).toBeUndefined();
      });

      it('should call onError callback for useEffect errors', async () => {
        const onError = jest.fn();
        const networkError = new Error('Network error');
        
        mockAxios.isAxiosError.mockReturnValue(false);
        mockAxiosInstance.get.mockRejectedValue(networkError);

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          userInfoUrl: '/oauth/userinfo',
          onError
        });

        store.getState().setTokens({
          accessToken: 'valid-token',
          tokenType: 'Bearer'
        });

        await act(async () => {
          renderHook(() => useAuth(store));
        });

        expect(onError).toHaveBeenCalledWith(networkError);
      });
    });

    describe('OAuth logout functionality', () => {
      it('should call OAuth revoke endpoint with refresh token', async () => {
        mockAxiosInstance.post.mockResolvedValue({ data: {} });

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          revokeUrl: '/oauth/revoke'
        });

        store.getState().setTokens({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          tokenType: 'Bearer'
        });

        const { result } = renderHook(() => useAuth(store));

        await act(async () => {
          await result.current.logout();
        });

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/oauth/revoke', {
          token: 'refresh-token',
          token_type_hint: 'refresh_token'
        });
      });

      it('should send proper token_type_hint for revocation', async () => {
        mockAxiosInstance.post.mockResolvedValue({ data: {} });

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          revokeUrl: '/oauth/revoke'
        });

        store.getState().setTokens({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          tokenType: 'Bearer'
        });

        const { result } = renderHook(() => useAuth(store));

        await act(async () => {
          await result.current.logout();
        });

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/oauth/revoke', 
          expect.objectContaining({
            token_type_hint: 'refresh_token'
          })
        );
      });

      it('should fallback to simple logout when no refresh token', async () => {
        mockAxiosInstance.post.mockResolvedValue({ data: {} });

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          logoutUrl: '/auth/logout'
        });

        store.getState().setTokens({
          accessToken: 'access-token',
          tokenType: 'Bearer'
          // No refresh token
        });

        const { result } = renderHook(() => useAuth(store));

        await act(async () => {
          await result.current.logout();
        });

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/logout');
      });

      it('should fallback to simple logout when revokeUrl not configured', async () => {
        mockAxiosInstance.post.mockResolvedValue({ data: {} });

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          logoutUrl: '/auth/logout'
          // No revokeUrl
        });

        store.getState().setTokens({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          tokenType: 'Bearer'
        });

        const { result } = renderHook(() => useAuth(store));

        await act(async () => {
          await result.current.logout();
        });

        // Since config.revokeUrl is undefined, it should use simple logout
        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/logout');
      });
    });
  });
});