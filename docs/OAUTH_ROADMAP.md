# OAuth 2.0 Implementation Roadmap

## Current Status (Phase 1: Complete)

The `zustand-auth-registry` has been successfully upgraded to OAuth 2.0 compliance while maintaining 100% backward compatibility. All 67 tests pass, confirming both new OAuth features and existing functionality work correctly.

### Implemented Features (v2.0.0)

| Feature | Status | Implementation |
|---------|--------|----------------|
| **OAuth 2.0 Token Structure** | ✅ Complete | `TokenData` with `accessToken`, `refreshToken`, `expiresAt`, `tokenType`, `scope` |
| **Bearer Authorization Headers** | ✅ Complete | Standard `Bearer` default, configurable token types |
| **Token Lifecycle Management** | ✅ Complete | Automatic expiration detection, refresh workflows |
| **Auto-Refresh Capability** | ✅ Complete | Configurable threshold, automatic token renewal |
| **Backward Compatibility** | ✅ Complete | Legacy patterns work unchanged, zero breaking changes |
| **Flexible Endpoint Support** | ✅ Complete | OAuth (`tokenUrl`) and legacy (`loginUrl`) endpoints |
| **Industry Standard Defaults** | ✅ Complete | Bearer tokens, OAuth field names, standard persistence keys |

## Future Roadmap

### Phase 2: Advanced OAuth Features (v2.1.0)

#### PKCE Support
Proof Key for Code Exchange for Single Page Applications:
```typescript
export class OAuth2PKCEStrategy<U> extends OAuth2Strategy<U> {
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
  
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}
```

#### Multiple Grant Types
Support for Authorization Code and Client Credentials flows:
```typescript
export interface AuthStrategy<U> {
  login(credentials: any): Promise<TokenData>;
  refresh(refreshToken: string): Promise<TokenData>;
  revoke(token: string): Promise<void>;
  getUserInfo(token: string): Promise<U>;
  formatAuthHeader(token: string): string;
}

// Authorization Code Grant
export class AuthorizationCodeStrategy<U> implements AuthStrategy<U> {
  async login(authCode: string, codeVerifier?: string): Promise<TokenData> {
    const response = await this.config.axios.post(this.config.tokenUrl, {
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      code_verifier: codeVerifier // PKCE
    });
    
    return this.extractTokenData(response.data);
  }
}

// Client Credentials Grant
export class ClientCredentialsStrategy<U> implements AuthStrategy<U> {
  async login(): Promise<TokenData> {
    const response = await this.config.axios.post(this.config.tokenUrl, {
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: this.config.scope?.join(' ')
    });
    
    return this.extractTokenData(response.data);
  }
}
```

#### Scope Management
Fine-grained permission handling:
```typescript
export type TokenData = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
  scope?: string[];
  // New scope management
  grantedScopes?: string[];
  requestedScopes?: string[];
};

export const useScopeValidation = (requiredScopes: string[]) => {
  const { tokens } = authStore((s) => s);
  
  const hasScope = (scope: string): boolean => {
    return tokens?.grantedScopes?.includes(scope) ?? false;
  };
  
  const hasAllScopes = (scopes: string[]): boolean => {
    return scopes.every(scope => hasScope(scope));
  };
  
  const hasAnyScope = (scopes: string[]): boolean => {
    return scopes.some(scope => hasScope(scope));
  };
  
  return { hasScope, hasAllScopes, hasAnyScope };
};
```

#### JWT Validation
Built-in token verification:
```typescript
export class JWTValidator {
  constructor(private config: JWTConfig) {}
  
  async validateToken(token: string): Promise<boolean> {
    try {
      const [header, payload, signature] = token.split('.');
      const decodedHeader = JSON.parse(atob(header));
      const decodedPayload = JSON.parse(atob(payload));
      
      // Verify expiration
      if (decodedPayload.exp && Date.now() >= decodedPayload.exp * 1000) {
        return false;
      }
      
      // Verify signature (if public key provided)
      if (this.config.publicKey) {
        return await this.verifySignature(token, this.config.publicKey);
      }
      
      return true;
    } catch {
      return false;
    }
  }
  
  private async verifySignature(token: string, publicKey: string): Promise<boolean> {
    // Implementation using Web Crypto API
    // ...
  }
}
```

#### OpenID Connect Support
Standard identity layer:
```typescript
export interface OIDCConfig extends OAuth2Config {
  issuer: string;
  userInfoEndpoint: string;
  jwksUri: string;
}

export class OIDCStrategy<U> extends OAuth2Strategy<U> {
  async getUserInfo(accessToken: string): Promise<U> {
    const response = await this.config.axios.get(this.config.userInfoEndpoint, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    return this.mapOIDCUserInfo(response.data);
  }
  
  private mapOIDCUserInfo(oidcUser: any): U {
    // Map standard OIDC claims to user type
    return {
      id: oidcUser.sub,
      email: oidcUser.email,
      name: oidcUser.name,
      picture: oidcUser.picture,
      // ... other standard claims
    } as U;
  }
}
```

### Phase 3: Enterprise Features (v2.2.0)

