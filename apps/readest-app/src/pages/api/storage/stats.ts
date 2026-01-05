import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken, getStoragePlanData } from '@/utils/access';
import { trailbaseRecords } from '@/services/backend/trailbaseRecords';

interface StorageStats {
  totalFiles: number;
  totalSize: number;
  usage: number;
  quota: number;
  usagePercentage: number;
  byBookHash: Array<{
    bookHash: string | null;
    fileCount: number;
    totalSize: number;
  }>;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) {
      return res.status(403).json({ error: 'Not authenticated' });
    }

    // Aggregate in-process (Trailbase Record API does not expose aggregation endpoints).
    const limit = 1024;
    let offset = 0;
    let totalFiles = 0;
    let totalSize = 0;
    const grouped = new Map<string | null, { count: number; size: number }>();

    for (let page = 0; page < 50; page++) {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      params.set('order', 'id');
      params.set('filter[user_id]', user.id);
      params.set('filter[deleted_at][$is]', 'NULL');

      const pageRes = await trailbaseRecords.list<any>('files', params, token);
      const rows = pageRes.records || [];
      if (rows.length === 0) break;

      for (const row of rows) {
        const size = Number(row.file_size || 0);
        const bookHash = (row.book_hash ?? null) as string | null;
        totalFiles += 1;
        totalSize += size;
        const current = grouped.get(bookHash) || { count: 0, size: 0 };
        grouped.set(bookHash, { count: current.count + 1, size: current.size + size });
      }

      if (rows.length < limit) break;
      offset += limit;
    }

    // Get storage plan data
    const { usage, quota } = getStoragePlanData(token);
    const usagePercentage = quota > 0 ? Math.round((usage / quota) * 100) : 0;

    const byBookHash = Array.from(grouped.entries())
      .map(([bookHash, stats]) => ({
        bookHash,
        fileCount: stats.count,
        totalSize: stats.size,
      }))
      .sort((a, b) => b.totalSize - a.totalSize);

    const response: StorageStats = {
      totalFiles,
      totalSize,
      usage,
      quota,
      usagePercentage,
      byBookHash,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
