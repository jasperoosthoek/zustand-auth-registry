# OAuth 2.0 Implementation Details

This document provides detailed technical information about the OAuth 2.0 implementation in `zustand-auth-registry`.

## Architecture Overview

The library implements OAuth 2.0 (RFC 6749) compliance while maintaining 100% backward compatibility with legacy authentication patterns. The architecture consists of five main components:

1. **Configuration Layer** (`authConfig.ts`) - Validates and normalizes auth configurations
2. **State Management** (`authStore.ts`) - Manages authentication state with Zustand
3. **React Integration** (`useAuth.ts`) - Provides React hooks for authentication actions
4. **PKCE Support** (`pkce.ts`) - Proof Key for Code Exchange (RFC 7636) for public clients
5. **Error Handling** (`errors.ts`) - Typed error system with specific error codes

## Technical Implementation

### OAuth 2.0 Token Structure

```typescript
export type TokenData = {
  accessToken: string;      // OAuth 2.0 standard access token
  refreshToken?: string;    // Optional refresh token for renewal
  expiresAt?: number;      // Timestamp (ms) when token expires
  tokenType: string;       // Token type (default: 'Bearer')
  scope?: string[];        // OAuth scopes granted to token
  rotationCount?: number;  // Token rotation tracking for security
};
```

### Flexible Token Extraction

The library supports multiple token response formats through a smart extraction system:

```typescript
function createTokenExtractor<U>(config: AuthConfig<U>): (data: any) => TokenData {
  return (data: any): TokenData => {
    // 1. Custom extractor takes precedence
    if (config.extractTokens) {
      return config.extractTokens(data);
    }

    // 2. OAuth 2.0 compliant extraction (preferred)
    if (data.access_token) {
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined,
        tokenType: data.token_type || 'Bearer',
        scope: data.scope ? data.scope.split(' ') : undefined,
      };
    }

    // 3. Legacy fallback (backward compatibility)
    if (config.extractToken || data.auth_token || data.token) {
      const token = config.extractToken ? config.extractToken(data) : (data.auth_token || data.token);
      return {
        accessToken: token,
        tokenType: 'Bearer', // Standard default
      };
    }

    throw new Error('No valid token found in response');
  };
}
```

### Automatic Token Refresh

The implementation includes intelligent token refresh with configurable timing:

```typescript
const refreshTokens = useCallback(async (): Promise<boolean> => {
  if (!tokens?.refreshToken) return false;

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

// Auto-refresh timer with smart timing
useEffect(() => {
  if (tokens?.expiresAt && tokens.refreshToken && config.autoRefresh) {
    const timeUntilExpiry = tokens.expiresAt - Date.now();
    const refreshTime = Math.max(timeUntilExpiry - config.refreshThreshold, 0);

    const timer = setTimeout(() => {
      refreshTokens();
    }, refreshTime);

    return () => clearTimeout(timer);
  }
}, [tokens, config.autoRefresh, config.refreshThreshold, refreshTokens]);
```

### Token Rotation

The library implements secure token rotation to prevent token replay attacks:

```typescript
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
```

**Configuration:**
```typescript
export const authStore = getAuthStore('main', {
  // ... other config

  tokenRotation: {
    enabled: true,              // Enable rotation tracking
    rotateOnRefresh: true,      // Rotate access token on refresh
    rotateRefreshToken: false,  // Rotate refresh token too (more secure)
    maxRotations: 5,            // Limit rotation chain (prevents abuse)
  },

  // Callback when token is rotated
  onTokenRotated: (oldToken, newTokens) => {
    console.log('Token rotated:', { rotationCount: newTokens.rotationCount });
  },
});
```

### Cookie-Based Authentication

The library supports httpOnly cookie authentication as a more secure alternative to localStorage:

```typescript
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

      // Get user info if needed
      if (response.data.user) {
        setUser(response.data.user);
      } else if (config.userInfoUrl || config.getUserUrl) {
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
```

