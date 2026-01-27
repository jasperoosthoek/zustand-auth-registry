import { create, StoreApi, UseBoundStore } from 'zustand';
import { ValidatedAuthConfig, TokenData } from './authConfig';

export type AuthState<U> = {
  isAuthenticated: boolean | null;  // null = not checked yet (cookie mode)
  user: U | null;
  tokens: TokenData | null;  // null in cookie mode or when logged out

  // Methods
  setTokens: (tokens: TokenData) => void;
  setBearerToken: (token: string) => void;  // Convenience for simple Bearer token auth
  setAuthenticated: (authenticated: boolean) => void;  // For cookie mode
  setUser: (user: U) => void;
  unsetUser: () => void;
  isTokenExpired: () => boolean;
};

export type AuthStore<U> = UseBoundStore<StoreApi<AuthState<U>>> & {
  config: ValidatedAuthConfig<U>;
};

export const createAuthStore = <U>(config: ValidatedAuthConfig<U>): AuthStore<U> => {
  const { persistence, cookieAuth } = config;

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

  const getStoredUser = (): U | null => {
    if (!persistence.enabled) return null;
    try {
      const userString = persistence.storage.getItem(persistence.userKey);
      return userString ? (JSON.parse(userString) as U) : null;
    } catch {
      return null;
    }
  };

  const initialTokens = getStoredTokens();
  const initialUser = getStoredUser();

  // Cookie mode: null (unknown until checkAuth)
  // Token mode: true/false based on token presence
  const initialIsAuthenticated = cookieAuth?.enabled
    ? null
    : !!initialTokens?.accessToken;

  const store = create<AuthState<U>>((set, get) => ({
    tokens: initialTokens,
    user: initialUser,
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

    setUser: (user: U) => {
      set({ user });

      if (persistence.enabled) {
        try {
          persistence.storage.setItem(persistence.userKey, JSON.stringify(user));
        } catch (error) {
          config.onError?.(error);
        }
      }
    },

    unsetUser: () => {
      set({ user: null, tokens: null, isAuthenticated: false });

      if (persistence.enabled) {
        try {
          persistence.storage.removeItem(persistence.tokenKey);
          persistence.storage.removeItem(persistence.refreshTokenKey);
          persistence.storage.removeItem(persistence.userKey);
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
