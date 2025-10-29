import { create, StoreApi, UseBoundStore } from 'zustand';
import { ValidatedAuthConfig } from './authConfig';

export type AuthState<U> = {
  isAuthenticated: boolean;
  user: U | null;
  token: string;
  setToken: (token: string) => void;
  setUser: (user: U) => void;
  unsetUser: () => void;
};

export type AuthStore<U> = UseBoundStore<StoreApi<AuthState<U>>> & {
  config: ValidatedAuthConfig<U>;
};

export const createAuthStore = <U>(config: ValidatedAuthConfig<U>): AuthStore<U> => {
  const { persistence } = config;
  
  const getStoredToken = (): string => {
    if (!persistence.enabled) return '';
    try {
      return persistence.storage.getItem(persistence.tokenKey) || '';
    } catch {
      return '';
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

  const token = getStoredToken();
  const user = getStoredUser();
  const isAuthenticated = !!token && !!user;

  const store = create<AuthState<U>>((set) => ({
    token,
    user,
    isAuthenticated,

    setToken: (token: string) => {
      set({ token, isAuthenticated: !!token });
      if (persistence.enabled) {
        try {
          persistence.storage.setItem(persistence.tokenKey, token);
        } catch (error) {
          config.onError?.(error);
        }
      }
    },

    setUser: (user: U) => {
      set({ user, isAuthenticated: !!user });
      if (persistence.enabled) {
        try {
          persistence.storage.setItem(persistence.userKey, JSON.stringify(user));
        } catch (error) {
          config.onError?.(error);
        }
      }
    },

    unsetUser: () => {
      set({ user: null, token: '', isAuthenticated: false });
      if (persistence.enabled) {
        try {
          persistence.storage.removeItem(persistence.tokenKey);
          persistence.storage.removeItem(persistence.userKey);
        } catch (error) {
          config.onError?.(error);
        }
      }
    },
  }));

  return Object.assign(store, { config });
};
