# zustand-auth-registry

OAuth 2.0 compliant authentication state management library using Zustand and Axios with a type-safe registry pattern.

## Overview

`zustand-auth-registry` provides a simple, type-safe way to manage authentication state in React applications using Zustand. It supports both modern OAuth 2.0 standards and legacy authentication patterns, with automatic token refresh, Bearer token support, and comprehensive backward compatibility.

## Features

- **OAuth 2.0 Compliance** - Industry-standard Bearer tokens, automatic refresh, token lifecycle management
- **Authentication State Management** - User, token, and authentication status with reactive updates
- **Registry Pattern** - Type-safe multiple auth stores per application
- **Axios Integration** - Automatic authentication header management with configurable formats
- **Token Lifecycle** - Automatic expiration detection, refresh workflows, and cleanup
- **Auto-Refresh** - Configurable threshold-based token renewal (default: 5 minutes before expiry)
- **Persistence** - Flexible storage options (localStorage, sessionStorage, custom) with OAuth token support
- **Type-Safe** - Full TypeScript support with generics for user models
- **Backward Compatible** - Seamless support for Django REST Framework and legacy APIs
- **Flexible** - Support for multiple APIs with different authentication strategies
- **Lightweight** - Simple API, no unnecessary complexity

## Installation

```bash
npm install @jasperoosthoek/zustand-auth-registry zustand axios react
```

## Quick Start

### OAuth 2.0 Setup (Recommended)

```typescript
import axios from 'axios';
import { createAuthRegistry, useAuth } from '@jasperoosthoek/zustand-auth-registry';

// 1. Define your user type
type User = {
  id: string;
  email: string;
  name: string;
};

// 2. Create registry
const getAuthStore = createAuthRegistry<{
  main: User;
}>();

// 3. Create axios instance
const api = axios.create({ baseURL: 'https://api.example.com' });

// 4. Create OAuth 2.0 compliant auth store
export const authStore = getAuthStore('main', {
  axios: api,
  tokenUrl: '/oauth/token',
  userInfoUrl: '/oauth/userinfo',
  // Automatic OAuth token extraction (access_token, refresh_token, expires_in)
  // Automatic Bearer header format
  // Auto-refresh enabled by default
});

// 5. Use in components
function LoginForm() {
  const { login } = useAuth(authStore);
  const { user, isAuthenticated } = authStore((s) => s);
  
  const handleLogin = async () => {
    await login({ 
      username: 'user@example.com', 
      password: 'password' 
    });
  };
  
  if (isAuthenticated) {
    return <div>Welcome {user?.name}!</div>;
  }
  
  return <button onClick={handleLogin}>Login</button>;
}
```

### Legacy/Django Setup (Backward Compatible)

```typescript
// Works with existing Django REST Framework patterns
export const authStore = getAuthStore('main', {
  axios: api,
  loginUrl: '/api/token/login/',  // Legacy endpoint
  logoutUrl: '/api/token/logout/',
  getUserUrl: '/api/users/me/',
  extractToken: (data) => data.auth_token, // Django field name
  formatAuthHeader: (token) => `Token ${token}`, // Django format
});
```

## Use Cases

### OAuth 2.0 Provider Integration

```typescript
// Works with Auth0, Google, GitHub, or any OAuth 2.0 provider
const auth0Store = getAuthStore('auth0', {
  axios: api,
  tokenUrl: 'https://your-domain.auth0.com/oauth/token',
  userInfoUrl: 'https://your-domain.auth0.com/userinfo',
  autoRefresh: true,
  refreshThreshold: 300000, // Refresh 5 minutes before expiry
  onTokenRefresh: (tokens) => {
    console.log('Token refreshed, expires at:', new Date(tokens.expiresAt));
  }
});
```

### JWT Token Support

```typescript
// Automatic JWT expiration detection
const jwtStore = getAuthStore('jwt', {
  axios: api,
  tokenUrl: '/api/auth/login',
  extractTokens: (data) => {
    const payload = JSON.parse(atob(data.access_token.split('.')[1]));
    return {
      accessToken: data.access_token,
      expiresAt: payload.exp * 1000, // JWT exp is in seconds
      tokenType: 'Bearer'
    };
  }
});
```

### Multiple APIs with Different Authentication

