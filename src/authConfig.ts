import { AxiosInstance } from 'axios';
import { AuthError } from './errors';

// OAuth 2.0 token data structure
export type TokenData = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
  scope?: string[];
  // Token rotation tracking
  rotationCount?: number;
};

// Backward compatibility: extract single token vs OAuth token data
export type TokenExtractor = (data: any) => string | TokenData;

export type AuthConfig<U> = {
  axios: AxiosInstance;
  
  // OAuth 2.0 compliant endpoints (new defaults)
  tokenUrl?: string;
  revokeUrl?: string;
  userInfoUrl?: string;
  
  // Backward compatibility: Django-style endpoints
  loginUrl?: string;
  logoutUrl?: string;
  getUserUrl?: string;
  
  // OAuth 2.0 compliant token extraction
  extractTokens?: (data: any) => TokenData;
  extractAccessToken?: (data: any) => string;
  extractRefreshToken?: (data: any) => string | undefined;
  extractExpiresIn?: (data: any) => number | undefined;
  extractTokenType?: (data: any) => string;
  extractScope?: (data: any) => string[] | undefined;
  
  // Backward compatibility: single token extraction
  extractToken?: (data: any) => string;

  // User extraction from responses (login, checkAuth)
  // Can be a function or a string key (e.g., "user" extracts data.user)
  extractUser?: ((data: any) => U | null) | string;

  formatAuthHeader?: (token: string, tokenType?: string) => string;
  
  // OAuth 2.0 features
  autoRefresh?: boolean;
  refreshThreshold?: number; // ms before expiry to refresh

  // Token rotation settings
  tokenRotation?: {
    enabled?: boolean;              // Default: true if refresh token present
    rotateOnRefresh?: boolean;      // Rotate access token on refresh
    rotateRefreshToken?: boolean;   // Rotate refresh token too (more secure)
    maxRotations?: number;          // Limit rotation chain (prevents abuse)
  };

  // Cookie-based authentication (alternative to localStorage)
  cookieAuth?: {
    enabled?: boolean;
    cookieName?: string;            // Default: 'auth_token'
    secure?: boolean;               // Default: true (HTTPS only)
    sameSite?: 'strict' | 'lax' | 'none'; // Default: 'lax'

    // CSRF protection (required for cookie auth)
    csrf?: {
      enabled?: boolean;            // Default: true
      headerName?: string;          // Default: 'X-CSRF-Token'
      cookieName?: string;          // Default: 'csrftoken'
    };
  };

  // Auth check endpoint (required for cookie auth)
  authCheckUrl?: string;            // e.g., '/api/auth/check'

  persistence?: {
    enabled?: boolean;
    storage?: Storage;
    tokenKey?: string;
    refreshTokenKey?: string;
    userKey?: string;
    expiryKey?: string;
  };

  // Enhanced error callback (now receives AuthError)
  onError?: (error: AuthError | any) => void;
  onLogin?: (user: U) => void;
  onLogout?: () => void;
  onTokenRefresh?: (tokens: TokenData) => void;
  onTokenRotated?: (oldToken: string, newTokens: TokenData) => void;
};

export type ValidatedAuthConfig<U> = {
  axios: AxiosInstance;
  
  // Resolved endpoints (OAuth preferred, Django fallback)
  tokenUrl: string;
  revokeUrl?: string;
  userInfoUrl?: string;
  
  // Backward compatibility endpoints
  loginUrl?: string;
  logoutUrl?: string;
  getUserUrl?: string;
  
  // Token extraction functions
  extractTokens: (data: any) => TokenData;
  extractToken?: (data: any) => string;

  // User extraction function (normalized from string or function input)
  extractUser?: (data: any) => U | null;

  formatAuthHeader: (token: string, tokenType?: string) => string;
  
  // OAuth features
  autoRefresh: boolean;
  refreshThreshold: number;

  // Token rotation
  tokenRotation: {
    enabled: boolean;
    rotateOnRefresh: boolean;
    rotateRefreshToken: boolean;
    maxRotations?: number;
  };

  // Cookie auth
  cookieAuth?: {
    enabled: boolean;
    cookieName: string;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    csrf: {
      enabled: boolean;
      headerName: string;
      cookieName: string;
    };
  };

  authCheckUrl?: string;

  persistence: {
    enabled: boolean;
    storage: Storage;
    tokenKey: string;
    refreshTokenKey: string;
    userKey: string;
    expiryKey: string;
  };

  onError?: (error: AuthError | any) => void;
  onLogin?: (user: U) => void;
  onLogout?: () => void;
  onTokenRefresh?: (tokens: TokenData) => void;
  onTokenRotated?: (oldToken: string, newTokens: TokenData) => void;
};

