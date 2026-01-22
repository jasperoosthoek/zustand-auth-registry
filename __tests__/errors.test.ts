import { AuthError, AuthErrorCode, createAuthError } from '../src/errors';
import { createAxiosError } from './testUtils';

describe('AuthError', () => {
  describe('constructor', () => {
    it('should create error with code and message', () => {
      const error = new AuthError(
        AuthErrorCode.UNAUTHORIZED,
        undefined,
        'Custom message'
      );

      expect(error.code).toBe(AuthErrorCode.UNAUTHORIZED);
      expect(error.message).toBe('Custom message');
      expect(error.name).toBe('AuthError');
    });

    it('should use code as message if no message provided', () => {
      const error = new AuthError(AuthErrorCode.TOKEN_EXPIRED);

      expect(error.message).toBe(AuthErrorCode.TOKEN_EXPIRED);
    });

    it('should store original error', () => {
      const originalError = new Error('Original');
      const error = new AuthError(
        AuthErrorCode.UNKNOWN,
        originalError,
        'Wrapped'
      );

      expect(error.originalError).toBe(originalError);
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON without originalError', () => {
      const originalError = new Error('Original');
      const authError = new AuthError(
        AuthErrorCode.UNAUTHORIZED,
        originalError,
        'Custom message'
      );

      const json = authError.toJSON();

      expect(json).toEqual({
        code: AuthErrorCode.UNAUTHORIZED,
        message: 'Custom message',
        name: 'AuthError'
      });
      expect(json).not.toHaveProperty('originalError');
    });
  });

  describe('isAuthError', () => {
    it('should identify AuthError instances', () => {
      const authError = new AuthError(AuthErrorCode.UNAUTHORIZED);
      const regularError = new Error('Regular error');

      expect(AuthError.isAuthError(authError)).toBe(true);
      expect(AuthError.isAuthError(regularError)).toBe(false);
    });
  });
});

describe('createAuthError', () => {
  describe('AuthError passthrough', () => {
    it('should return AuthError as-is', () => {
      const authError = new AuthError(AuthErrorCode.TOKEN_EXPIRED);
      const result = createAuthError(authError);

      expect(result).toBe(authError);
    });
  });

  describe('401 Unauthorized errors', () => {
    it('should detect TOKEN_EXPIRED from 401 with expired in detail', () => {
      const axiosError = createAxiosError('Unauthorized', 401);
      axiosError.response.data = { detail: 'Token has expired' };

      const authError = createAuthError(axiosError);

      expect(authError.code).toBe(AuthErrorCode.TOKEN_EXPIRED);
      expect(authError.message).toBe('Token has expired');
      expect(authError.originalError).toBe(axiosError);
    });

    it('should detect TOKEN_EXPIRED from 401 with expired in message', () => {
      const axiosError = createAxiosError('Expired', 401);
      axiosError.response.data = { message: 'Session expired please login' };

      const authError = createAuthError(axiosError);

      expect(authError.code).toBe(AuthErrorCode.TOKEN_EXPIRED);
      expect(authError.message).toBe('Token has expired');
    });

    it('should detect INVALID_CREDENTIALS from 401 with invalid in detail', () => {
      const axiosError = createAxiosError('Unauthorized', 401);
      axiosError.response.data = { detail: 'Invalid username or password' };

      const authError = createAuthError(axiosError);

      expect(authError.code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
      expect(authError.message).toBe('Invalid credentials');
    });

    it('should detect INVALID_CREDENTIALS from 401 with credentials in detail', () => {
      const axiosError = createAxiosError('Unauthorized', 401);
      axiosError.response.data = { detail: 'Bad credentials' };

      const authError = createAuthError(axiosError);

      expect(authError.code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
    });

    it('should fallback to UNAUTHORIZED for generic 401', () => {
      const axiosError = createAxiosError('Unauthorized', 401);
      axiosError.response.data = { detail: 'Not authorized' };

      const authError = createAuthError(axiosError);

      expect(authError.code).toBe(AuthErrorCode.UNAUTHORIZED);
      expect(authError.message).toBe('Unauthorized');
    });
  });

  describe('403 Forbidden errors', () => {
    it('should detect CSRF_TOKEN_MISSING from 403 with csrf in detail', () => {
      const axiosError = createAxiosError('Forbidden', 403);
      axiosError.response.data = { detail: 'CSRF verification failed' };

      const authError = createAuthError(axiosError);

      expect(authError.code).toBe(AuthErrorCode.CSRF_TOKEN_MISSING);
      expect(authError.message).toBe('CSRF token missing or invalid');
      expect(authError.originalError).toBe(axiosError);
    });

    it('should fallback to FORBIDDEN for generic 403', () => {
      const axiosError = createAxiosError('Forbidden', 403);
      axiosError.response.data = { detail: 'Access denied' };

      const authError = createAuthError(axiosError);

      expect(authError.code).toBe(AuthErrorCode.FORBIDDEN);
      expect(authError.message).toBe('Access forbidden');
    });
  });

  describe('404 Not Found errors', () => {
    it('should detect USER_NOT_FOUND from 404 with user in detail', () => {
      const axiosError = createAxiosError('Not Found', 404);
      axiosError.response.data = { detail: 'User not found in database' };

      const authError = createAuthError(axiosError);

      expect(authError.code).toBe(AuthErrorCode.USER_NOT_FOUND);
      expect(authError.message).toBe('User not found');
      expect(authError.originalError).toBe(axiosError);
    });

    it('should fallback to UNKNOWN for generic 404', () => {
      const axiosError = createAxiosError('Not Found', 404);
      axiosError.response.data = { detail: 'Resource not available' };

      const authError = createAuthError(axiosError);

      expect(authError.code).toBe(AuthErrorCode.UNKNOWN);
      expect(authError.message).toBe('Resource not found');
    });
  });

  describe('Network errors', () => {
    it('should detect NETWORK_ERROR when no response received', () => {
      const networkError: any = new Error('Network error');
      networkError.request = {}; // Request was made but no response

      const authError = createAuthError(networkError);

      expect(authError.code).toBe(AuthErrorCode.NETWORK_ERROR);
      expect(authError.message).toBe('Network error - no response received');
      expect(authError.originalError).toBe(networkError);
    });
  });

  describe('Other HTTP status codes', () => {
    it('should handle 500 errors as UNKNOWN', () => {
      const axiosError = createAxiosError('Server Error', 500);

      const authError = createAuthError(axiosError);

      expect(authError.code).toBe(AuthErrorCode.UNKNOWN);
      expect(authError.message).toBe('HTTP 500 error');
    });

    it('should handle 400 errors as UNKNOWN', () => {
      const axiosError = createAxiosError('Bad Request', 400);

      const authError = createAuthError(axiosError);

      expect(authError.code).toBe(AuthErrorCode.UNKNOWN);
      expect(authError.message).toBe('HTTP 400 error');
    });
  });

  describe('Generic errors', () => {
    it('should handle Error objects with message', () => {
      const error = new Error('Something went wrong');

      const authError = createAuthError(error);

      expect(authError.code).toBe(AuthErrorCode.UNKNOWN);
      expect(authError.message).toBe('Something went wrong');
      expect(authError.originalError).toBe(error);
    });

    it('should handle errors without message', () => {
      const error = {};

      const authError = createAuthError(error);

      expect(authError.code).toBe(AuthErrorCode.UNKNOWN);
      expect(authError.message).toBe('Unknown error');
    });
  });
});
