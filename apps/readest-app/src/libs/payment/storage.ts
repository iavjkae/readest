import { COMPLETED_PAYMENT_STATUSES } from '@/types/payment';
import { trailbaseRecords } from '@/services/backend/trailbaseRecords';

export const updateUserStorage = async (userId: string, token?: string) => {
  try {
    const paymentsParams = new URLSearchParams();
    paymentsParams.set('limit', '1024');
    paymentsParams.set('filter[user_id]', userId);
    paymentsParams.set('filter[status][$re]', `^(${COMPLETED_PAYMENT_STATUSES.join('|')})$`);

    const paymentsRes = await trailbaseRecords.list<any>('payments', paymentsParams, token);
    const payments = paymentsRes.records || [];

    const totalStorageGB =
      payments?.reduce((sum, payment) => {
        return sum + (payment.storage_gb || 0);
      }, 0) || 0;

    console.log(`User ${userId} total storage: ${totalStorageGB} GB`);

    // Upsert plan storage quota (requires record_apis.conflict_resolution=REPLACE and UNIQUE(user_id)).
    await trailbaseRecords.create(
      'plans',
      {
      user_id: userId,
      storage_purchased_bytes: totalStorageGB * 1024 * 1024 * 1024,
      updated_at: new Date().toISOString(),
      },
      token,
    );

    return totalStorageGB;
  } catch (error) {
    console.error('Error updating user storage:', error);
    throw error;
  }
};
