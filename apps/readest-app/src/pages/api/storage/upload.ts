import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import {
  getStoragePlanData,
  validateUserAndToken,
  STORAGE_QUOTA_GRACE_BYTES,
} from '@/utils/access';
import { getUploadSignedUrl } from '@/utils/object';
import { trailbaseRecords } from '@/services/backend/trailbaseRecords';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) {
      return res.status(403).json({ error: 'Not authenticated' });
    }

    const { fileName, fileSize, bookHash } = req.body;
    if (!fileName || !fileSize) {
      return res.status(400).json({ error: 'Missing file info' });
    }

    const { usage, quota } = getStoragePlanData(token);
    if (usage + fileSize > quota + STORAGE_QUOTA_GRACE_BYTES) {
      return res.status(403).json({ error: 'Insufficient storage quota', usage });
    }

    const fileKey = `${user.id}/${fileName}`;

    const existingParams = new URLSearchParams();
    existingParams.set('limit', '1');
    existingParams.set('filter[user_id]', user.id);
    existingParams.set('filter[file_key]', fileKey);
    existingParams.set('filter[deleted_at][$is]', 'NULL');

    const existing = await trailbaseRecords.list<Record<string, unknown>>('files', existingParams, token);
    const existingRecord = existing.records[0] as any | undefined;

    let objSize = fileSize;
    if (existingRecord) {
      objSize = existingRecord.file_size;
    } else {
      await trailbaseRecords.create(
        'files',
        {
          user_id: user.id,
          book_hash: bookHash,
          file_key: fileKey,
          file_size: fileSize,
        },
        token,
      );
    }

    try {
      const uploadUrl = await getUploadSignedUrl(fileKey, objSize, 1800);

      res.status(200).json({
        uploadUrl,
        fileKey,
        usage: usage + fileSize,
        quota,
      });
    } catch (error) {
      console.error('Error creating presigned post:', error);
      res.status(500).json({ error: 'Could not create presigned post' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
