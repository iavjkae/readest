import { getAuthBackend } from '@/services/backend';

export const getAccessToken = async (): Promise<string | null> => {
  // In browser context there might be multiple auth contexts (e.g. app router + pages router)
  // and they might have different sessions, making the access token invalid for API calls.
  // In that case we should use localStorage.
  if (typeof window !== 'undefined') {
    // Keep browser behavior consistent across backends.
    return localStorage.getItem('token') ?? null;
  }

  // Server-side fallback (used rarely; most server routes use Authorization header).
  const session = await getAuthBackend().getSession();
  return session?.accessToken ?? null;
};

export const getUserID = async (): Promise<string | null> => {
  if (typeof window !== 'undefined') {
    const user = localStorage.getItem('user') ?? '{}';
    return JSON.parse(user).id ?? null;
  }

  const session = await getAuthBackend().getSession();
  return session?.user?.id ?? null;
};

export const validateUserAndToken = async (authHeader: string | null | undefined) => {
  if (!authHeader) return {};

  const trimmed = authHeader.trim();
  const match = trimmed.match(/^Bearer\s+(.+)$/i);
  const token = (match?.[1] ?? trimmed).trim();
  const user = await getAuthBackend().getUserFromAccessToken(token);
  if (!user) return {};
  return { user, token };
};