```typescript
const internalApi = axios.create({ baseURL: 'https://internal.app.com' });
const partnerApi = axios.create({ baseURL: 'https://partner.api.com' });

// Internal API uses legacy Token authentication
const internalAuth = getAuthStore('internal', {
  axios: internalApi,
  loginUrl: '/api/token/login/',
  extractToken: (data) => data.auth_token,
  formatAuthHeader: (token) => `Token ${token}`,
});

// Partner API uses OAuth 2.0 Bearer authentication
const partnerAuth = getAuthStore('partner', {
  axios: partnerApi,
  tokenUrl: '/oauth/token',
  userInfoUrl: '/oauth/userinfo',
  // Uses Bearer tokens and auto-refresh by default
});
```

### Custom Storage Configuration

```typescript
const authStore = getAuthStore('main', {
  axios: api,
  tokenUrl: '/oauth/token',
  persistence: {
    enabled: true,
    storage: sessionStorage, // Use sessionStorage instead of localStorage
    tokenKey: 'access_token', // OAuth standard (default)
    refreshTokenKey: 'refresh_token',
    userKey: 'user_profile',
    expiryKey: 'token_expires_at',
  },
});
```

### SSR/No Persistence

```typescript
const authStore = getAuthStore('main', {
  axios: api,
  tokenUrl: '/oauth/token',
  persistence: {
    enabled: false, // Disable persistence for SSR
  },
});
```

### Multi-Environment Setup

```typescript
// Different auth strategies for different environments
const authStore = getAuthStore('main', {
  axios: api,
  
  // Production: OAuth 2.0
  ...(process.env.NODE_ENV === 'production' && {
    tokenUrl: '/oauth/token',
    userInfoUrl: '/oauth/userinfo',
    autoRefresh: true
  }),
  
  // Development: Simple tokens
  ...(process.env.NODE_ENV === 'development' && {
    loginUrl: '/api/auth/login',
    getUserUrl: '/api/users/me',
    extractToken: (data) => data.token
  })
});
```

## Integration with zustand-crud-registry

