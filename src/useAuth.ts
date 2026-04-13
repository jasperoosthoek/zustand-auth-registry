import { useEffect, useCallback } from 'react';
import { AuthStore } from './authStore';

// Promise deduplication: prevents multiple concurrent checkAuth calls per store
const pendingCheckAuth = new WeakMap<AuthStore<any>, Promise<boolean>>();

export function useAuth<D>(store: AuthStore<D>) {
  const { setTokens, setAuthenticated, setData, reset, tokens, data, isAuthenticated, isTokenExpired } = store();
  const config = store.config;

  // Set axios Authorization header (token mode only)
  // Note: CSRF is handled by interceptor in authStore.ts
  const setAxiosAuth = useCallback((token?: string, tokenType?: string) => {
    if (config.cookieAuth?.enabled) {
      // Cookie mode: CSRF handled by interceptor, no Authorization header needed
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
      reset();
      setAxiosAuth();
      config.onError?.(error);
      return false;
    }
  }, [tokens, config, setTokens, reset, setAxiosAuth]);

  // Check authentication (cookie mode) - with promise deduplication
  const checkAuth = useCallback(async (): Promise<boolean> => {
    const authCheckUrl = config.authCheckUrl;
    if (!config.cookieAuth?.enabled || !authCheckUrl) {
      return false;
    }

    // Return existing promise if check is already in progress
    const pending = pendingCheckAuth.get(store);
    if (pending) {
      return pending;
    }

    const doCheck = async (): Promise<boolean> => {
      try {
        const headers = getCsrfHeaders(config);
        const response = await config.axios.get(authCheckUrl, { headers });

        if (response.data.authenticated) {
          setAuthenticated(true);

          const extractedData = config.extractData?.(response.data);
          if (extractedData) {
            setData(extractedData);
          } else if (config.dataUrl) {
            await fetchData();
          }

          return true;
        }

        reset();
        return false;
      } catch (error) {
        reset();
        config.onError?.(error);
        return false;
      } finally {
        pendingCheckAuth.delete(store);
      }
    };

    const promise = doCheck();
    pendingCheckAuth.set(store, promise);
    return promise;
  }, [store, config, setAuthenticated, setData]);

  // Fetch data from dataUrl
  const fetchData = useCallback(async () => {
    if (!config.dataUrl) return;

    try {
      const res = await config.axios.get<D>(config.dataUrl);
      setData(res.data);
    } catch (error) {
      reset();
      setAxiosAuth();
      config.onError?.(error);
      throw error;
    }
  }, [config, setData, reset, setAxiosAuth]);

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

      // Extract data from response
      const extractedData = config.extractData?.(res.data);
      if (extractedData) {
        setData(extractedData);
        config.onLogin?.(extractedData);
      } else if (config.dataUrl) {
        await fetchData();
        const currentData = store.getState().data;
        if (currentData) config.onLogin?.(currentData);
      }

      callback?.();
    } catch (error) {
      reset();
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
      reset();
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
          reset();
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

      // Fetch data if missing
      if (!data && config.dataUrl) {
        fetchData().catch(() => {});
      }
    }
  }, [tokens, data, isAuthenticated, config, isTokenExpired, refresh, checkAuth, fetchData, setAxiosAuth, reset]);

  return { login, logout, refresh, checkAuth, fetchData };
}

// Helper: Get CSRF headers if enabled (uses getToken from config)
function getCsrfHeaders(config: any): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config.cookieAuth?.csrf?.enabled) {
    const csrfToken = config.cookieAuth.csrf.getToken();
    if (csrfToken) {
      headers[config.cookieAuth.csrf.headerName] = csrfToken;
    }
  }
  return headers;
}
