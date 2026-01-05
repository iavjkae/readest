import { getAuthBackend } from '@/services/backend';
import { UserPlan } from '@/types/quota';
import { DEFAULT_DAILY_TRANSLATION_QUOTA, DEFAULT_STORAGE_QUOTA } from '@/services/constants';
import { getDailyUsage } from '@/services/translators/utils';

interface Token {
  plan: UserPlan;
  storage_usage_bytes: number;
  storage_purchased_bytes: number;
  [key: string]: string | number;
}

export const getSubscriptionPlan = (token: string): UserPlan => {
  const claims = getAuthBackend().decodeClaims(token) as Partial<Token>;
  return (claims['plan'] as UserPlan) || 'free';
};

export const getUserProfilePlan = (token: string): UserPlan => {
  const claims = getAuthBackend().decodeClaims(token) as Partial<Token>;
  let plan = (claims['plan'] as UserPlan) || 'free';
  if (plan === 'free') {
    const purchasedQuota = Number(claims['storage_purchased_bytes'] || 0);
    if (purchasedQuota > 0) {
      plan = 'purchase';
    }
  }
  return plan;
};

export const STORAGE_QUOTA_GRACE_BYTES = 10 * 1024 * 1024; // 10 MB grace

export const getStoragePlanData = (token: string) => {
  const data = (getAuthBackend().decodeClaims(token) as Partial<Token>) || {};
  const plan = (data['plan'] as UserPlan) || 'free';
  const usage = Number(data['storage_usage_bytes'] || 0);
  const purchasedQuota = Number(data['storage_purchased_bytes'] || 0);
  const fixedQuota = parseInt(process.env['NEXT_PUBLIC_STORAGE_FIXED_QUOTA'] || '0');
  const planQuota = fixedQuota || DEFAULT_STORAGE_QUOTA[plan] || DEFAULT_STORAGE_QUOTA['free'];
  const quota = planQuota + purchasedQuota;

  return {
    plan,
    usage,
    quota,
  };
};

export const getTranslationPlanData = (token: string) => {
  const data = (getAuthBackend().decodeClaims(token) as Partial<Token>) || {};
  const plan: UserPlan = (data['plan'] as UserPlan) || 'free';
  const usage = getDailyUsage() || 0;
  const quota = DEFAULT_DAILY_TRANSLATION_QUOTA[plan];

  return {
    plan,
    usage,
    quota,
  };
};

export const getDailyTranslationPlanData = (token: string) => {
  const data = (getAuthBackend().decodeClaims(token) as Partial<Token>) || {};
  const plan = (data['plan'] as UserPlan) || 'free';
  const fixedQuota = parseInt(process.env['NEXT_PUBLIC_TRANSLATION_FIXED_QUOTA'] || '0');
  const quota =
    fixedQuota || DEFAULT_DAILY_TRANSLATION_QUOTA[plan] || DEFAULT_DAILY_TRANSLATION_QUOTA['free'];

  return {
    plan,
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
