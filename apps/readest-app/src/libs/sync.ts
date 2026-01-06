import { Book, BookConfig, BookNote, BookDataRecord } from '@/types/book';
import { getAPIBaseUrl } from '@/services/environment';
import { getAccessToken } from '@/utils/access';
import { fetchWithTimeout } from '@/utils/fetch';

const SYNC_API_ENDPOINT = getAPIBaseUrl() + '/sync';

export type SyncType = 'books' | 'configs' | 'notes';
export type SyncOp = 'push' | 'pull' | 'both';

interface BookRecord extends BookDataRecord, Book {}
interface BookConfigRecord extends BookDataRecord, BookConfig {}
interface BookNoteRecord extends BookDataRecord, BookNote {}

export interface SyncResult {
  books: BookRecord[] | null;
  notes: BookNoteRecord[] | null;
  configs: BookConfigRecord[] | null;
}

export interface SyncData {
  books?: Partial<BookRecord>[];
  notes?: Partial<BookNoteRecord>[];
  configs?: Partial<BookConfigRecord>[];
}

export class SyncClient {
  private async readErrorMessage(res: Response): Promise<string> {
    if (res.status === 401 || res.status === 403) return 'Not authenticated';

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const json = await res.json().catch(() => null);
      if (json && typeof json === 'object') {
        const err = (json as any).error;
        if (typeof err === 'string' && err.trim()) return err;
        const msg = (json as any).message;
        if (typeof msg === 'string' && msg.trim()) return msg;
      }
      return res.statusText || 'Request failed';
    }

    const text = await res.text().catch(() => '');
    return text?.trim() || res.statusText || 'Request failed';
  }

  /**
   * Pull incremental changes since a given timestamp (in ms).
   * Returns updated or deleted records since that time.
   */
  async pullChanges(
    since: number,
    type?: SyncType,
    book?: string,
    metaHash?: string,
  ): Promise<SyncResult> {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated');

    const params = new URLSearchParams();
    params.set('since', String(since));
    if (type) params.set('type', type);
    if (book) params.set('book', book);
    if (metaHash) params.set('meta_hash', metaHash);
    const url = `${SYNC_API_ENDPOINT}?${params.toString()}`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      8000,
    );

    if (!res.ok) {
      const message = await this.readErrorMessage(res);
      if (message === 'Not authenticated') throw new Error('Not authenticated');
      throw new Error(`Failed to pull changes: ${message}`);
    }

    return res.json();
  }

  /**
   * Push local changes to the server.
   * Uses last-writer-wins logic as implemented on the server side.
   */
  async pushChanges(payload: SyncData): Promise<SyncResult> {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated');

    const res = await fetchWithTimeout(
      SYNC_API_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
      8000,
    );

    if (!res.ok) {
      const message = await this.readErrorMessage(res);
      if (message === 'Not authenticated') throw new Error('Not authenticated');
      throw new Error(`Failed to push changes: ${message}`);
    }

    return res.json();
  }
}