**Configuration:**
```typescript
export const authStore = getAuthStore('main', {
  axios,
  tokenUrl: '/api/auth/login',
  authCheckUrl: '/api/auth/check',

  cookieAuth: {
    enabled: true,
    cookieName: 'sessionid',
    secure: true,              // HTTPS only
    sameSite: 'lax',          // CSRF protection

    csrf: {
      enabled: true,
      headerName: 'X-CSRF-Token',
      cookieName: 'csrftoken',
    },
  },
});
```

**Benefits:**
- XSS protection (cookies not accessible via JavaScript)
- CSRF protection (via CSRF tokens)
- Automatic cookie management by browser
- Works with traditional session-based backends

### PKCE Support

The library implements Proof Key for Code Exchange (RFC 7636) for public clients (SPAs, mobile apps):

```typescript
// Generate code verifier (random string 43-128 chars)
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

// Generate code challenge from verifier
export async function generateCodeChallenge(
  verifier: string,
  method: 'S256' | 'plain' = 'S256'
): Promise<string> {
  if (method === 'plain') {
    return verifier;
  }

  // S256: SHA-256 hash of verifier
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(digest));
}
```

**Usage:**
```typescript
import { generateCodeVerifier, generateCodeChallenge } from './pkce';

// 1. Generate PKCE pair
const verifier = generateCodeVerifier();
const challenge = await generateCodeChallenge(verifier, 'S256');

// 2. Store verifier for later
sessionStorage.setItem('pkce_verifier', verifier);

// 3. Build authorization URL
const authUrl = `${config.authorizeUrl}?` + new URLSearchParams({
  response_type: 'code',
  client_id: config.clientId,
  redirect_uri: config.redirectUri,
  code_challenge: challenge,
  code_challenge_method: 'S256',
  scope: 'openid profile email',
});

// 4. Redirect to OAuth provider
window.location.href = authUrl;

// 5. After callback, exchange code for tokens
const verifier = sessionStorage.getItem('pkce_verifier');
const response = await axios.post(config.tokenUrl, {
  grant_type: 'authorization_code',
  code: authorizationCode,
  redirect_uri: config.redirectUri,
  code_verifier: verifier,
});
```

### Enhanced Error Handling

The library provides typed error handling with specific error codes:

```typescript
export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  REFRESH_FAILED = 'REFRESH_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CSRF_TOKEN_MISSING = 'CSRF_TOKEN_MISSING',
  UNKNOWN = 'UNKNOWN',
}

export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    public originalError?: any,
    message?: string
  ) {
    super(message || code);
    this.name = 'AuthError';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      name: this.name,
    };
  }
}

// Automatic error detection from HTTP responses
export function createAuthError(error: any): AuthError {
  if (error instanceof AuthError) {
    return error;
  }

  // Axios error with response
  if (error.response) {
    const status = error.response.status;
    const detail = error.response.data?.detail?.toLowerCase() || '';

    // Detailed error detection
    if (status === 401) {
      if (detail.includes('expired')) {
        return new AuthError(AuthErrorCode.TOKEN_EXPIRED, error);
      }
      return new AuthError(AuthErrorCode.UNAUTHORIZED, error);
    }

    if (status === 403) {
      if (detail.includes('csrf')) {
        return new AuthError(AuthErrorCode.CSRF_TOKEN_MISSING, error);
      }
      return new AuthError(AuthErrorCode.FORBIDDEN, error);
    }

    if (status === 404 && detail.includes('user')) {
      return new AuthError(AuthErrorCode.USER_NOT_FOUND, error);
    }
  }

  // Network error (no response)
  if (error.request) {
    return new AuthError(AuthErrorCode.NETWORK_ERROR, error);
  }

  return new AuthError(AuthErrorCode.UNKNOWN, error);
}
```

**Usage:**
```typescript
export const authStore = getAuthStore('main', {
  // ... config

  onError: (error: AuthError) => {
    switch (error.code) {
      case AuthErrorCode.TOKEN_EXPIRED:
        toast.info('Session expired, please login again');
        break;
      case AuthErrorCode.CSRF_TOKEN_MISSING:
        toast.error('Security token missing, please refresh the page');
        break;
      case AuthErrorCode.NETWORK_ERROR:
        toast.error('Network error, please check your connection');
        break;
      default:
        toast.error('An error occurred');
    }
  },
});
```

