import { useEffect, useCallback } from 'react';
import { AuthStore } from './authStore';
import { createAuthError, AuthErrorCode, AuthError } from './errors';

export function useAuth<U>(store: AuthStore<U>) {
  const { setTokens, setUser, unsetUser, tokens, user, isTokenExpired } = store();
  const config = store.config;

  // OAuth 2.0 refresh token functionality with rotation support
  const refreshTokens = useCallback(async (): Promise<boolean> => {
    if (!tokens?.refreshToken) {
      return false;
    }

    // Check rotation limits
    if (config.tokenRotation.maxRotations &&
        tokens.rotationCount &&
        tokens.rotationCount >= config.tokenRotation.maxRotations) {
      const error = new AuthError(
        AuthErrorCode.REFRESH_FAILED,
        undefined,
        'Maximum token rotation limit reached'
      );
      config.onError?.(error);
      unsetUser();
      setAxiosAuth();
      return false;
    }

    try {
      const response = await config.axios.post(config.tokenUrl, {
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
      });

      const newTokens = config.extractTokens(response.data);

      // Track token rotation
      if (config.tokenRotation.enabled && config.tokenRotation.rotateOnRefresh) {
        const oldToken = tokens.accessToken;
        newTokens.rotationCount = (tokens.rotationCount || 0) + 1;

        setTokens(newTokens);
        setAxiosAuth(newTokens.accessToken, newTokens.tokenType);

        config.onTokenRotated?.(oldToken, newTokens);
      } else {
        setTokens(newTokens);
        setAxiosAuth(newTokens.accessToken, newTokens.tokenType);
      }

      config.onTokenRefresh?.(newTokens);
      return true;
    } catch (error) {
      // Refresh failed, clear tokens
      const authError = createAuthError(error);
      unsetUser();
      setAxiosAuth();
      config.onError?.(authError);
      return false;
    }
  }, [tokens, config, setTokens, unsetUser]);

  // Cookie-based authentication check
  const checkAuth = useCallback(async (): Promise<boolean> => {
    if (!config.cookieAuth?.enabled || !config.authCheckUrl) {
      return false;
    }

    try {
      // Add CSRF token if enabled
      const headers: Record<string, string> = {};
      if (config.cookieAuth.csrf.enabled) {
        const csrfToken = getCookie(config.cookieAuth.csrf.cookieName);
        if (csrfToken) {
          headers[config.cookieAuth.csrf.headerName] = csrfToken;
        }
      }

      const response = await config.axios.get(config.authCheckUrl, { headers });

      if (response.status === 200 && response.data.authenticated) {
        // Cookie is valid, set placeholder tokens
        setTokens({
          accessToken: '__cookie_managed__',
          tokenType: 'Cookie',
        });

        // Extract user from response if extractor provided
        const user = config.extractUser?.(response.data);
        if (user) {
          setUser(user);
        } else if (config.userInfoUrl || config.getUserUrl) {
          // Fall back to fetching user separately
          await getCurrentUser();
        }

        return true;
      }

      return false;
    } catch (error) {
      const authError = createAuthError(error);
      config.onError?.(authError);
      return false;
    }
  }, [config, setTokens, setUser]);

  // Auto-refresh and authentication setup
  useEffect(() => {
    // Cookie mode: Check authentication via auth endpoint
    if (config.cookieAuth?.enabled) {
      if (!user) {
        checkAuth();
      }
      return;
    }

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
      if (!user && (config.userInfoUrl || config.getUserUrl)) {
        getCurrentUser().catch((error) => {
          const authError = createAuthError(error);
          if (authError.code === AuthErrorCode.FORBIDDEN || authError.code === AuthErrorCode.UNAUTHORIZED) {
            unsetUser();
            setAxiosAuth();
          }
          config.onError?.(authError);
        });
      }
    }
  }, [tokens, user, config.autoRefresh, config.refreshThreshold, config.userInfoUrl, config.getUserUrl, config.cookieAuth, isTokenExpired, refreshTokens, unsetUser, checkAuth]);

  const setAxiosAuth = (token?: string, tokenType?: string) => {
    // Cookie mode: Set CSRF header instead of Authorization
    if (config.cookieAuth?.enabled) {
      if (config.cookieAuth.csrf.enabled) {
        const csrfToken = getCookie(config.cookieAuth.csrf.cookieName);
        if (csrfToken) {
          config.axios.defaults.headers.common[config.cookieAuth.csrf.headerName] = csrfToken;
        }
      }
      // Don't set Authorization header in cookie mode
      return;
    }

    // Standard token mode: Set Authorization header
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
      // Add CSRF header for cookie mode
      const headers: Record<string, string> = {};
      if (config.cookieAuth?.enabled && config.cookieAuth.csrf.enabled) {
        const csrfToken = getCookie(config.cookieAuth.csrf.cookieName);
        if (!csrfToken) {
          throw new AuthError(
            AuthErrorCode.CSRF_TOKEN_MISSING,
            undefined,
            'CSRF token not found'
          );
        }
        headers[config.cookieAuth.csrf.headerName] = csrfToken;
      }

      const res = await config.axios.post(config.tokenUrl, credentials, { headers });

      // Cookie mode: Server sets httpOnly cookie, just update user
      if (config.cookieAuth?.enabled) {
        setTokens({
          accessToken: '__cookie_managed__',
          tokenType: 'Cookie',
        });
        setAxiosAuth();
      } else {
        // Standard mode: Extract and store tokens
        const tokens = config.extractTokens(res.data);
        setTokens(tokens);
        setAxiosAuth(tokens.accessToken, tokens.tokenType);
      }

      // Extract user from login response if extractor provided
      const extractedUser = config.extractUser?.(res.data);
      if (extractedUser) {
        setUser(extractedUser);
      } else if (config.userInfoUrl || config.getUserUrl) {
        // Fall back to fetching user separately
        await getCurrentUser();
      }

      if (user) {
        config.onLogin?.(user);
      }
      callback?.();
    } catch (err) {
      const authError = createAuthError(err);
      unsetUser();
      setAxiosAuth();
      config.onError?.(authError);
      throw authError;
    }
  };

  const getCurrentUser = async () => {
    const userUrl = config.userInfoUrl || config.getUserUrl;
    if (!userUrl) return;
    try {
      const res = await config.axios.get<U>(userUrl);
      setUser(res.data);
    } catch (err) {
      const authError = createAuthError(err);
      unsetUser();
      setAxiosAuth();
      config.onError?.(authError);
      throw authError;
    }
  };

  const logout = async () => {
    try {
      // If we have a revoke/logout URL, call it
      const logoutUrl = config.revokeUrl || config.logoutUrl;
      if (logoutUrl) {
        // Add CSRF header for cookie mode
        const headers: Record<string, string> = {};
        if (config.cookieAuth?.enabled && config.cookieAuth.csrf.enabled) {
          const csrfToken = getCookie(config.cookieAuth.csrf.cookieName);
          if (csrfToken) {
            headers[config.cookieAuth.csrf.headerName] = csrfToken;
          }
        }

        if (config.revokeUrl && tokens?.refreshToken && !config.cookieAuth?.enabled) {
          // OAuth revoke (only in standard mode with refresh token)
          await config.axios.post(logoutUrl, {
            token: tokens.refreshToken,
            token_type_hint: 'refresh_token'
          }, { headers });
        } else {
          // Simple logout (cookie mode or no refresh token)
          await config.axios.post(logoutUrl, {}, { headers });
        }
      }
    } catch (err) {
      const authError = createAuthError(err);
      config.onError?.(authError);
    } finally {
      unsetUser();
      setAxiosAuth();
      config.onLogout?.();
    }
  };

  return { login, getCurrentUser, logout, refreshTokens, checkAuth };
}

// Helper function to get cookie value by name
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);

  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }

  return null;
}