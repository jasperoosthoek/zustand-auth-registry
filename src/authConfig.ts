import { AxiosInstance } from 'axios';

// Token data structure
export type TokenData = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
};

export type AuthConfig<D> = {
  axios: AxiosInstance;

  // Endpoints
  loginUrl: string;
  logoutUrl?: string;
  refreshUrl?: string;
  dataUrl?: string;
  authCheckUrl?: string;  // For cookie auth verification

  // Token extraction from login response
  extractTokens?: (data: any) => TokenData;

  // Data extraction from responses (login, checkAuth)
  // Can be a function or a string key (e.g., "user" extracts data.user)
  extractData?: ((data: any) => D | null) | string;

  // Auth header format (default: "Bearer {token}")
  formatAuthHeader?: (token: string, tokenType?: string) => string;

  // Auto-refresh settings
  autoRefresh?: boolean;
  refreshThreshold?: number; // ms before expiry to refresh (default: 5 min)

  // Cookie-based authentication (alternative to localStorage)
  cookieAuth?: {
    enabled: boolean;
    csrf?: {
      enabled: boolean;
      headerName?: string;  // Default: 'X-CSRFToken'
      // Option 1: Provide cookie name (web only, uses document.cookie)
      cookieName?: string;  // Default: 'csrftoken'
      // Option 2: Provide custom token getter (platform-agnostic)
      getToken?: () => string | null;
    };
  };

  // Token persistence (localStorage)
  persistence?: {
    enabled: boolean;
    storage?: Storage;
    tokenKey?: string;
    refreshTokenKey?: string;
    dataKey?: string;
    expiryKey?: string;
  };

  // Callbacks
  onError?: (error: any) => void;
  onLogin?: (data: D) => void;
  onLogout?: () => void;
};

export type ValidatedAuthConfig<D> = {
  axios: AxiosInstance;

  // Endpoints
  loginUrl: string;
  logoutUrl?: string;
  refreshUrl?: string;
  dataUrl?: string;
  authCheckUrl?: string;

  // Extraction functions
  extractTokens: (data: any) => TokenData;
  extractData?: (data: any) => D | null;

  // Auth header format
  formatAuthHeader: (token: string, tokenType?: string) => string;

  // Auto-refresh
  autoRefresh: boolean;
  refreshThreshold: number;

  // Cookie auth
  cookieAuth?: {
    enabled: boolean;
    csrf: {
      enabled: boolean;
      headerName: string;
      getToken: () => string | null;
    };
  };

  // Persistence
  persistence: {
    enabled: boolean;
    storage: Storage;
    tokenKey: string;
    refreshTokenKey: string;
    dataKey: string;
    expiryKey: string;
  };

  // Callbacks
  onError?: (error: any) => void;
  onLogin?: (data: D) => void;
  onLogout?: () => void;
};

export const validateAuthConfig = <D>(config: AuthConfig<D>): ValidatedAuthConfig<D> => {
  if (!config.axios) {
    throw new Error('AuthConfig: axios instance is required');
  }

  if (!config.loginUrl) {
    throw new Error('AuthConfig: loginUrl is required');
  }

  // Cookie auth config
  const cookieAuth = config.cookieAuth?.enabled ? {
    enabled: true,
    csrf: {
      enabled: config.cookieAuth.csrf?.enabled ?? false,
      headerName: config.cookieAuth.csrf?.headerName || 'X-CSRFToken',
      getToken: config.cookieAuth.csrf?.getToken ?? createCookieTokenGetter(
        config.cookieAuth.csrf?.cookieName || 'csrftoken'
      ),
    },
  } : undefined;

  // Persistence config (disabled by default)
  const persistence = {
    enabled: config.persistence?.enabled ?? false,
    storage: config.persistence?.storage ??
      (typeof window !== 'undefined' && window.localStorage ? window.localStorage : {} as Storage),
    tokenKey: config.persistence?.tokenKey ?? 'token',
    refreshTokenKey: config.persistence?.refreshTokenKey ?? 'refresh_token',
    dataKey: config.persistence?.dataKey ?? 'data',
    expiryKey: config.persistence?.expiryKey ?? 'expires_at',
  };

  return {
    axios: config.axios,
    loginUrl: config.loginUrl,
    logoutUrl: config.logoutUrl,
    refreshUrl: config.refreshUrl,
    dataUrl: config.dataUrl,
    authCheckUrl: config.authCheckUrl,
    extractTokens: config.extractTokens ?? defaultExtractTokens,
    extractData: normalizeExtractData(config.extractData),
    formatAuthHeader: config.formatAuthHeader ??
      ((token: string, tokenType: string = 'Bearer') => `${tokenType} ${token}`),
    autoRefresh: config.autoRefresh ?? true,
    refreshThreshold: config.refreshThreshold ?? 300000, // 5 minutes
    cookieAuth,
    persistence,
    onError: config.onError,
    onLogin: config.onLogin,
    onLogout: config.onLogout,
  };
};

// Default token extraction - handles common response formats
function defaultExtractTokens(data: any): TokenData {
  // OAuth 2.0 format: { access_token, refresh_token, expires_in, token_type }
  if (data.access_token) {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined,
      tokenType: data.token_type || 'Bearer',
    };
  }

  // Simple format: { token } or { auth_token }
  const token = data.token || data.auth_token;
  if (token) {
    return {
      accessToken: token,
      tokenType: 'Bearer',
    };
  }

  throw new Error('No token found in response. Provide extractTokens or ensure response contains access_token/token field.');
}

// Normalize extractData: string becomes key accessor, function passed through
function normalizeExtractData<D>(
  extractData?: ((data: any) => D | null) | string
): ((data: any) => D | null) | undefined {
  if (typeof extractData === 'string') {
    return (data: any) => data[extractData] ?? null;
  }
  return extractData;
}

// Create a cookie-based CSRF token getter (web only)
function createCookieTokenGetter(cookieName: string): () => string | null {
  return () => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp(`${cookieName}=([^;]+)`));
    return match ? match[1] : null;
  };
}
