# Changelog

##### Version 0.0.1
- Initial release
- `createAuthRegistry` for type-safe auth store management
- `useAuth` hook with `login`, `logout`, `getCurrentUser`, `refreshTokens`, `checkAuth`
- `AuthError` class with typed error codes (`AuthErrorCode`)
- `createAuthError()` helper for converting axios errors
- Cookie-based authentication with CSRF support
- Token extraction with OAuth 2.0 (`access_token`) and simple (`token`) format support
- Flexible `extractUser` option (function or string key)
- Persistence to localStorage/sessionStorage
- Auto-refresh with configurable threshold
- Full TypeScript support with generics

##### Version 0.0.1
