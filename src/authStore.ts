import { create, StoreApi, UseBoundStore } from 'zustand';
import { ValidatedAuthConfig, TokenData } from './authConfig';

export type AuthState<D> = {
  isAuthenticated: boolean | null;  // null = not checked yet (cookie mode)
  data: D | null;
  tokens: TokenData | null;  // null in cookie mode or when logged out

  // Methods
  setTokens: (tokens: TokenData) => void;
  setBearerToken: (token: string) => void;  // Convenience for simple Bearer token auth
  setAuthenticated: (authenticated: boolean) => void;  // For cookie mode
  setData: (data: D) => void;
  reset: () => void;
  isTokenExpired: () => boolean;
};

export type AuthStore<D> = UseBoundStore<StoreApi<AuthState<D>>> & {
  config: ValidatedAuthConfig<D>;
};

// Methods that modify state (require CSRF protection)
const CSRF_METHODS = ['post', 'put', 'patch', 'delete'];

const setupCsrfInterceptor = <D>(config: ValidatedAuthConfig<D>): number | null => {
  if (!config.cookieAuth?.csrf.enabled) {
    return null;
  }

  const { headerName, getToken } = config.cookieAuth.csrf;

  return config.axios.interceptors.request.use((requestConfig) => {
    const method = requestConfig.method?.toLowerCase();
    if (method && CSRF_METHODS.includes(method)) {
      const csrfToken = getToken();
      if (csrfToken) {
        requestConfig.headers[headerName] = csrfToken;
      }
    }
    return requestConfig;
  });
};

export const createAuthStore = <D>(config: ValidatedAuthConfig<D>): AuthStore<D> => {
  const { persistence, cookieAuth } = config;

  // Set up CSRF interceptor if enabled
  setupCsrfInterceptor(config);

  const getStoredTokens = (): TokenData | null => {
    // Cookie mode: No client-side tokens
    if (cookieAuth?.enabled) {
      return null;
    }

    // Token mode: Read from storage
    if (!persistence.enabled) return null;
    try {
      const accessToken = persistence.storage.getItem(persistence.tokenKey);
      if (!accessToken) return null;

      const refreshToken = persistence.storage.getItem(persistence.refreshTokenKey);
      const expiryString = persistence.storage.getItem(persistence.expiryKey);
      const expiresAt = expiryString ? parseInt(expiryString, 10) : undefined;

      return {
        accessToken,
        refreshToken: refreshToken || undefined,
        expiresAt: expiresAt && !isNaN(expiresAt) ? expiresAt : undefined,
        tokenType: 'Bearer',
      };
    } catch {
      return null;
    }
  };

  const getStoredData = (): D | null => {
    if (!persistence.enabled) return null;
    try {
      const dataString = persistence.storage.getItem(persistence.dataKey);
      return dataString ? (JSON.parse(dataString) as D) : null;
    } catch {
      return null;
    }
  };

  const initialTokens = getStoredTokens();
  const initialData = getStoredData();

  // Cookie mode: null (unknown until checkAuth)
  // Token mode: true/false based on token presence
  const initialIsAuthenticated = cookieAuth?.enabled
    ? null
    : !!initialTokens?.accessToken;

  const store = create<AuthState<D>>((set, get) => ({
    tokens: initialTokens,
    data: initialData,
    isAuthenticated: initialIsAuthenticated,

    setTokens: (tokens: TokenData) => {
      set({ tokens, isAuthenticated: true });

      // Cookie mode: No localStorage persistence for tokens
      if (cookieAuth?.enabled) {
        return;
      }

      // Token mode: Persist to storage
      if (persistence.enabled) {
        try {
          persistence.storage.setItem(persistence.tokenKey, tokens.accessToken);

          if (tokens.refreshToken) {
            persistence.storage.setItem(persistence.refreshTokenKey, tokens.refreshToken);
          } else {
            persistence.storage.removeItem(persistence.refreshTokenKey);
          }

          if (tokens.expiresAt) {
            persistence.storage.setItem(persistence.expiryKey, tokens.expiresAt.toString());
          } else {
            persistence.storage.removeItem(persistence.expiryKey);
          }
        } catch (error) {
          config.onError?.(error);
        }
      }
    },

    setBearerToken: (token: string) => {
      get().setTokens({ accessToken: token, tokenType: 'Bearer' });
    },

    setAuthenticated: (authenticated: boolean) => {
      set({ isAuthenticated: authenticated });
    },

    setData: (data: D) => {
      set({ data });

      if (persistence.enabled) {
        try {
          persistence.storage.setItem(persistence.dataKey, JSON.stringify(data));
        } catch (error) {
          config.onError?.(error);
        }
      }
    },

    reset: () => {
      set({ data: null, tokens: null, isAuthenticated: false });

      if (persistence.enabled) {
        try {
          persistence.storage.removeItem(persistence.tokenKey);
          persistence.storage.removeItem(persistence.refreshTokenKey);
          persistence.storage.removeItem(persistence.dataKey);
          persistence.storage.removeItem(persistence.expiryKey);
        } catch (error) {
          config.onError?.(error);
        }
      }
    },

    isTokenExpired: () => {
      const tokens = get().tokens;
      if (!tokens?.expiresAt) return false;
      return Date.now() >= tokens.expiresAt;
    },
  }));

  return Object.assign(store, { config });
};