Works seamlessly with [@jasperoosthoek/zustand-crud-registry](https://github.com/jasperoosthoek/zustand-crud-registry):

```typescript
import { createStoreRegistry } from '@jasperoosthoek/zustand-crud-registry';
import { createAuthRegistry } from '@jasperoosthoek/zustand-auth-registry';

// Shared axios instance
const api = axios.create({ baseURL: 'https://api.example.com' });

// Auth manages authentication with auto-refresh
const auth = getAuthStore('main', { 
  axios: api, 
  tokenUrl: '/oauth/token',
  autoRefresh: true 
});

// CRUD uses the same authenticated axios
const getCrudStore = createStoreRegistry<{ user: User; post: Post }>();
const users = getCrudStore('user', { axios: api, route: '/users' });

// Login first, then use CRUD
const { login } = useAuth(auth);
const { list, getList } = useCrud(users);

await login({ username: '...', password: '...' });
await getList(); // Authenticated request with auto-refreshed tokens
```

## API Reference

### `createAuthRegistry<Models>()`

Creates a registry function for type-safe auth stores.

```typescript
type Models = {
  main: MainUser;
  admin: AdminUser;
};

const getAuthStore = createAuthRegistry<Models>();
```

### `getAuthStore(key, config)`

Creates or retrieves an auth store.

**Parameters:**
- `key`: Unique identifier for the store
- `config`: Authentication configuration

**Returns:** Auth store with Zustand state and config metadata

### `AuthConfig<U>`

Configuration object for authentication.

```typescript
type AuthConfig<U> = {
  // Required
  axios: AxiosInstance;
  
  // OAuth 2.0 endpoints (recommended)
  tokenUrl?: string;           // POST /oauth/token
  revokeUrl?: string;          // POST /oauth/revoke  
  userInfoUrl?: string;        // GET /oauth/userinfo
  
  // Legacy endpoints (backward compatibility)
  loginUrl?: string;           // POST /api/token/login/
  logoutUrl?: string;          // POST /api/token/logout/
  getUserUrl?: string;         // GET /api/users/me/
  
  // OAuth 2.0 token extraction (automatic if not specified)
  extractTokens?: (data: any) => TokenData;
  extractAccessToken?: (data: any) => string;
  extractRefreshToken?: (data: any) => string | undefined;
  extractExpiresIn?: (data: any) => number | undefined;
  extractTokenType?: (data: any) => string;
  extractScope?: (data: any) => string[] | undefined;
  
  // Legacy token extraction (backward compatibility)
  extractToken?: (data: any) => string;
  
  // Token formatting (defaults to Bearer)
  formatAuthHeader?: (token: string, tokenType?: string) => string;
  
  // OAuth 2.0 features
  autoRefresh?: boolean;       // Default: true
  refreshThreshold?: number;   // Default: 300000ms (5 minutes)
  
  // Storage configuration
  persistence?: {
    enabled?: boolean;         // Default: true
    storage?: Storage;         // Default: localStorage
    tokenKey?: string;         // Default: 'token'
    refreshTokenKey?: string;  // Default: 'refresh_token'
    userKey?: string;          // Default: 'user'
    expiryKey?: string;        // Default: 'expires_at'
  };
  
  // Event callbacks
  onError?: (error: any) => void;
  onLogin?: (user: U) => void;
  onLogout?: () => void;
  onTokenRefresh?: (tokens: TokenData) => void;
};
```

### `TokenData`

OAuth 2.0 compliant token structure.

```typescript
type TokenData = {
  accessToken: string;      // OAuth 2.0 standard
  refreshToken?: string;    // For token renewal
  expiresAt?: number;      // Timestamp for expiration
  tokenType: string;       // 'Bearer' (default) or custom
  scope?: string[];        // OAuth scope support
};
```

### `useAuth(store)`

React hook for authentication actions.

**Returns:**
```typescript
{
  login: (credentials: Record<string, string>, callback?: () => void) => Promise<void>;
  logout: () => Promise<void>;
  getCurrentUser: () => Promise<void>;
  refreshTokens: () => Promise<boolean>; // OAuth 2.0 token refresh
}
```

### Auth Store State

Access auth state using the store:

```typescript
const { user, token, tokens, isAuthenticated } = authStore((s) => s);
```

**State:**
- `user: U | null` - Current user object
- `token: string` - Authentication token (backward compatibility)
- `tokens: TokenData | null` - OAuth 2.0 token structure
- `isAuthenticated: boolean` - Whether user is authenticated (based on valid token)

**Actions:**
- `setToken(token: string)` - Set authentication token (backward compatibility)
- `setTokens(tokens: TokenData)` - Set OAuth 2.0 tokens
- `setUser(user: U)` - Set user object
- `unsetUser()` - Clear user and tokens (logout)
- `isTokenExpired(): boolean` - Check if current token is expired

## Migration Guide

### From Legacy to OAuth 2.0

**Step 1: No changes required (existing code continues to work)**
```typescript
// Existing configurations work unchanged
const authStore = getAuthStore('main', {
  loginUrl: '/api/token/login/',
  extractToken: (data) => data.auth_token,
  formatAuthHeader: (token) => `Token ${token}`
});
```

**Step 2: Gradual OAuth adoption**
```typescript
// Start using OAuth endpoints while keeping legacy token extraction
const authStore = getAuthStore('main', {
  tokenUrl: '/oauth/token',           // OAuth endpoint
  extractToken: (data) => data.auth_token, // Legacy extraction
  formatAuthHeader: (token) => `Token ${token}` // Legacy headers
});
```

**Step 3: Full OAuth 2.0**
```typescript
// Complete OAuth 2.0 implementation
const authStore = getAuthStore('main', {
  tokenUrl: '/oauth/token',
  revokeUrl: '/oauth/revoke',
  userInfoUrl: '/oauth/userinfo',
  // OAuth token extraction and Bearer headers are automatic
  autoRefresh: true,
  refreshThreshold: 300000 // 5 minutes
});
```

## Development

See [SETUP.md](./SETUP.md) for detailed setup and development instructions.

```bash
# Install dependencies
npm install

# Build
npm run build

# Test (67 tests, 100% pass rate)
npm test

# Coverage
npm run test:coverage
```

## OAuth 2.0 Compliance

This library implements OAuth 2.0 (RFC 6749) standards:

- **Bearer Token Authentication** (RFC 6750)
- **Token Refresh Flows** with automatic renewal
- **Proper Token Lifecycle** management
- **Standard Field Names** (`access_token`, `refresh_token`, `expires_in`)
- **Configurable Scopes** and token types
- **Backward Compatibility** with legacy authentication patterns

For detailed OAuth 2.0 implementation information, see [.OAUTH.md](./.OAUTH.md).

## Related Projects

- [@jasperoosthoek/zustand-crud-registry](https://github.com/jasperoosthoek/zustand-crud-registry) - CRUD operations for REST APIs

## License

MIT

## Author

Jasper Oosthoek