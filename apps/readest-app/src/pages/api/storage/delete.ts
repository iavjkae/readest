import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { deleteObject } from '@/utils/object';
import { trailbaseRecords } from '@/services/backend/trailbaseRecords';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) {
      return res.status(403).json({ error: 'Not authenticated' });
    }

    const { fileKey } = req.query;

    if (!fileKey || typeof fileKey !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid fileKey' });
    }

    const params = new URLSearchParams();
    params.set('limit', '1');
    params.set('filter[user_id]', user.id);
    params.set('filter[file_key]', fileKey);
    params.set('filter[deleted_at][$is]', 'NULL');

    const listRes = await trailbaseRecords.list<Record<string, unknown>>('files', params, token);
    const fileRecord = listRes.records[0] as any | undefined;

    if (!fileRecord) return res.status(404).json({ error: 'File not found' });

    if (fileRecord.user_id !== user.id) {
      return res.status(403).json({ error: 'Unauthorized access to the file' });
    }

    try {
      await deleteObject(fileKey);

      await trailbaseRecords.delete('files', fileRecord.id, token);

      res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      res.status(500).json({ error: 'Could not delete file from storage' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
