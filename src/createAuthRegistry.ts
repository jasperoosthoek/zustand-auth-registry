import { AuthConfig, validateAuthConfig } from './authConfig';
import { createAuthStore, AuthStore } from './authStore';

export function createAuthRegistry<AuthModels extends Record<string, any>>() {
  const registry: Record<string, AuthStore<any>> = {};

  function getAuthStore<K extends keyof AuthModels>(
    key: K,
    config: AuthConfig<AuthModels[K]>
  ): AuthStore<AuthModels[K]> {
    const stringKey = String(key);
    
    if (!registry[stringKey]) {
      const validatedConfig = validateAuthConfig(config);
      registry[stringKey] = createAuthStore(validatedConfig);
    }
    
    return registry[stringKey];
  }

  return getAuthStore;
}
