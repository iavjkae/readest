import { QuotaType, UserPlan } from '@/types/quota';
import { useMemo } from 'react';

export const useQuotaStats = (briefName = false) => {
  void briefName;

  // Payment/quota has been removed.
  const quotas = useMemo<QuotaType[]>(() => [], []);
  const userProfilePlan = useMemo<UserPlan>(() => 'pro', []);

  return {
    quotas,
    userProfilePlan,
  };
};
