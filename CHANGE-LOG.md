# Changelog

##### Version 0.1.0
- **BREAKING**: Generic `D` is now data-agnostic — store any shape, not just a user
- Rename `state.user` → `state.data`, `setUser` → `setData`, `unsetUser` → `reset`
- Rename `extractUser` → `extractData`, `getUserUrl` → `dataUrl`, `userKey` → `dataKey`
- Rename `getCurrentUser()` → `fetchData()`
- Default persistence key changed from `'user'` to `'data'`

##### Version 0.0.3
- Automatic `CSRF` token injection via `axios` interceptor for `POST`/`PUT`/`PATCH`/`DELETE` requests

##### Version 0.0.2
- **BREAKING**: Remove `token` and `setToken` - use `tokens?.accessToken` and `setBearerToken`/`setTokens` instead
- New `setBearerToken(token)` convenience method for simple Bearer token auth
- Cookie-based authentication with CSRF support

##### Version 0.0.1
- Initial release
- `createAuthRegistry` for type-safe auth store management
- `useAuth` hook with `login`, `logout`, `getCurrentUser`, `refresh`, `checkAuth`
- `AuthError` class with typed error codes (`AuthErrorCode`)
- `createAuthError()` helper for converting axios errors
- `extractTokens` for structured token data (access token, refresh token, expiry)
- `extractUser` option (function or string key) to extract user from responses
- Persistence to localStorage/sessionStorage
- Auto-refresh with configurable threshold (`autoRefresh`, `refreshThreshold`)
- Full TypeScript support with generics
