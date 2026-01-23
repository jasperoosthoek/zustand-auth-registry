import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../src/useAuth';
import { createAuthRegistry } from '../src/createAuthRegistry';
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
      expect(result.current).toHaveProperty('refresh');
      expect(result.current).toHaveProperty('checkAuth');
      expect(result.current).toHaveProperty('getCurrentUser');
      expect(typeof result.current.login).toBe('function');
      expect(typeof result.current.logout).toBe('function');
      expect(typeof result.current.refresh).toBe('function');
      expect(typeof result.current.checkAuth).toBe('function');
      expect(typeof result.current.getCurrentUser).toBe('function');
    });
  });

  describe('login functionality', () => {
    it('should login successfully and update state', async () => {
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

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/auth/login',
        {
          email: 'test@example.com',
          password: 'password'
        },
        expect.objectContaining({ headers: expect.any(Object) })
      );

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
      mockAxiosInstance.get.mockResolvedValue(mockResponses.userSuccess);

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
        try {
          await result.current.login({ email: 'wrong@example.com', password: 'wrong' });
        } catch (error) {
          // Error is thrown
        }
      });

      expect(onError).toHaveBeenCalled();
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

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/logout', {}, expect.objectContaining({ headers: expect.any(Object) }));

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

      expect(onError).toHaveBeenCalled();

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
        try {
          await result.current.getCurrentUser();
        } catch (error) {
          // Error is thrown
        }
      });

      expect(onError).toHaveBeenCalled();
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
        axios: mockAxiosInstance,
        persistence: { enabled: true }
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
        axios: mockAxiosInstance,
        persistence: { enabled: true }
      });

      renderHook(() => useAuth(store));

      // Wait for useEffect to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/auth/me');
    });
  });

  describe('token refresh functionality', () => {
    it('should return false when no refreshUrl configured', async () => {
      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance
        // No refreshUrl
      });

      const { result } = renderHook(() => useAuth(store));

      let refreshResult: boolean;
      await act(async () => {
        refreshResult = await result.current.refresh();
      });

      expect(refreshResult!).toBe(false);
      expect(mockAxiosInstance.post).not.toHaveBeenCalled();
    });

    it('should return false when no refresh token available (token mode)', async () => {
      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance,
        refreshUrl: '/auth/refresh'
      });

      // Set tokens without refresh token
      store.getState().setTokens({
        accessToken: 'current-token',
        tokenType: 'Bearer'
      });

      const { result } = renderHook(() => useAuth(store));

      let refreshResult: boolean;
      await act(async () => {
        refreshResult = await result.current.refresh();
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
        refreshUrl: '/auth/refresh'
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
        refreshResult = await result.current.refresh();
      });

      expect(refreshResult!).toBe(true);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/refresh', {
        refresh_token: 'old-refresh-token'
      });

      const state = store.getState();
      expect(state.tokens?.accessToken).toBe('new-access-token');
      expect(state.tokens?.refreshToken).toBe('new-refresh-token');
    });

    it('should handle refresh failure and clear state', async () => {
      const refreshError = new Error('Refresh failed');
      mockAxiosInstance.post.mockRejectedValue(refreshError);

      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance,
        refreshUrl: '/auth/refresh'
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
        refreshResult = await result.current.refresh();
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
        refreshUrl: '/auth/refresh',
        onError
      });

      store.getState().setTokens({
        accessToken: 'old-token',
        refreshToken: 'old-refresh',
        tokenType: 'Bearer'
      });

      const { result } = renderHook(() => useAuth(store));

      await act(async () => {
        await result.current.refresh();
      });

      expect(onError).toHaveBeenCalled();
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
        refreshUrl: '/auth/refresh',
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
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/refresh', {
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
        refreshUrl: '/auth/refresh',
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

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/refresh', {
        refresh_token: 'valid-refresh'
      });

      setTimeoutSpy.mockRestore();
    });

    it('should cleanup timers when component unmounts', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const store = getAuthStore('main', {
        ...testConfigs.basic,
        axios: mockAxiosInstance,
        refreshUrl: '/auth/refresh',
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
  });

  describe('Cookie Authentication', () => {
    beforeEach(() => {
      resetAllMocks();
      mockAxiosInstance = createMockAxios();

      // Mock document.cookie
      Object.defineProperty(document, 'cookie', {
        writable: true,
        configurable: true,
        value: 'csrftoken=abc123; sessionid=xyz789'
      });
    });

    afterEach(() => {
      // Clean up
      Object.defineProperty(document, 'cookie', {
        writable: true,
        configurable: true,
        value: ''
      });
    });

    describe('checkAuth', () => {
      it('should validate cookie auth successfully', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          status: 200,
          data: {
            authenticated: true,
            user: { id: 1, email: 'test@example.com', name: 'Test User' }
          }
        });

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          extractUser: 'user',
          cookieAuth: {
            enabled: true,
            csrf: {
              enabled: false
            }
          },
          authCheckUrl: '/auth/check'
        });

        const { result } = renderHook(() => useAuth(store));

        let checkResult: boolean | undefined;
        await act(async () => {
          checkResult = await result.current.checkAuth();
        });

        expect(checkResult).toBe(true);
        expect(store.getState().isAuthenticated).toBe(true);
        expect(store.getState().tokens).toBeNull();  // Cookie mode: no client-side tokens
        expect(store.getState().user).toEqual({ id: 1, email: 'test@example.com', name: 'Test User' });
      });

      it('should include CSRF token in headers when enabled', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          status: 200,
          data: { authenticated: true }
        });

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          cookieAuth: {
            enabled: true,
            csrf: {
              enabled: true,
              headerName: 'X-CSRFToken',
              cookieName: 'csrftoken'
            }
          },
          authCheckUrl: '/auth/check'
        });

        const { result } = renderHook(() => useAuth(store));

        await act(async () => {
          await result.current.checkAuth();
        });

        expect(mockAxiosInstance.get).toHaveBeenCalledWith(
          '/auth/check',
          expect.objectContaining({
            headers: {
              'X-CSRFToken': 'abc123'
            }
          })
        );
      });

      it('should return false when not authenticated', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          status: 200,
          data: { authenticated: false }
        });

        const { result } = renderHook(() => useAuth(getAuthStore('main', {
          ...testConfigs.withoutGetUser,
          axios: mockAxiosInstance,
          cookieAuth: {
            enabled: true,
            csrf: { enabled: false }
          },
          authCheckUrl: '/auth/check'
        })));

        let checkResult: boolean | undefined;
        await act(async () => {
          checkResult = await result.current.checkAuth();
        });

        expect(checkResult).toBe(false);
      });

      it('should handle checkAuth errors gracefully', async () => {
        const onError = jest.fn();
        mockAxiosInstance.get.mockRejectedValue(createAxiosError('Network error', 500));

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          cookieAuth: {
            enabled: true,
            csrf: { enabled: false }
          },
          authCheckUrl: '/auth/check',
          onError
        });

        const { result } = renderHook(() => useAuth(store));

        let checkResult: boolean | undefined;
        await act(async () => {
          checkResult = await result.current.checkAuth();
        });

        expect(checkResult).toBe(false);
        expect(onError).toHaveBeenCalled();
      });

      it('should return false when cookie auth is disabled', async () => {
        const store = getAuthStore('main', {
          ...testConfigs.withoutGetUser,
          axios: mockAxiosInstance,
          authCheckUrl: '/auth/check'
          // No cookieAuth
        });

        const { result } = renderHook(() => useAuth(store));

        let checkResult: boolean | undefined;
        await act(async () => {
          checkResult = await result.current.checkAuth();
        });

        expect(checkResult).toBe(false);
        expect(mockAxiosInstance.get).not.toHaveBeenCalled();
      });

      it('should return false when authCheckUrl is not provided', async () => {
        const store = getAuthStore('main', {
          ...testConfigs.withoutGetUser,
          axios: mockAxiosInstance,
          cookieAuth: {
            enabled: true,
            csrf: { enabled: false }
          }
          // No authCheckUrl
        });

        const { result } = renderHook(() => useAuth(store));

        let checkResult: boolean | undefined;
        await act(async () => {
          checkResult = await result.current.checkAuth();
        });

        expect(checkResult).toBe(false);
        expect(mockAxiosInstance.get).not.toHaveBeenCalled();
      });
    });

    describe('cookie mode login', () => {
      it('should login with cookie mode', async () => {
        mockAxiosInstance.post.mockResolvedValue({
          data: { success: true }
        });
        mockAxiosInstance.get.mockResolvedValue({
          data: mockUser
        });

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          cookieAuth: {
            enabled: true,
            csrf: {
              enabled: true,
              headerName: 'X-CSRFToken',
              cookieName: 'csrftoken'
            }
          }
        });

        const { result } = renderHook(() => useAuth(store));

        await act(async () => {
          await result.current.login({ username: 'test', password: 'pass' });
        });

        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          '/auth/login',
          { username: 'test', password: 'pass' },
          expect.objectContaining({
            headers: { 'X-CSRFToken': 'abc123' }
          })
        );

        expect(store.getState().isAuthenticated).toBe(true);
        expect(store.getState().tokens).toBeNull();  // Cookie mode: no client-side tokens
      });
    });

    describe('cookie mode logout', () => {
      it('should include CSRF token in logout for cookie mode', async () => {
        mockAxiosInstance.post.mockResolvedValue({ data: {} });

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          logoutUrl: '/auth/logout',
          cookieAuth: {
            enabled: true,
            csrf: {
              enabled: true,
              headerName: 'X-CSRFToken',
              cookieName: 'csrftoken'
            }
          }
        });

        store.getState().setAuthenticated(true);

        const { result } = renderHook(() => useAuth(store));

        await act(async () => {
          await result.current.logout();
        });

        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          '/auth/logout',
          {},
          expect.objectContaining({
            headers: { 'X-CSRFToken': 'abc123' }
          })
        );
      });
    });

    describe('cookie mode refresh', () => {
      it('should refresh in cookie mode by calling refresh endpoint', async () => {
        mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

        const store = getAuthStore('main', {
          ...testConfigs.basic,
          axios: mockAxiosInstance,
          refreshUrl: '/auth/refresh',
          cookieAuth: {
            enabled: true,
            csrf: {
              enabled: true,
              headerName: 'X-CSRFToken',
              cookieName: 'csrftoken'
            }
          }
        });

        store.getState().setAuthenticated(true);

        const { result } = renderHook(() => useAuth(store));

        let refreshResult: boolean;
        await act(async () => {
          refreshResult = await result.current.refresh();
        });

        expect(refreshResult!).toBe(true);
        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          '/auth/refresh',
          {},
          expect.objectContaining({
            headers: { 'X-CSRFToken': 'abc123' }
          })
        );
      });
    });
  });
});
