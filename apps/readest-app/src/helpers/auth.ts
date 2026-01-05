import type { AppUser } from '@/context/AuthContext';
import { getAuthBackend } from '@/services/backend';

interface UseAuthCallbackOptions {
  accessToken?: string | null;
  refreshToken?: string | null;
  login: (
    accessToken: string,
    user: AppUser,
    options?: { refreshToken?: string; csrfToken?: string },
  ) => void;
  navigate: (path: string) => void;
  type?: string | null;
  next?: string;
  error?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
}

export function handleAuthCallback({
  accessToken,
  refreshToken,
  login,
  navigate,
  type,
  next = '/',
  error,
}: UseAuthCallbackOptions) {
  async function finalizeSession() {
    if (error) {
      navigate('/auth/error');
      return;
    }

    if (!accessToken) {
      navigate('/library');
      return;
    }

    const authBackend = getAuthBackend();
    const resolvedUser = await authBackend.getUserFromAccessToken(accessToken);
    const decoded = authBackend.decodeClaims(accessToken);
    const fallbackId =
      (decoded['sub'] as string | undefined) || (decoded['user_id'] as string | undefined);
    const fallbackEmail = (decoded['email'] as string | undefined) ?? null;

    const user: AppUser | null = resolvedUser
      ? (resolvedUser as AppUser)
      : fallbackId
        ? ({ id: fallbackId, email: fallbackEmail } as AppUser)
        : null;

    if (!user?.id) {
      console.error('Error resolving user from auth token');
      navigate('/auth/error');
      return;
    }

    login(accessToken, user, {
      refreshToken: refreshToken ?? undefined,
    });

    if (type === 'recovery') {
      navigate('/auth/recovery');
      return;
    }
    navigate(next);
  }

  finalizeSession();
}
