import { useEffect, useCallback } from 'react';
import axios from 'axios';
import { AuthStore } from './authStore';
import { TokenData } from './authConfig';

export function useAuth<U>(store: AuthStore<U>) {
  const { setTokens, setUser, unsetUser, tokens, user, isTokenExpired } = store();
  const config = store.config;

  // Backward compatibility
  const { setToken, token } = store();

  // OAuth 2.0 refresh token functionality
  const refreshTokens = useCallback(async (): Promise<boolean> => {
    if (!tokens?.refreshToken) {
      return false;
    }

    try {
      const response = await config.axios.post(config.tokenUrl, {
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
      });

      const newTokens = config.extractTokens(response.data);
      setTokens(newTokens);
      setAxiosAuth(newTokens.accessToken, newTokens.tokenType);
      
      config.onTokenRefresh?.(newTokens);
      return true;
    } catch (error) {
      // Refresh failed, clear tokens
      unsetUser();
      setAxiosAuth();
      config.onError?.(error);
      return false;
    }
  }, [tokens?.refreshToken, config, setTokens, unsetUser]);

  // Auto-refresh and authentication setup
  useEffect(() => {
    // Handle current tokens
    if (tokens?.accessToken) {
      // Set axios headers immediately
      setAxiosAuth(tokens.accessToken, tokens.tokenType);

      // Check if token is expired or about to expire
      if (isTokenExpired()) {
        // Token is already expired, try to refresh
        if (tokens.refreshToken && config.autoRefresh) {
          refreshTokens();
        } else {
          unsetUser();
        }
        return;
      }

      // Set up auto-refresh timer if we have expiry info
      if (tokens.expiresAt && tokens.refreshToken && config.autoRefresh) {
        const timeUntilExpiry = tokens.expiresAt - Date.now();
        const refreshTime = Math.max(timeUntilExpiry - config.refreshThreshold, 0);

        const timer = setTimeout(() => {
          refreshTokens();
        }, refreshTime);

        return () => clearTimeout(timer);
      }

      // Try to get user info if missing
      try {
        if (!user && (config.userInfoUrl || config.getUserUrl)) {
          getCurrentUser();
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 403) {
          unsetUser();
          setAxiosAuth();
        }
        config.onError?.(error);
      }
    }
  }, [tokens, user, config.autoRefresh, config.refreshThreshold, config.userInfoUrl, config.getUserUrl, isTokenExpired, refreshTokens, unsetUser]);

  const setAxiosAuth = (token?: string, tokenType?: string) => {
    if (typeof token !== 'undefined' && token) {
      config.axios.defaults.headers.common['Authorization'] = config.formatAuthHeader(token, tokenType);
    } else {
      delete config.axios.defaults.headers.common['Authorization'];
    }
  };

  const login = async (
    credentials: Record<string, string>,
    callback?: () => void
  ) => {
    try {
      const res = await config.axios.post(config.tokenUrl, credentials);
      const tokens = config.extractTokens(res.data);
      setTokens(tokens);
      setAxiosAuth(tokens.accessToken, tokens.tokenType);
      
      if (config.userInfoUrl || config.getUserUrl) {
        await getCurrentUser();
      }
      
      if (user) {
        config.onLogin?.(user);
      }
      callback?.();
    } catch (err) {
      unsetUser();
      setAxiosAuth();
      config.onError?.(err);
    }
  };

  const getCurrentUser = async () => {
    const userUrl = config.userInfoUrl || config.getUserUrl;
    if (!userUrl) return;
    try {
      const res = await config.axios.get<U>(userUrl);
      setUser(res.data);
    } catch (err) {
      unsetUser();
      setAxiosAuth();
      config.onError?.(err);
    }
  };

  const logout = async () => {
    try {
      // If we have a revoke/logout URL, call it
      const logoutUrl = config.revokeUrl || config.logoutUrl;
      if (logoutUrl) {
        if (config.revokeUrl && tokens?.refreshToken) {
          // OAuth revoke
          await config.axios.post(logoutUrl, {
            token: tokens.refreshToken,
            token_type_hint: 'refresh_token'
          });
        } else {
          // Simple logout
          await config.axios.post(logoutUrl);
        }
      }
    } catch (err) {
      config.onError?.(err);
    } finally {
      unsetUser();
      setAxiosAuth();
      config.onLogout?.();
    }
  };

  return { login, getCurrentUser, logout, refreshTokens };
}