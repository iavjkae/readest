import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { trailbaseRecords } from '@/services/backend/trailbaseRecords';

interface FileRecord {
  file_key: string;
  file_size: number;
  book_hash: string | null;
  created_at: string;
  updated_at: string | null;
}

interface ListFilesResponse {
  files: FileRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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

    const reqQuery = req.query as {
      page?: string;
      pageSize?: string;
      sortBy?: string;
      sortOrder?: string;
      bookHash?: string;
      search?: string;
    };
    const page = parseInt(reqQuery.page as string) || 1;
    const pageSize = Math.min(parseInt(reqQuery.pageSize as string) || 50, 100);
    const sortBy = (reqQuery.sortBy as string) || 'created_at';
    const sortOrder = (reqQuery.sortOrder as string) === 'asc' ? 'asc' : 'desc';
    const bookHash = reqQuery.bookHash as string | undefined;
    const search = reqQuery.search as string | undefined;

    const validSortColumns = ['created_at', 'updated_at', 'file_size', 'file_key'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';

    const params = new URLSearchParams();
    params.set('count', 'true');
    params.set('limit', String(pageSize));
    params.set('offset', String((page - 1) * pageSize));
    params.set('order', `${sortOrder === 'asc' ? '' : '-'}${sortColumn}`);
    params.set('filter[user_id]', user.id);
    params.set('filter[deleted_at][$is]', 'NULL');

    if (bookHash) params.set('filter[book_hash]', bookHash);
    if (search) params.set('filter[file_key][$like]', `%${search}%`);

    let files: FileRecord[] = [];
    let total = 0;

    try {
      const listRes = await trailbaseRecords.list<FileRecord>('files', params, token);
      files = listRes.records || [];
      total = listRes.total_count ?? 0;
    } catch (err) {
      console.error('Error querying files:', err);
      return res.status(500).json({ error: 'Failed to retrieve files' });
    }

    const totalPages = Math.ceil(total / pageSize);

    // Get all book_hashes from the paginated results
    const bookHashes = Array.from(
      new Set((files || []).map((f) => f.book_hash).filter((hash): hash is string => !!hash)),
    );

    // Fetch all files with the same book_hashes to ensure complete book groups
    // IMPORTANT: We don't apply the search filter here. This ensures that ALL files
    // for matched books are included (e.g., cover.png files), even if they don't
    // match the search term. This is crucial for proper book grouping and selection.
    let allRelatedFiles = files || [];
    if (bookHashes.length > 0) {
      // Trailbase Record API doesn't support IN(...) filters via query params.
      // book_hashes are md5/hex-ish values, so we can safely use a regex OR.
      const re = `^(${bookHashes.join('|')})$`;
      const relatedParams = new URLSearchParams();
      relatedParams.set('limit', '1024');
      relatedParams.set('filter[user_id]', user.id);
      relatedParams.set('filter[deleted_at][$is]', 'NULL');
      relatedParams.set('filter[book_hash][$re]', re);

      try {
        const relatedRes = await trailbaseRecords.list<FileRecord>('files', relatedParams, token);
        const relatedFiles = relatedRes.records || [];
        const fileMap = new Map(allRelatedFiles.map((f) => [f.file_key, f]));
        relatedFiles.forEach((f) => fileMap.set(f.file_key, f));
        allRelatedFiles = Array.from(fileMap.values());
      } catch (err) {
        // If this fails, fall back to just the paged results.
        console.warn('Failed to load related files:', err);
      }
    }

    const response: ListFilesResponse = {
      files: allRelatedFiles,
      total,
      page,
      pageSize,
      totalPages,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
