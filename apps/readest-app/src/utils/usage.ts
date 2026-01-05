import { trailbaseRecords } from '@/services/backend/trailbaseRecords';

export const USAGE_TYPES = {
  TRANSLATION_CHARS: 'translation_chars',
} as const;

export const QUOTA_TYPES = {
  DAILY: 'daily',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;

export class UsageStatsManager {
  static async trackUsage(
    userId: string,
    usageType: string,
    increment: number = 1,
    metadata: Record<string, string | number> = {},
    token?: string,
  ): Promise<number> {
    try {
      const usageDate = new Date().toISOString().split('T')[0]!;

      // Append-only event; current usage is computed by summing events.
      await trailbaseRecords.create(
        'usage_events',
        {
          user_id: userId,
          usage_type: usageType,
          usage_date: usageDate,
          increment,
          metadata: JSON.stringify(metadata),
          created_at: new Date().toISOString(),
        },
        token,
      );

      return await UsageStatsManager.getCurrentUsage(userId, usageType, 'daily', token);
    } catch (error) {
      console.error('Usage tracking failed:', error);
      return 0;
    }
  }

  static async getCurrentUsage(
    userId: string,
    usageType: string,
    period: 'daily' | 'monthly' = 'daily',
    token?: string,
  ): Promise<number> {
    try {
      const params = new URLSearchParams();
      params.set('limit', '1024');
      params.set('filter[user_id]', userId);
      params.set('filter[usage_type]', usageType);

      if (period === 'daily') {
        const usageDate = new Date().toISOString().split('T')[0]!;
        params.set('filter[usage_date]', usageDate);
      } else {
        const ym = new Date().toISOString().slice(0, 7);
        params.set('filter[usage_date][$like]', `${ym}-%`);
      }

      const res = await trailbaseRecords.list<any>('usage_events', params, token);
      return (res.records || []).reduce((sum, row) => sum + Number(row.increment || 0), 0);
    } catch (error) {
      console.error('Get current usage failed:', error);
      return 0;
    }
  }
}
