import { getAuthBackend } from '@/services/backend';
import { UserPlan } from '@/types/quota';

interface Token {
  plan: UserPlan;
  storage_usage_bytes: number;
  storage_purchased_bytes: number;
  [key: string]: string | number;
}

// Payment/subscription has been removed.
// All users are treated as the highest entitlement with no quotas.
const UNLIMITED_PLAN: UserPlan = 'pro';
const UNLIMITED_QUOTA = Number.MAX_SAFE_INTEGER;

export const getSubscriptionPlan = (token: string): UserPlan => {
  void token;
  return UNLIMITED_PLAN;
};

export const getUserProfilePlan = (token: string): UserPlan => {
  void token;
  return UNLIMITED_PLAN;
};

export const STORAGE_QUOTA_GRACE_BYTES = 10 * 1024 * 1024; // 10 MB grace

export const getStoragePlanData = (token: string) => {
  const data = (getAuthBackend().decodeClaims(token) as Partial<Token>) || {};
  const usage = Number(data['storage_usage_bytes'] || 0);
  const quota = UNLIMITED_QUOTA;

  return {
    plan: UNLIMITED_PLAN,
    usage,
    quota,
  };
};

export const getTranslationPlanData = (token: string) => {
  void token;
  const usage = 0;
  const quota = UNLIMITED_QUOTA;

  return {
    plan: UNLIMITED_PLAN,
    usage,
    quota,
  };
};

export const getDailyTranslationPlanData = (token: string) => {
  void token;
  const quota = UNLIMITED_QUOTA;

  return {
    plan: UNLIMITED_PLAN,
    quota,
  };
};

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

  const token = authHeader.replace('Bearer ', '');
  const user = await getAuthBackend().getUserFromAccessToken(token);
  if (!user) return {};
  return { user, token };
};
