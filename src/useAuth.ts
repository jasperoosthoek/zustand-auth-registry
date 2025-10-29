import { useEffect } from 'react';
import axios from 'axios';
import { AuthStore } from './authStore';

export function useAuth<U>(store: AuthStore<U>) {
  const { setToken, setUser, unsetUser, token, user } = store();
  const config = store.config;

  useEffect(() => {
    if (token) {
      setAxiosAuth(token);
      try {
        if (!user && config.getUserUrl) {
          getCurrentUser();
        }
      } catch (error: any) {
        if (axios.isAxiosError(error) && error.response?.status === 403) {
          unsetUser();
          setAxiosAuth();
        }
        config.onError?.(error);
      }
    }
  }, []);

  const setAxiosAuth = (token?: string) => {
    if (typeof token !== 'undefined' && token) {
      config.axios.defaults.headers.common['Authorization'] = config.formatAuthHeader(token);
    } else {
      delete config.axios.defaults.headers.common['Authorization'];
    }
  };

  const login = async (
    credentials: Record<string, string>,
    callback?: () => void
  ) => {
    try {
      const res = await config.axios.post(config.loginUrl, credentials);
      const token = config.extractToken(res.data);
      setToken(token);
      setAxiosAuth(token);
      
      if (config.getUserUrl) {
        await getCurrentUser();
      }
      
      if (user) {
        config.onLogin?.(user);
      }
      callback?.();
    } catch (err) {
      unsetUser();
      setAxiosAuth();
      config.onError?.(err);
    }
  };

  const getCurrentUser = async () => {
    if (!config.getUserUrl) return;
    try {
      const res = await config.axios.get<U>(config.getUserUrl);
      setUser(res.data);
    } catch (err) {
      unsetUser();
      setAxiosAuth();
      config.onError?.(err);
    }
  };

  const logout = async () => {
    try {
      await config.axios.post(config.logoutUrl);
    } catch (err) {
      config.onError?.(err);
    } finally {
      unsetUser();
      setAxiosAuth();
      config.onLogout?.();
    }
  };

  return { login, getCurrentUser, logout };
}