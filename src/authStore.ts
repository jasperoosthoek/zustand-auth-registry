import { create, StoreApi, UseBoundStore } from 'zustand';
import { ValidatedAuthConfig, TokenData } from './authConfig';

export type AuthState<U> = {
  isAuthenticated: boolean;
  user: U | null;
  tokens: TokenData | null;
  
  // OAuth 2.0 methods
  setTokens: (tokens: TokenData) => void;
  setUser: (user: U) => void;
  unsetUser: () => void;
  isTokenExpired: () => boolean;
  
  // Backward compatibility
  token: string;
  setToken: (token: string) => void;
};

export type AuthStore<U> = UseBoundStore<StoreApi<AuthState<U>>> & {
  config: ValidatedAuthConfig<U>;
};

export const createAuthStore = <U>(config: ValidatedAuthConfig<U>): AuthStore<U> => {
  const { persistence } = config;
  
  const getStoredTokens = (): TokenData | null => {
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
        tokenType: 'Bearer', // Default, will be updated on setTokens
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
  const initialIsAuthenticated = !!initialTokens?.accessToken;

  const store = create<AuthState<U>>((set, get) => ({
    tokens: initialTokens,
    user: initialUser,
    isAuthenticated: initialIsAuthenticated,

    // OAuth 2.0 methods
    setTokens: (tokens: TokenData) => {
      const user = get().user;
      const isAuthenticated = !!tokens.accessToken;
      
      set({ tokens, isAuthenticated, token: tokens.accessToken });
      
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

    setUser: (user: U) => {
      const tokens = get().tokens;
      const isAuthenticated = !!tokens?.accessToken;
      
      set({ user, isAuthenticated });
      
      if (persistence.enabled) {
        try {
          persistence.storage.setItem(persistence.userKey, JSON.stringify(user));
        } catch (error) {
          config.onError?.(error);
        }
      }
    },

    unsetUser: () => {
      set({ user: null, tokens: null, isAuthenticated: false, token: '' });
      
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
      if (!tokens?.expiresAt) return false; // No expiry info means no expiration
      return Date.now() >= tokens.expiresAt;
    },

    // Backward compatibility - computed property
    token: initialTokens?.accessToken || '',

    setToken: (token: string) => {
      const currentTokens = get().tokens;
      const user = get().user;
      const newTokens: TokenData = {
        accessToken: token,
        refreshToken: currentTokens?.refreshToken,
        expiresAt: currentTokens?.expiresAt,
        tokenType: currentTokens?.tokenType || 'Bearer', // Standard default
        scope: currentTokens?.scope,
      };
      
      const isAuthenticated = !!token;
      set({ tokens: newTokens, token, isAuthenticated });
      
      // Handle persistence
      if (persistence.enabled) {
        try {
          persistence.storage.setItem(persistence.tokenKey, token);
        } catch (error) {
          config.onError?.(error);
        }
      }
    },
  }));

  return Object.assign(store, { config });
};
