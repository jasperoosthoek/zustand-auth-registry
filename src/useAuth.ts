import { useEffect, useCallback } from 'react';
import { AuthStore } from './authStore';

export function useAuth<U>(store: AuthStore<U>) {
  const { setTokens, setAuthenticated, setUser, unsetUser, tokens, user, isAuthenticated, isTokenExpired } = store();
  const config = store.config;

  // Set axios Authorization header (token mode only)
  const setAxiosAuth = useCallback((token?: string, tokenType?: string) => {
    if (config.cookieAuth?.enabled) {
      // Cookie mode: CSRF header if enabled, no Authorization header
      if (config.cookieAuth.csrf.enabled) {
        const csrfToken = getCookie(config.cookieAuth.csrf.cookieName);
        if (csrfToken) {
          config.axios.defaults.headers.common[config.cookieAuth.csrf.headerName] = csrfToken;
        }
      }
      return;
    }

    // Token mode: Set Authorization header
    if (token) {
      config.axios.defaults.headers.common['Authorization'] = config.formatAuthHeader(token, tokenType);
    } else {
      delete config.axios.defaults.headers.common['Authorization'];
    }
  }, [config]);

  // Refresh tokens
  const refresh = useCallback(async (): Promise<boolean> => {
    if (!config.refreshUrl) return false;

    try {
      // Cookie mode: Just call refresh endpoint, server handles cookie
      if (config.cookieAuth?.enabled) {
        const headers = getCsrfHeaders(config);
        await config.axios.post(config.refreshUrl, {}, { headers });
        return true;
      }

      // Token mode: Send refresh token, get new tokens
      if (!tokens?.refreshToken) return false;

      const response = await config.axios.post(config.refreshUrl, {
        refresh_token: tokens.refreshToken,
      });

      const newTokens = config.extractTokens(response.data);
      setTokens(newTokens);
      setAxiosAuth(newTokens.accessToken, newTokens.tokenType);
      return true;
    } catch (error) {
      unsetUser();
      setAxiosAuth();
      config.onError?.(error);
      return false;
    }
  }, [tokens, config, setTokens, unsetUser, setAxiosAuth]);

  // Check authentication (cookie mode)
  const checkAuth = useCallback(async (): Promise<boolean> => {
    if (!config.cookieAuth?.enabled || !config.authCheckUrl) {
      return false;
    }

    try {
      const headers = getCsrfHeaders(config);
      const response = await config.axios.get(config.authCheckUrl, { headers });

      if (response.data.authenticated) {
        setAuthenticated(true);

        const extractedUser = config.extractUser?.(response.data);
        if (extractedUser) {
          setUser(extractedUser);
        } else if (config.getUserUrl) {
          await getCurrentUser();
        }

        return true;
      }

      setAuthenticated(false);
      return false;
    } catch (error) {
      setAuthenticated(false);
      config.onError?.(error);
      return false;
    }
  }, [config, setAuthenticated, setUser]);

  // Get current user
  const getCurrentUser = useCallback(async () => {
    if (!config.getUserUrl) return;

    try {
      const res = await config.axios.get<U>(config.getUserUrl);
      setUser(res.data);
    } catch (error) {
      unsetUser();
      setAxiosAuth();
      config.onError?.(error);
      throw error;
    }
  }, [config, setUser, unsetUser, setAxiosAuth]);

  // Login
  const login = async (credentials: Record<string, string>, callback?: () => void) => {
    try {
      const headers = config.cookieAuth?.enabled ? getCsrfHeaders(config) : {};
      const res = await config.axios.post(config.loginUrl, credentials, { headers });

      if (config.cookieAuth?.enabled) {
        // Cookie mode: Server sets httpOnly cookie, just mark as authenticated
        setAuthenticated(true);
      } else {
        // Token mode: Extract and store tokens
        const newTokens = config.extractTokens(res.data);
        setTokens(newTokens);
        setAxiosAuth(newTokens.accessToken, newTokens.tokenType);
      }

      // Extract user from response
      const extractedUser = config.extractUser?.(res.data);
      if (extractedUser) {
        setUser(extractedUser);
        config.onLogin?.(extractedUser);
      } else if (config.getUserUrl) {
        await getCurrentUser();
        const currentUser = store.getState().user;
        if (currentUser) config.onLogin?.(currentUser);
      }

      callback?.();
    } catch (error) {
      unsetUser();
      setAxiosAuth();
      config.onError?.(error);
      throw error;
    }
  };

  // Logout
  const logout = async () => {
    try {
      if (config.logoutUrl) {
        const headers = config.cookieAuth?.enabled ? getCsrfHeaders(config) : {};
        await config.axios.post(config.logoutUrl, {}, { headers });
      }
    } catch (error) {
      config.onError?.(error);
    } finally {
      unsetUser();
      setAxiosAuth();
      config.onLogout?.();
    }
  };

  // Auto-setup on mount
  useEffect(() => {
    // Cookie mode: Check authentication if not yet determined
    if (config.cookieAuth?.enabled) {
      if (isAuthenticated === null) {
        checkAuth();
      }
      return;
    }

    // Token mode: Setup headers and auto-refresh
    if (tokens?.accessToken) {
      setAxiosAuth(tokens.accessToken, tokens.tokenType);

      // Check if expired
      if (isTokenExpired()) {
        if (tokens.refreshToken && config.autoRefresh) {
          refresh();
        } else {
          unsetUser();
        }
        return;
      }

      // Setup auto-refresh timer
      if (tokens.expiresAt && tokens.refreshToken && config.autoRefresh) {
        const timeUntilExpiry = tokens.expiresAt - Date.now();
        const refreshTime = Math.max(timeUntilExpiry - config.refreshThreshold, 0);

        const timer = setTimeout(refresh, refreshTime);
        return () => clearTimeout(timer);
      }

      // Fetch user if missing
      if (!user && config.getUserUrl) {
        getCurrentUser().catch(() => {});
      }
    }
  }, [tokens, user, isAuthenticated, config, isTokenExpired, refresh, checkAuth, getCurrentUser, setAxiosAuth, unsetUser]);

  return { login, logout, refresh, checkAuth, getCurrentUser };
}

// Helper: Get cookie value
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : null;
}

// Helper: Get CSRF headers if enabled
function getCsrfHeaders(config: any): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config.cookieAuth?.csrf?.enabled) {
    const csrfToken = getCookie(config.cookieAuth.csrf.cookieName);
    if (csrfToken) {
      headers[config.cookieAuth.csrf.headerName] = csrfToken;
    }
  }
  return headers;
}
