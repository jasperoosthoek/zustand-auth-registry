# zustand-auth-registry

Authentication state management library using Zustand and Axios with a type-safe registry pattern.

## Features

- **Authentication State Management** - User, token, and authentication status with reactive updates
- **Registry Pattern** - Type-safe multiple auth stores per application
- **Axios Integration** - Automatic authentication header management
- **Token Lifecycle** - Automatic expiration detection and refresh workflows
- **Cookie Authentication** - httpOnly cookie support with CSRF protection
- **Typed Errors** - `AuthError` class with error codes for better error handling
- **Persistence** - Flexible storage options (localStorage, sessionStorage, custom)
- **Type-Safe** - Full TypeScript support with generics for user models

## Installation

```bash
npm install @jasperoosthoek/zustand-auth-registry zustand axios react
```

## Quick Start

```typescript
import axios from 'axios';
import { createAuthRegistry, useAuth } from '@jasperoosthoek/zustand-auth-registry';

// 1. Define your user type
type User = {
  id: number;
  email: string;
  name: string;
};

// 2. Create registry
const getAuthStore = createAuthRegistry<{
  main: User;
}>();

// 3. Create axios instance
const api = axios.create({ baseURL: 'https://api.example.com' });

// 4. Create auth store
export const authStore = getAuthStore('main', {
  axios: api,
  loginUrl: '/auth/login',
  logoutUrl: '/auth/logout',
  getUserUrl: '/users/me',
  extractUser: 'user', // Extract user from response.data.user
});

// 5. Use in components
function LoginForm() {
  const { login } = useAuth(authStore);
  const { user, isAuthenticated } = authStore((s) => s);

  const handleLogin = async () => {
    await login({ username: 'user@example.com', password: 'password' });
  };

  if (isAuthenticated) {
    return <div>Welcome {user?.name}!</div>;
  }

  return <button onClick={handleLogin}>Login</button>;
}
```

## Cookie Authentication

For httpOnly cookie-based authentication (more secure against XSS):

```typescript
const authStore = getAuthStore('main', {
  axios: api,
  loginUrl: '/auth/login',
  logoutUrl: '/auth/logout',
  authCheckUrl: '/auth/check', // Required for cookie auth

  cookieAuth: {
    enabled: true,
    csrf: {
      enabled: true,
      headerName: 'X-CSRFToken',
      cookieName: 'csrftoken',
    },
  },
});

// Check authentication status (reads httpOnly cookie server-side)
const { checkAuth } = useAuth(authStore);
const isAuthenticated = await checkAuth();
```

## Error Handling

```typescript
import { AuthError, AuthErrorCode } from '@jasperoosthoek/zustand-auth-registry';

const authStore = getAuthStore('main', {
  // ...
  onError: (error) => {
    if (AuthError.isAuthError(error)) {
      switch (error.code) {
        case AuthErrorCode.INVALID_CREDENTIALS:
          alert('Invalid username or password');
          break;
        case AuthErrorCode.TOKEN_EXPIRED:
          // Token expired, user needs to login again
          break;
        case AuthErrorCode.NETWORK_ERROR:
          alert('Network error, please try again');
          break;
      }
    }
  },
});
```

## API Reference

### `AuthConfig<U>`

```typescript
type AuthConfig<U> = {
  axios: AxiosInstance;

  // Endpoints
  loginUrl: string;
  logoutUrl?: string;
  refreshUrl?: string;
  getUserUrl?: string;
  authCheckUrl?: string; // For cookie auth

  // Token extraction from login response
  extractTokens?: (data: any) => TokenData;

  // User extraction (function or string key)
  extractUser?: ((data: any) => U | null) | string;

  // Auth header format (default: "Bearer {token}")
  formatAuthHeader?: (token: string, tokenType?: string) => string;

  // Auto-refresh
  autoRefresh?: boolean;        // Default: true
  refreshThreshold?: number;    // Default: 300000 (5 minutes)

  // Cookie auth
  cookieAuth?: {
    enabled: boolean;
    csrf?: {
      enabled: boolean;
      headerName?: string;  // Default: 'X-CSRFToken'
      cookieName?: string;  // Default: 'csrftoken'
    };
  };

  // Persistence
  persistence?: {
    enabled: boolean;       // Default: false
    storage?: Storage;      // Default: localStorage
    tokenKey?: string;
    refreshTokenKey?: string;
    userKey?: string;
    expiryKey?: string;
  };

  // Callbacks
  onError?: (error: any) => void;
  onLogin?: (user: U) => void;
  onLogout?: () => void;
};
```

### `TokenData`

```typescript
type TokenData = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;  // Default: 'Bearer'
};
```

### `useAuth(store)`

```typescript
const { login, logout, getCurrentUser, refreshTokens, checkAuth } = useAuth(authStore);
```

- `login(credentials, callback?)` - Login with credentials
- `logout()` - Logout and clear tokens
- `getCurrentUser()` - Fetch current user
- `refreshTokens()` - Refresh access token
- `checkAuth()` - Check cookie authentication status

### Auth Store State

```typescript
const { user, tokens, isAuthenticated } = authStore((s) => s);
```

- `user: U | null` - Current user
- `tokens: TokenData | null` - Token data (access token, refresh token, etc.)
- `isAuthenticated: boolean` - Authentication status

## Related Projects

- [@jasperoosthoek/zustand-crud-registry](https://github.com/jasperoosthoek/zustand-crud-registry) - CRUD operations for REST APIs

## License

MIT
