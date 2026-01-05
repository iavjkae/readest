import { jwtDecode } from 'jwt-decode';
import type { AuthBackend, AuthSession, AuthUser, Unsubscribe } from './types';
import { allowUnverifiedTrailbaseJwt, getTrailbaseJwtPublicKeyPem } from './trailbaseEnv';

type TrailbaseLoginResponse = {
  auth_token: string;
  refresh_token: string;
  csrf_token: string;
};

type TrailbaseRefreshResponse = {
  auth_token: string;
  csrf_token: string;
};

const STORAGE_KEYS = {
  accessToken: 'token',
  refreshToken: 'refresh_token',
  csrfToken: 'csrf_token',
};

const decodeUserFromToken = (token: string): AuthUser | null => {
  try {
    const claims = jwtDecode<Record<string, unknown>>(token) || {};
    const id = (claims['sub'] as string | undefined) || (claims['user_id'] as string | undefined);
    const email = (claims['email'] as string | undefined) ?? null;

    if (!id) return null;
    return { id, email };
  } catch {
    return null;
  }
};

export class TrailbaseAuthBackend implements AuthBackend {
  readonly kind = 'trailbase' as const;

  async getSession(): Promise<AuthSession | null> {
    if (typeof window === 'undefined') return null;

    const accessToken = localStorage.getItem(STORAGE_KEYS.accessToken) ?? '';
    if (!accessToken) return null;

    const user = decodeUserFromToken(accessToken);
    if (!user) return null;

    return {
      accessToken,
      refreshToken: localStorage.getItem(STORAGE_KEYS.refreshToken) ?? undefined,
      csrfToken: localStorage.getItem(STORAGE_KEYS.csrfToken) ?? undefined,
      user,
    };
  }

  async refreshSession(): Promise<void> {
    if (typeof window === 'undefined') return;

    const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const res = await fetch('/api/trailbase/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      throw new Error('Failed to refresh Trailbase session');
    }

    const data = (await res.json()) as TrailbaseRefreshResponse;
    localStorage.setItem(STORAGE_KEYS.accessToken, data.auth_token);
    localStorage.setItem(STORAGE_KEYS.csrfToken, data.csrf_token);
  }

  async logout(): Promise<void> {
    if (typeof window === 'undefined') return;

    const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
    if (refreshToken) {
      await TrailbaseAuthBackend.logout(refreshToken);
    }
  }

  async getUserFromAccessToken(token: string): Promise<AuthUser | null> {
    // In production, we should verify Trailbase JWT signatures.
    // Trailbase uses ed25519-signed JWTs; provide the public key as SPKI PEM.
    const publicKeyPem = getTrailbaseJwtPublicKeyPem();

    if (!publicKeyPem) {
      if (!allowUnverifiedTrailbaseJwt()) return null;
      return decodeUserFromToken(token);
    }

    try {
      // Lazy import so the dependency is server-only at runtime.
      const jose = await import('jose');
      const key = await jose.importSPKI(publicKeyPem, 'EdDSA');
      const { payload } = await jose.jwtVerify(token, key, { algorithms: ['EdDSA'] });

      const id = (payload.sub as string | undefined) || (payload['user_id'] as string | undefined);
      if (!id) return null;

      const email = (payload['email'] as string | undefined) ?? null;
      return { id, email };
    } catch {
      if (!allowUnverifiedTrailbaseJwt()) return null;
      return decodeUserFromToken(token);
    }
  }

  async onAuthStateChange(handler: (session: AuthSession | null) => void): Promise<Unsubscribe> {
    if (typeof window === 'undefined') {
      handler(null);
      return () => {};
    }

    const emit = async () => {
      handler(await this.getSession());
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.key) return;
      if (
        event.key !== STORAGE_KEYS.accessToken &&
        event.key !== STORAGE_KEYS.refreshToken &&
        event.key !== STORAGE_KEYS.csrfToken
      ) {
        return;
      }
      void emit();
    };

    window.addEventListener('storage', onStorage);
    await emit();

    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }

  decodeClaims(token: string): Record<string, unknown> {
    try {
      return (jwtDecode(token) as Record<string, unknown>) || {};
    } catch {
      return {};
    }
  }

  /**
   * Convenience helpers used by the Trailbase auth UI.
   */
  static async loginWithPassword(email: string, password: string): Promise<TrailbaseLoginResponse> {
    const res = await fetch('/api/trailbase/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || 'Login failed');
    }

    return (await res.json()) as TrailbaseLoginResponse;
  }

  static async registerWithPassword(
    email: string,
    password: string,
    passwordRepeat: string,
  ): Promise<void> {
    const res = await fetch('/api/trailbase/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, password_repeat: passwordRepeat }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || 'Register failed');
    }
  }

  static async requestPasswordReset(email: string): Promise<void> {
    const res = await fetch('/api/trailbase/auth/reset_password/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || 'Reset password request failed');
    }
  }

  static async logout(refreshToken: string): Promise<void> {
    const res = await fetch('/api/trailbase/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      // logout is best-effort; still clear local state
      return;
    }
  }
}