export const validateAuthConfig = <U>(config: AuthConfig<U>): ValidatedAuthConfig<U> => {
  if (!config.axios) {
    throw new Error('AuthConfig: axios instance is required');
  }

  // Determine token endpoint (OAuth preferred, Django fallback)
  const tokenUrl = config.tokenUrl || config.loginUrl;
  if (!tokenUrl) {
    throw new Error('AuthConfig: tokenUrl or loginUrl is required');
  }

  // Keep revokeUrl and logoutUrl distinct for proper OAuth/legacy behavior
  const revokeUrl = config.revokeUrl;

  // Determine user info endpoint
  const userInfoUrl = config.userInfoUrl || config.getUserUrl;

  // Create OAuth-compliant token extraction function
  const extractTokens = createTokenExtractor(config);

  // Persistence defaults to disabled
  const defaultPersistence = {
    enabled: false,
    storage: typeof window !== 'undefined' && window.localStorage ? window.localStorage : ({} as Storage),
    tokenKey: 'token',
    refreshTokenKey: 'refresh_token',
    userKey: 'user',
    expiryKey: 'expires_at',
  };

  // Token rotation defaults
  const tokenRotation = {
    enabled: config.tokenRotation?.enabled ?? true,
    rotateOnRefresh: config.tokenRotation?.rotateOnRefresh ?? true,
    rotateRefreshToken: config.tokenRotation?.rotateRefreshToken ?? false,
    maxRotations: config.tokenRotation?.maxRotations,
  };

  // Cookie auth defaults (only set if enabled)
  const cookieAuth = config.cookieAuth?.enabled ? {
    enabled: true,
    cookieName: config.cookieAuth.cookieName || 'auth_token',
    secure: config.cookieAuth.secure ?? true,
    sameSite: config.cookieAuth.sameSite || 'lax' as const,
    csrf: {
      enabled: config.cookieAuth.csrf?.enabled ?? true,
      headerName: config.cookieAuth.csrf?.headerName || 'X-CSRF-Token',
      cookieName: config.cookieAuth.csrf?.cookieName || 'csrftoken',
    },
  } : undefined;

  return {
    axios: config.axios,
    tokenUrl,
    revokeUrl,
    userInfoUrl,
    // Backward compatibility
    loginUrl: config.loginUrl,
    logoutUrl: config.logoutUrl,
    getUserUrl: config.getUserUrl,
    extractTokens,
    extractToken: config.extractToken,
    extractUser: normalizeExtractUser(config.extractUser),
    formatAuthHeader: config.formatAuthHeader || ((token: string, tokenType: string = 'Bearer') => `${tokenType} ${token}`),
    autoRefresh: config.autoRefresh ?? true,
    refreshThreshold: config.refreshThreshold ?? 300000, // 5 minutes
    tokenRotation,
    cookieAuth,
    authCheckUrl: config.authCheckUrl,
    persistence: {
      ...defaultPersistence,
      ...config.persistence,
    },
    onError: config.onError,
    onLogin: config.onLogin,
    onLogout: config.onLogout,
    onTokenRefresh: config.onTokenRefresh,
    onTokenRotated: config.onTokenRotated,
  };
};

// Normalize extractUser: string becomes key accessor, function passed through
function normalizeExtractUser<U>(
  extractUser?: ((data: any) => U | null) | string
): ((data: any) => U | null) | undefined {
  if (typeof extractUser === 'string') {
    return (data: any) => data[extractUser] ?? null;
  }
  return extractUser;
}

// Helper function to create OAuth-compliant token extractor with backward compatibility
function createTokenExtractor<U>(config: AuthConfig<U>): (data: any) => TokenData {
  return (data: any): TokenData => {
    // If custom extractTokens function provided, use it
    if (config.extractTokens) {
      return config.extractTokens(data);
    }

    // OAuth 2.0 compliant extraction (preferred)
    if (data.access_token) {
      return {
        accessToken: config.extractAccessToken ? config.extractAccessToken(data) : data.access_token,
        refreshToken: config.extractRefreshToken ? config.extractRefreshToken(data) : data.refresh_token,
        expiresAt: config.extractExpiresIn 
          ? (config.extractExpiresIn(data) ? Date.now() + (config.extractExpiresIn(data)! * 1000) : undefined)
          : (data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined),
        tokenType: config.extractTokenType ? config.extractTokenType(data) : (data.token_type || 'Bearer'),
        scope: config.extractScope ? config.extractScope(data) : (data.scope ? data.scope.split(' ') : undefined),
      };
    }

    // Single token fallback (backward compatibility)
    if (config.extractToken || data.auth_token || data.token) {
      const token = config.extractToken ? config.extractToken(data) : (data.auth_token || data.token);
      return {
        accessToken: token,
        tokenType: 'Bearer', // Standard default
      };
    }

    throw new Error('No valid token found in response. Provide extractTokens, extractToken, or ensure response contains access_token/auth_token field.');
  };
}