#### Multi-tenant Support
Organization-specific authentication:
```typescript
export interface TenantConfig {
  tenantId: string;
  issuer: string;
  clientId: string;
  scope: string[];
}

export const createTenantRegistry = <Models extends Record<string, any>>(
  tenants: Record<string, TenantConfig>
) => {
  return (tenantId: string) => {
    const config = tenants[tenantId];
    if (!config) throw new Error(`Unknown tenant: ${tenantId}`);
    
    return createAuthRegistry<Models>(new OAuth2Strategy(config));
  };
};
```

#### Encrypted Storage
Secure token persistence:
```typescript
export interface SecureStorage {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
}

export class EncryptedStorage implements SecureStorage {
  constructor(private encryptionKey: CryptoKey) {}
  
  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(value);
    localStorage.setItem(key, encrypted);
  }
  
  async getItem(key: string): Promise<string | null> {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;
    
    try {
      return await this.decrypt(encrypted);
    } catch {
      return null;
    }
  }
  
  private async encrypt(value: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      data
    );
    
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  }
  
  private async decrypt(encryptedValue: string): Promise<string> {
    const combined = new Uint8Array(
      atob(encryptedValue).split('').map(c => c.charCodeAt(0))
    );
    
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      encrypted
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }
}
```

#### Token Binding
Enhanced security for sensitive applications:
```typescript
export interface TokenBindingConfig {
  bindToDevice?: boolean;
  bindToSession?: boolean;
  bindToOrigin?: boolean;
}

export class TokenBindingValidator {
  constructor(private config: TokenBindingConfig) {}
  
  async bindToken(token: string): Promise<string> {
    const binding = await this.generateBinding();
    return `${token}.${binding}`;
  }
  
  async validateBinding(boundToken: string): Promise<boolean> {
    const [token, binding] = boundToken.split('.');
    const expectedBinding = await this.generateBinding();
    return binding === expectedBinding;
  }
  
  private async generateBinding(): Promise<string> {
    const factors: string[] = [];
    
    if (this.config.bindToDevice && 'userAgentData' in navigator) {
      factors.push(navigator.userAgent);
    }
    
    if (this.config.bindToOrigin) {
      factors.push(window.location.origin);
    }
    
    if (this.config.bindToSession) {
      factors.push(sessionStorage.getItem('session-id') || '');
    }
    
    const combined = factors.join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);
    const hash = await crypto.subtle.digest('SHA-256', data);
    
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
  }
}
```

#### Audit Logging
Authentication event tracking:
```typescript
export interface AuthEvent {
  type: 'login' | 'logout' | 'refresh' | 'error';
  timestamp: number;
  userId?: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
}

export class AuthAuditor {
  constructor(private config: { endpoint: string; batchSize: number }) {}
  
  private events: AuthEvent[] = [];
  
  logEvent(event: Omit<AuthEvent, 'timestamp' | 'sessionId'>): void {
    this.events.push({
      ...event,
      timestamp: Date.now(),
      sessionId: this.getSessionId(),
    });
    
    if (this.events.length >= this.config.batchSize) {
      this.flush();
    }
  }
  
  async flush(): Promise<void> {
    if (this.events.length === 0) return;
    
    const events = [...this.events];
    this.events = [];
    
    try {
      await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(events),
      });
    } catch (error) {
      // Re-queue events on failure
      this.events.unshift(...events);
    }
  }
  
  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('auth-session-id');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('auth-session-id', sessionId);
    }
    return sessionId;
  }
}
```

#### Rate Limiting
Built-in request throttling:
```typescript
export class AuthRateLimiter {
  private attempts: Map<string, number[]> = new Map();
  
  constructor(
    private config: {
      maxAttempts: number;
      windowMs: number;
      blockDurationMs: number;
    }
  ) {}
  
  async checkLimit(identifier: string): Promise<boolean> {
    const now = Date.now();
    const attempts = this.attempts.get(identifier) || [];
    
    // Remove old attempts outside the window
    const validAttempts = attempts.filter(
      timestamp => now - timestamp < this.config.windowMs
    );
    
    if (validAttempts.length >= this.config.maxAttempts) {
      return false; // Rate limited
    }
    
    // Record this attempt
    validAttempts.push(now);
    this.attempts.set(identifier, validAttempts);
    
    return true;
  }
  
  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }
}
```

## Migration Strategy

### Phase 1 to Phase 2
1. Existing OAuth 2.0 implementation continues to work
2. Add new grant type strategies as optional plugins
3. Enhance existing token structure with scope support
4. Add PKCE support for SPA environments

### Phase 2 to Phase 3
1. Add enterprise features as optional modules
2. Provide secure storage implementations
3. Add audit logging capabilities
4. Implement multi-tenant support

## Implementation Priority

### High Priority Features
- PKCE Support (essential for SPAs)
- Authorization Code Grant (most common OAuth flow)
- Scope Management (security requirement)

### Medium Priority Features
- JWT Validation (common token format)
- Client Credentials Grant (service-to-service auth)
- Basic Audit Logging

### Low Priority Features
- Multi-tenant Support (enterprise feature)
- Token Binding (high-security environments)
- Encrypted Storage (sensitive applications)

This roadmap provides a clear path for expanding the OAuth 2.0 implementation while maintaining backward compatibility and following industry standards.