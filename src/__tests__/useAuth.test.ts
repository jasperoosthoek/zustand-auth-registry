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
});