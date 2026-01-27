# Changelog

##### Version 0.0.2
- **BREAKING**: Remove `token` and `setToken` - use `tokens?.accessToken` and `setBearerToken`/`setTokens` instead
- New `setBearerToken(token)` convenience method for simple Bearer token auth
- Remove `/docs` folder - README.md is the single source of truth

##### Version 0.0.1
- Initial release
- `createAuthRegistry` for type-safe auth store management
- `useAuth` hook with `login`, `logout`, `getCurrentUser`, `refresh`, `checkAuth`
- `AuthError` class with typed error codes (`AuthErrorCode`)
- `createAuthError()` helper for converting axios errors
- Cookie-based authentication with CSRF support
- `extractTokens` for structured token data (access token, refresh token, expiry)
- `extractUser` option (function or string key) to extract user from responses
- Persistence to localStorage/sessionStorage
- Auto-refresh with configurable threshold (`autoRefresh`, `refreshThreshold`)
- Full TypeScript support with generics