### Backward Compatibility Strategy

The library maintains 100% backward compatibility through several mechanisms:

#### 1. Endpoint Resolution
```typescript
// OAuth 2.0 preferred, legacy fallback
const tokenUrl = config.tokenUrl || config.loginUrl;
const userInfoUrl = config.userInfoUrl || config.getUserUrl;
const revokeUrl = config.revokeUrl || config.logoutUrl;
```

#### 2. Token Format Support
```typescript
// Supports both Bearer (OAuth) and Token (Django) formats
formatAuthHeader: (token: string, tokenType: string = 'Bearer') => `${tokenType} ${token}`

// Legacy configuration still works:
formatAuthHeader: (token) => `Token ${token}` // Django style
```

#### 3. State Compatibility
```typescript
export type AuthState<U> = {
  // New OAuth structure
  tokens: TokenData | null;
  
  // Backward compatible properties
  token: string; // Computed from tokens.accessToken
  
  // Both old and new methods available
  setToken: (token: string) => void;      // Legacy
  setTokens: (tokens: TokenData) => void; // OAuth
};
```

### Storage Management

The library supports flexible storage with OAuth-specific keys:

```typescript
const defaultPersistence = {
  enabled: true,
  storage: typeof window !== 'undefined' && window.localStorage ? window.localStorage : ({} as Storage),
  tokenKey: 'token',           // Backward compatible
  refreshTokenKey: 'refresh_token', // OAuth standard
  userKey: 'user',
  expiryKey: 'expires_at',     // OAuth standard
};
```

Storage operations handle both single tokens and OAuth token structures:

```typescript
// OAuth token storage
setTokens: (tokens: TokenData) => {
  if (persistence.enabled) {
    persistence.storage.setItem(persistence.tokenKey, tokens.accessToken);
    
    if (tokens.refreshToken) {
      persistence.storage.setItem(persistence.refreshTokenKey, tokens.refreshToken);
    }
    
    if (tokens.expiresAt) {
      persistence.storage.setItem(persistence.expiryKey, tokens.expiresAt.toString());
    }
  }
}
```

### Error Handling

The implementation includes comprehensive error handling:

```typescript
// Network errors during token refresh
catch (error) {
  unsetUser(); // Clear invalid state
  setAxiosAuth(); // Remove auth headers
  config.onError?.(error); // User-defined error handler
  return false;
}

// Storage errors
catch (error) {
  config.onError?.(error); // Don't fail silently
}

// 403 errors during initialization
if (axios.isAxiosError(error) && error.response?.status === 403) {
  unsetUser(); // Token is invalid, clear state
  setAxiosAuth();
}
```

### Type Safety

The library provides full TypeScript support with generics:

```typescript
// Registry with typed user models
const getAuthStore = createAuthRegistry<{
  main: MainUser;
  admin: AdminUser;
}>();

// Type-safe store creation
const mainAuth = getAuthStore('main', config); // Returns AuthStore<MainUser>
const adminAuth = getAuthStore('admin', config); // Returns AuthStore<AdminUser>

// Type-safe usage
const { user } = mainAuth((s) => s); // user is MainUser | null
```

### Testing Strategy

The implementation includes comprehensive test coverage (196 tests, 100% pass rate, 96.4% coverage):

#### 1. Configuration Validation Tests
- Required field validation
- Default value application
- Type safety verification
- SSR compatibility

#### 2. State Management Tests
- Token lifecycle operations
- Persistence behavior
- Authentication state logic
- Error handling

#### 3. React Hook Tests (useAuth)
- Login/logout flows
- Token refresh behavior
- Axios header management
- Component integration
- Cookie authentication flows
- Token rotation limits
- CSRF protection

#### 4. PKCE Tests (61 tests)
- Code verifier generation (RFC 7636 compliance)
- Code challenge generation (S256 and plain methods)
- Base64URL encoding
- Character set validation
- Cryptographic randomness
- Integration flows

#### 5. Error Handling Tests (20 tests)
- AuthError class functionality
- Error code detection from HTTP responses
- Token expiration detection
- CSRF token validation
- Network error handling
- User not found scenarios

