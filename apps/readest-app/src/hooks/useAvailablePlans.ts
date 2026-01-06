import { AvailablePlan } from '@/types/quota';

interface UseAvailablePlansParams {
  hasIAP: boolean;
  onError?: (message: string) => void;
}

export const useAvailablePlans = ({ hasIAP, onError }: UseAvailablePlansParams) => {
  void hasIAP;
  void onError;

  // Payment has been removed. Keep API stable for existing UI.
  const availablePlans: AvailablePlan[] = [];
  const iapAvailable = false;
  const loading = false;
  const error: Error | null = null;

  return { availablePlans, iapAvailable, loading, error };
};
