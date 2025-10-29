# zustand-auth-registry

Authentication state management library using Zustand and Axios with a type-safe registry pattern.

## Overview

`zustand-auth-registry` provides a simple, type-safe way to manage authentication state in React applications using Zustand. It handles login, logout, user management, token persistence, and Axios authentication headers.

## Features

- **Authentication State Management** - User, token, and authentication status
- **Registry Pattern** - Type-safe multiple auth stores per application
- **Axios Integration** - Automatic authentication header management
- **Persistence** - Optional localStorage for token and user data
- **Type-Safe** - Full TypeScript support with generics
- **Flexible** - Support for multiple APIs with different authentication
- **Lightweight** - Simple API, no unnecessary complexity

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

// 4. Create auth store
export const authStore = getAuthStore('main', {
  axios: api,
  loginUrl: '/auth/login',
  logoutUrl: '/auth/logout',
  getUserUrl: '/auth/me',
  extractToken: (data) => data.token,
});

// 5. Use in components
function LoginForm() {
  const { login } = useAuth(authStore);
  const { user, isAuthenticated } = authStore((s) => s);
  
  const handleLogin = async () => {
    await login({ 
      email: 'user@example.com', 
      password: 'password' 
    });
  };
  
  if (isAuthenticated) {
    return <div>Welcome {user?.name}!</div>;
  }
  
  return <button onClick={handleLogin}>Login</button>;
}
```

## Use Cases

### Single Authenticated API

```typescript
const api = axios.create({ baseURL: 'https://api.app.com' });

const authStore = getAuthStore('main', {
  axios: api,
  loginUrl: '/login',
  logoutUrl: '/logout',
  getUserUrl: '/me',
  extractToken: (data) => data.token,
});

// All requests using this axios instance will be authenticated
```

### Multiple APIs with Different Authentication

```typescript
const internalApi = axios.create({ baseURL: 'https://internal.app.com' });
const partnerApi = axios.create({ baseURL: 'https://partner.api.com' });

// Internal API uses Token authentication
const internalAuth = getAuthStore('internal', {
  axios: internalApi,
  loginUrl: '/login',
  extractToken: (data) => data.token,
  formatAuthHeader: (token) => `Token ${token}`,
});

// Partner API uses Bearer authentication
const partnerAuth = getAuthStore('partner', {
  axios: partnerApi,
  loginUrl: '/oauth/token',
  extractToken: (data) => data.access_token,
  formatAuthHeader: (token) => `Bearer ${token}`,
});
```

### Custom Storage Configuration

```typescript
const authStore = getAuthStore('main', {
  axios: api,
  loginUrl: '/login',
  logoutUrl: '/logout',
  extractToken: (data) => data.token,
  persistence: {
    enabled: true,
    storage: sessionStorage, // Use sessionStorage instead of localStorage
    tokenKey: 'auth_token',
    userKey: 'auth_user',
  },
});
```

### SSR/No Persistence

```typescript
const authStore = getAuthStore('main', {
  axios: api,
  loginUrl: '/login',
  logoutUrl: '/logout',
  extractToken: (data) => data.token,
  persistence: {
    enabled: false, // Disable persistence for SSR
  },
});
```

## Integration with zustand-crud-registry

Works seamlessly with [@jasperoosthoek/zustand-crud-registry](https://github.com/jasperoosthoek/zustand-crud-registry):

```typescript
import { createStoreRegistry } from '@jasperoosthoek/zustand-crud-registry';
import { createAuthRegistry } from '@jasperoosthoek/zustand-auth-registry';

// Shared axios instance
const api = axios.create({ baseURL: 'https://api.example.com' });

// Auth manages authentication
const auth = getAuthStore('main', { axios: api, ... });

// CRUD uses the same authenticated axios
const getCrudStore = createStoreRegistry<{ user: User; post: Post }>();
const users = getCrudStore('user', { axios: api, route: '/users' });

// Login first, then use CRUD
const { login } = useAuth(auth);
const { list, getList } = useCrud(users);

await login({ email: '...', password: '...' });
await getList(); // Authenticated request
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
  loginUrl: string;
  logoutUrl: string;
  extractToken: (data: any) => string;
  
  // Optional
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
```

### `useAuth(store)`

React hook for authentication actions.

**Returns:**
```typescript
{
  login: (credentials: Record<string, string>, callback?: () => void) => Promise<void>;
  logout: () => Promise<void>;
  getCurrentUser: () => Promise<void>;
}
```

### Auth Store State

Access auth state using the store:

```typescript
const { user, token, isAuthenticated } = authStore((s) => s);
```

**State:**
- `user: U | null` - Current user object
- `token: string` - Authentication token
- `isAuthenticated: boolean` - Whether user is authenticated

**Actions:**
- `setToken(token: string)` - Set authentication token
- `setUser(user: U)` - Set user object
- `unsetUser()` - Clear user and token (logout)

## Development

See [SETUP.md](./SETUP.md) for detailed setup and development instructions.

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm test

# Coverage
npm run test:coverage
```

## Related Projects

- [@jasperoosthoek/zustand-crud-registry](https://github.com/jasperoosthoek/zustand-crud-registry) - CRUD operations for REST APIs

## License

MIT

## Author

Jasper Oosthoek
