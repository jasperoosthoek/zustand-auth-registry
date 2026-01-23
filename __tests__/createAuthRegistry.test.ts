import { createAuthRegistry } from '../src/createAuthRegistry';
import { TestUser, createMockAxios } from './testHelpers';
import { testConfigs } from './testUtils';

describe('createAuthRegistry', () => {
  interface TestModels {
    main: TestUser;
    admin: TestUser;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a registry function', () => {
    const getAuthStore = createAuthRegistry<TestModels>();
    expect(typeof getAuthStore).toBe('function');
  });

  describe('store creation', () => {
    it('should create stores with correct configuration', () => {
      const getAuthStore = createAuthRegistry<TestModels>();
      const mockAxios = createMockAxios();

      const config = {
        axios: mockAxios,
        loginUrl: '/auth/login',
        logoutUrl: '/auth/logout',
        getUserUrl: '/auth/me',
      };

      const store = getAuthStore('main', config);

      expect(store).toBeDefined();
      expect(store.config).toBeDefined();
      expect(store.config.axios).toBe(mockAxios);
      expect(store.config.loginUrl).toBe('/auth/login');
      expect(store.config.logoutUrl).toBe('/auth/logout');
      expect(store.config.getUserUrl).toBe('/auth/me');
      expect(typeof store.config.extractTokens).toBe('function');
    });

    it('should return same store instance for same key', () => {
      const getAuthStore = createAuthRegistry<TestModels>();
      const config = testConfigs.basic;

      const store1 = getAuthStore('main', config);
      const store2 = getAuthStore('main', config);

      expect(store1).toBe(store2);
    });

    it('should create different stores for different keys', () => {
      const getAuthStore = createAuthRegistry<TestModels>();
      const config = testConfigs.basic;

      const mainStore = getAuthStore('main', config);
      const adminStore = getAuthStore('admin', config);

      expect(mainStore).not.toBe(adminStore);
      expect(mainStore.config.loginUrl).toBe(adminStore.config.loginUrl);
      expect(mainStore.config.logoutUrl).toBe(adminStore.config.logoutUrl);
    });

    it('should validate config before store creation', () => {
      const getAuthStore = createAuthRegistry<TestModels>();

      expect(() => {
        getAuthStore('main', {
          loginUrl: '/login',
          logoutUrl: '/logout',
        } as any);
      }).toThrow('AuthConfig: axios instance is required');
    });
  });

  describe('store functionality', () => {
    it('should create store with initial empty state', () => {
      const getAuthStore = createAuthRegistry<TestModels>();
      const store = getAuthStore('main', testConfigs.basic);

      const state = store.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBe('');
      expect(state.isAuthenticated).toBe(false);
    });

    it('should create store with working setters', () => {
      const getAuthStore = createAuthRegistry<TestModels>();
      const store = getAuthStore('main', testConfigs.basic);

      const { setToken, setUser } = store.getState();
      
      expect(typeof setToken).toBe('function');
      expect(typeof setUser).toBe('function');
      expect(typeof store.getState().unsetUser).toBe('function');
    });

    it('should create store with config attached', () => {
      const getAuthStore = createAuthRegistry<TestModels>();
      const config = testConfigs.basic;
      const store = getAuthStore('main', config);

      expect(store.config).toBeDefined();
      expect(store.config.loginUrl).toBe(config.loginUrl);
      expect(store.config.persistence.enabled).toBe(false); // Persistence disabled by default
    });
  });

  describe('type safety', () => {
    it('should enforce correct model types for keys', () => {
      const getAuthStore = createAuthRegistry<TestModels>();
      const config = testConfigs.basic;

      // These should compile without errors
      const mainStore = getAuthStore('main', config);
      const adminStore = getAuthStore('admin', config);

      expect(mainStore).toBeDefined();
      expect(adminStore).toBeDefined();
    });

    it('should support multiple user types in same registry', () => {
      interface MultiModel {
        user: TestUser;
        admin: TestUser & { permissions: string[] };
      }

      const getAuthStore = createAuthRegistry<MultiModel>();
      const config = testConfigs.basic;

      const userStore = getAuthStore('user', config);
      const adminStore = getAuthStore('admin', config);

      expect(userStore).not.toBe(adminStore);
      expect(typeof userStore.getState().setUser).toBe('function');
      expect(typeof adminStore.getState().setUser).toBe('function');
    });
  });

  describe('config validation integration', () => {
    it('should apply default persistence settings', () => {
      const getAuthStore = createAuthRegistry<TestModels>();
      const config = {
        axios: createMockAxios(),
        loginUrl: '/login',
        logoutUrl: '/logout',
      };

      const store = getAuthStore('main', config);

      // Persistence is disabled by default
      expect(store.config.persistence.enabled).toBe(false);
      // But default keys are still set for when persistence is enabled
      expect(store.config.persistence.tokenKey).toBe('token');
      expect(store.config.persistence.userKey).toBe('user');
    });

    it('should apply default auth header format', () => {
      const getAuthStore = createAuthRegistry<TestModels>();
      const store = getAuthStore('main', testConfigs.basic);

      const headerValue = store.config.formatAuthHeader('test-token');
      expect(headerValue).toBe('Bearer test-token');
    });

    it('should preserve custom configurations', () => {
      const getAuthStore = createAuthRegistry<TestModels>();
      const store = getAuthStore('main', testConfigs.withTokenFormat);

      const headerValue = store.config.formatAuthHeader('test-token');
      expect(headerValue).toBe('Token test-token');
    });
  });

  describe('registry isolation', () => {
    it('should isolate different registry instances', () => {
      const registry1 = createAuthRegistry<TestModels>();
      const registry2 = createAuthRegistry<TestModels>();

      const store1 = registry1('main', testConfigs.basic);
      const store2 = registry2('main', testConfigs.basic);

      expect(store1).not.toBe(store2);
    });

    it('should maintain store state independently', () => {
      const getAuthStore = createAuthRegistry<TestModels>();
      
      const mainStore = getAuthStore('main', testConfigs.basic);
      const adminStore = getAuthStore('admin', testConfigs.basic);

      // Set user in main store
      mainStore.getState().setUser({ id: 1, email: 'main@test.com', name: 'Main User' });

      // Admin store should remain empty
      expect(mainStore.getState().user).not.toBeNull();
      expect(adminStore.getState().user).toBeNull();
    });
  });
});