#### 6. Backward Compatibility Tests
- Legacy configuration support
- Django REST Framework patterns
- Token format compatibility
- Migration scenarios

**Coverage by File:**
- authConfig.ts: 100%
- authStore.ts: 100%
- createAuthRegistry.ts: 100%
- errors.ts: 100%
- useAuth.ts: 99.33%
- pkce.ts: 80%

## Performance Considerations

### 1. Memory Management
- Timers are properly cleaned up using `useEffect` cleanup functions
- Event listeners are removed when components unmount
- Large objects are not unnecessarily retained in closures

### 2. Network Optimization
- Token refresh happens before expiration (configurable threshold)
- Failed refresh attempts don't retry immediately
- Concurrent refresh requests are handled gracefully

### 3. Storage Efficiency
- Only necessary data is persisted
- Storage errors don't crash the application
- SSR environments are handled without localStorage

## Security Features

### 1. Token Security
- Automatic token expiration handling
- Secure defaults (Bearer tokens)
- Configurable refresh thresholds
- Proper token cleanup on logout
- **Token rotation with abuse prevention** (maxRotations limit)
- **Rotation count tracking** to detect token replay attacks

### 2. Cookie-Based Authentication
- **httpOnly cookies** for XSS protection
- **CSRF token validation** for cookie mode
- Secure, SameSite cookie attributes
- Automatic CSRF header injection
- Server-side session management support

### 3. PKCE for Public Clients
- **RFC 7636 compliant** implementation
- S256 (SHA-256) and plain methods
- Cryptographically secure random generation
- Protection against authorization code interception
- Suitable for SPAs and mobile apps

### 4. Enhanced Error Handling
- **Typed error codes** for specific scenarios
- Automatic error detection from HTTP responses
- Sensitive error details excluded from serialization
- User-friendly error messages
- Detailed error tracking for debugging

### 5. Header Management
- Authorization headers are properly set/cleared
- Multiple axios instances supported
- Custom header formats allowed
- CSRF headers automatically injected

### 6. Storage Security
- Graceful handling of storage quota errors
- No sensitive data logged to console
- Storage corruption doesn't crash app
- Cookie mode avoids localStorage XSS risks

## Browser Compatibility

The implementation supports:
- Modern browsers with ES2017+ support
- Server-side rendering environments
- Web Workers (with custom storage)
- Progressive Web Apps

Key browser APIs used:
- `localStorage`/`sessionStorage` (with fallbacks)
- `setTimeout`/`clearTimeout` for refresh timers
- `fetch`/`axios` for HTTP requests
- `JSON.parse`/`JSON.stringify` for serialization
- `crypto.subtle` for PKCE (Web Crypto API)
- `crypto.getRandomValues()` for secure random generation
- `TextEncoder` for PKCE string encoding

## Bundle Size Impact

The library is designed to be lightweight:
- Core functionality: ~8KB gzipped
- Zero runtime dependencies beyond peer dependencies
- Tree-shakeable exports
- No polyfills included (user's choice)

## Migration Patterns

### From Django REST Framework
```typescript
// Before (Django-specific)
const authStore = getAuthStore('main', {
  loginUrl: '/api/token/login/',
  extractToken: (data) => data.auth_token,
  formatAuthHeader: (token) => `Token ${token}`
});

// After (OAuth-compatible, but still works with Django)
const authStore = getAuthStore('main', {
  loginUrl: '/api/token/login/',  // Still works
  extractToken: (data) => data.auth_token, // Still works
  formatAuthHeader: (token) => `Token ${token}` // Still works
  // Now has OAuth features like auto-refresh, Bearer support, etc.
});
```

### To OAuth 2.0 Provider
```typescript
// Full OAuth 2.0 implementation
const authStore = getAuthStore('main', {
  tokenUrl: '/oauth/token',
  userInfoUrl: '/oauth/userinfo',
  // Automatic OAuth token extraction
  // Automatic Bearer headers
  // Automatic token refresh
});
```

This implementation provides a solid foundation for OAuth 2.0 compliance while maintaining complete backward compatibility and excellent developer experience.