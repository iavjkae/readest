'use client';

import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import posthog from 'posthog-js';
import { getAuthBackend } from '@/services/backend';
import type { AuthSession, AuthUser } from '@/services/backend/types';

export type AppUser = AuthUser;

interface AuthContextType {
  token: string | null;
  user: AppUser | null;
  login: (
    token: string,
    user: AppUser,
    options?: { refreshToken?: string; csrfToken?: string },
  ) => void;
  logout: () => void;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token');
    }
    return null;
  });
  const [user, setUser] = useState<AppUser | null>(() => {
    if (typeof window !== 'undefined') {
      const userJson = localStorage.getItem('user');
      return userJson ? JSON.parse(userJson) : null;
    }
    return null;
  });

  useEffect(() => {
    const authBackend = getAuthBackend();

    const syncSession = (session: AuthSession | null) => {
      if (session) {
        const { accessToken, refreshToken, csrfToken, user } = session;
        localStorage.setItem('token', accessToken);
        if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
        if (csrfToken) localStorage.setItem('csrf_token', csrfToken);
        localStorage.setItem('user', JSON.stringify(user));
        posthog.identify(user.id);
        setToken(accessToken);
        setUser(user);
        return;
      }

      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('csrf_token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
    };

    let unsubscribe: (() => void) | undefined;

    authBackend
      .onAuthStateChange(syncSession)
      .then((fn) => {
        unsubscribe = fn;
      })
      .catch(() => {
        // If remote session cannot be established, fall back to local state.
      });

    authBackend.refreshSession().catch(() => {
      // Only clear session when we have no access token.
      if (!localStorage.getItem('token')) {
        syncSession(null);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const login = (
    newToken: string,
    newUser: AppUser,
    options?: { refreshToken?: string; csrfToken?: string },
  ) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));

    if (options?.refreshToken) {
      localStorage.setItem('refresh_token', options.refreshToken);
    }
    if (options?.csrfToken) {
      localStorage.setItem('csrf_token', options.csrfToken);
    }
  };

  const logout = async () => {
    try {
      await getAuthBackend().logout();
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('csrf_token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
    }
  };

  const refresh = async () => {
    try {
      await getAuthBackend().refreshSession();
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
