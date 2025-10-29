import { AxiosInstance } from 'axios';

export type AuthConfig<U> = {
  axios: AxiosInstance;
  loginUrl: string;
  logoutUrl: string;
  extractToken: (data: any) => string;
  getUserUrl?: string;
  formatAuthHeader?: (token: string) => string;
  persistence?: {
    enabled?: boolean;
    storage?: Storage;
    tokenKey?: string;
    userKey?: string;
  };
  onError?: (error: any) => void;
  onLogin?: (user: U) => void;
  onLogout?: () => void;
};

export type ValidatedAuthConfig<U> = {
  axios: AxiosInstance;
  loginUrl: string;
  logoutUrl: string;
  extractToken: (data: any) => string;
  getUserUrl?: string;
  formatAuthHeader: (token: string) => string;
  persistence: {
    enabled: boolean;
    storage: Storage;
    tokenKey: string;
    userKey: string;
  };
  onError?: (error: any) => void;
  onLogin?: (user: U) => void;
  onLogout?: () => void;
};

export const validateAuthConfig = <U>(config: AuthConfig<U>): ValidatedAuthConfig<U> => {
  if (!config.axios) {
    throw new Error('AuthConfig: axios instance is required');
  }
  if (!config.loginUrl) {
    throw new Error('AuthConfig: loginUrl is required');
  }
  if (!config.logoutUrl) {
    throw new Error('AuthConfig: logoutUrl is required');
  }
  if (!config.extractToken) {
    throw new Error('AuthConfig: extractToken function is required');
  }

  const defaultPersistence = {
    enabled: true,
    storage: typeof window !== 'undefined' && window.localStorage ? window.localStorage : ({} as Storage),
    tokenKey: 'token',
    userKey: 'user',
  };

  return {
    ...config,
    formatAuthHeader: config.formatAuthHeader || ((token: string) => `Bearer ${token}`),
    persistence: {
      ...defaultPersistence,
      ...config.persistence,
    },
  };
};