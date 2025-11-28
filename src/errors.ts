/**
 * Authentication error codes
 */
export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  REFRESH_FAILED = 'REFRESH_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  CSRF_TOKEN_MISSING = 'CSRF_TOKEN_MISSING',
  FORBIDDEN = 'FORBIDDEN',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Typed authentication error
 */
export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    public originalError?: any,
    message?: string
  ) {
    super(message || code);
    this.name = 'AuthError';

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }

  /**
   * Convert error to JSON (excludes originalError in production)
   */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      name: this.name,
    };
  }

  /**
   * Check if error is an AuthError
   */
  static isAuthError(error: any): error is AuthError {
    return error instanceof AuthError;
  }
}

/**
 * Create typed AuthError from any error
 */
export function createAuthError(error: any): AuthError {
  if (AuthError.isAuthError(error)) {
    return error;
  }

  // Axios error
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;

    switch (status) {
      case 401:
        // Check if it's an expired token
        if (data?.detail?.toLowerCase().includes('expired') ||
            data?.message?.toLowerCase().includes('expired')) {
          return new AuthError(AuthErrorCode.TOKEN_EXPIRED, error, 'Token has expired');
        }
        if (data?.detail?.toLowerCase().includes('invalid') ||
            data?.detail?.toLowerCase().includes('credentials')) {
          return new AuthError(AuthErrorCode.INVALID_CREDENTIALS, error, 'Invalid credentials');
        }
        return new AuthError(AuthErrorCode.UNAUTHORIZED, error, 'Unauthorized');

      case 403:
        if (data?.detail?.toLowerCase().includes('csrf')) {
          return new AuthError(AuthErrorCode.CSRF_TOKEN_MISSING, error, 'CSRF token missing or invalid');
        }
        return new AuthError(AuthErrorCode.FORBIDDEN, error, 'Access forbidden');

      case 404:
        if (data?.detail?.toLowerCase().includes('user')) {
          return new AuthError(AuthErrorCode.USER_NOT_FOUND, error, 'User not found');
        }
        return new AuthError(AuthErrorCode.UNKNOWN, error, 'Resource not found');

      default:
        return new AuthError(AuthErrorCode.UNKNOWN, error, `HTTP ${status} error`);
    }
  }

  // Network error (no response received)
  if (error.request) {
    return new AuthError(AuthErrorCode.NETWORK_ERROR, error, 'Network error - no response received');
  }

  // Other errors
  return new AuthError(AuthErrorCode.UNKNOWN, error, error.message || 'Unknown error');
}
