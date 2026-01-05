import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { getDownloadSignedUrl } from '@/utils/object';
import { validateUserAndToken } from '@/utils/access';
import { trailbaseRecords } from '@/services/backend/trailbaseRecords';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) {
      return res.status(403).json({ error: 'Not authenticated' });
    }

    if (req.method === 'GET') {
      let { fileKey } = req.query;
      // Also parse fileKey directly from raw URL to handle special characters like & in filenames.
      // because frameworks may incorrectly split parameters when the fileKey value contains
      // encoded & (%26), treating it as a parameter separator.
      if (req.url?.includes('fileKey=') && req.url?.includes('&')) {
        const fileKeyFromUrl = req.url
          .substring(req.url.indexOf('fileKey=') + 8)
          .replace(/\+/g, '%20')
          .replace(/&/g, '%26')
          .replace(/=$/, '');
        fileKey = decodeURIComponent(fileKeyFromUrl);
      }
      if (!fileKey || typeof fileKey !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid fileKey' });
      }

      const downloadUrlsMap = await processFileKeys([fileKey], user.id, token);
      const downloadUrl = downloadUrlsMap[fileKey];

      if (!downloadUrl) {
        return res.status(404).json({ error: 'File not found' });
      }

      return res.status(200).json({ downloadUrl });
    }

    if (req.method === 'POST') {
      const { fileKeys } = req.body;

      if (!fileKeys || !Array.isArray(fileKeys)) {
        return res.status(400).json({ error: 'Missing or invalid fileKeys array' });
      }

      if (fileKeys.length === 0) {
        return res.status(400).json({ error: 'fileKeys array cannot be empty' });
      }

      if (!fileKeys.every((key) => typeof key === 'string')) {
        return res.status(400).json({ error: 'All fileKeys must be strings' });
      }

      const downloadUrls = await processFileKeys(fileKeys, user.id, token);

      return res.status(200).json({ downloadUrls });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

async function processFileKeys(
  fileKeys: string[],
  userId: string,
  token: string,
): Promise<Record<string, string | undefined>> {
  // Resolve records individually (Trailbase query params don't support IN()).
  const fileRecordMap = new Map<string, { user_id: string; file_key: string; book_hash: string | null }>();

  for (const fileKey of fileKeys) {
    const params = new URLSearchParams();
    params.set('limit', '1');
    params.set('filter[user_id]', userId);
    params.set('filter[file_key]', fileKey);
    params.set('filter[deleted_at][$is]', 'NULL');

    try {
      const res = await trailbaseRecords.list<any>('files', params, token);
      const rec = res.records[0];
      if (rec) {
        fileRecordMap.set(fileKey, {
          user_id: rec.user_id,
          file_key: rec.file_key,
          book_hash: rec.book_hash ?? null,
        });
      }
    } catch (err) {
      console.error('Error querying files:', err);
    }
  }

  const missingFileKeys = fileKeys.filter((key) => !fileRecordMap.has(key));

  if (missingFileKeys.length > 0) {
    const fallbackCandidates = missingFileKeys
      .filter((key) => key.includes('Readest/Book'))
      .map((key) => {
        const parts = key.split('/');
        if (parts.length === 5) {
          const bookHash = parts[3]!;
          const filename = parts[4]!;
          const fileExtension = filename.split('.').pop() || '';
          return { originalKey: key, bookHash, fileExtension };
        }
        return null;
      })
      .filter(Boolean) as Array<{ originalKey: string; bookHash: string; fileExtension: string }>;

    if (fallbackCandidates.length > 0) {
      const bookHashes = [...new Set(fallbackCandidates.map((c) => c.bookHash))];

      // Fetch candidates by book_hash via a regex OR.
      const re = `^(${bookHashes.join('|')})$`;
      const fallbackParams = new URLSearchParams();
      fallbackParams.set('limit', '1024');
      fallbackParams.set('filter[user_id]', userId);
      fallbackParams.set('filter[deleted_at][$is]', 'NULL');
      fallbackParams.set('filter[book_hash][$re]', re);

      try {
        const fallbackRes = await trailbaseRecords.list<any>('files', fallbackParams, token);
        const fallbackRecords = fallbackRes.records || [];
        for (const candidate of fallbackCandidates) {
          const matchedFile = fallbackRecords.find(
            (f) =>
              f.book_hash === candidate.bookHash &&
              f.file_key.endsWith(`.${candidate.fileExtension}`),
          );
          if (matchedFile) {
            fileRecordMap.set(candidate.originalKey, matchedFile);
          }
        }
      } catch (err) {
        console.warn('Fallback file lookup failed:', err);
      }
    }
  }

  const results = await Promise.allSettled(
    fileKeys.map(async (fileKey) => {
      const fileRecord = fileRecordMap.get(fileKey);

      if (!fileRecord) {
        return { fileKey, downloadUrl: undefined };
      }

      if (fileRecord.user_id !== userId) {
        return { fileKey, downloadUrl: undefined };
      }

      try {
        const downloadUrl = await getDownloadSignedUrl(fileRecord.file_key, 1800);
        return { fileKey, downloadUrl };
      } catch (error) {
        console.error(`Error creating signed URL for ${fileKey}:`, error);
        return { fileKey, downloadUrl: undefined };
      }
    }),
  );

  const downloadUrls: Record<string, string | undefined> = {};

  results.forEach((result, index) => {
    const fileKey = fileKeys[index]!;
    if (result.status === 'fulfilled') {
      downloadUrls[fileKey] = result.value.downloadUrl;
    } else {
      downloadUrls[fileKey] = undefined;
    }
  });

  return downloadUrls;
}
