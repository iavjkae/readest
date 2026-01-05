import { getTrailbaseBaseUrl } from './trailbaseEnv';

export type TrailbaseRecordId = string | number;

export type TrailbaseListResponse<T> = {
  records: T[];
  total_count?: number;
  cursor?: TrailbaseRecordId;
};

export class TrailbaseHttpError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'TrailbaseHttpError';
    this.status = status;
    this.body = body;
  }
}

const buildUrl = (path: string): string => {
  const base = getTrailbaseBaseUrl();
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
};

const parseJsonSafely = async (res: Response): Promise<unknown> => {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return undefined;
  return await res.json().catch(() => undefined);
};

export const trailbaseFetch = async (
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<{ ok: true; status: number; json?: unknown } | { ok: false; status: number; error: TrailbaseHttpError } > => {
  const url = buildUrl(path);
  const { accessToken, headers, ...rest } = init;

  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(headers || {}),
    },
    cache: 'no-store',
  });

  const json = await parseJsonSafely(res);

  if (!res.ok) {
    const message =
      typeof json === 'object' && json && 'error' in json
        ? String((json as any).error)
        : `Trailbase request failed (${res.status})`;
    return { ok: false, status: res.status, error: new TrailbaseHttpError(message, res.status, json) };
  }

  return { ok: true, status: res.status, json };
};

const normalizeListResponse = <T>(json: unknown): TrailbaseListResponse<T> => {
  if (Array.isArray(json)) return { records: json as T[] };
  if (json && typeof json === 'object') {
    const obj = json as any;
    if (Array.isArray(obj.records)) {
      return {
        records: obj.records as T[],
        total_count: typeof obj.total_count === 'number' ? obj.total_count : undefined,
        cursor: obj.cursor as TrailbaseRecordId | undefined,
      };
    }
    if (Array.isArray(obj.data)) return { records: obj.data as T[] };
  }
  return { records: [] };
};

export const trailbaseRecords = {
  list: async <T>(
    apiName: string,
    params: URLSearchParams,
    accessToken?: string,
  ): Promise<TrailbaseListResponse<T>> => {
    const query = params.toString();
    const path = `/api/records/v1/${encodeURIComponent(apiName)}${query ? `?${query}` : ''}`;
    const res = await trailbaseFetch(path, { method: 'GET', accessToken });
    if (!res.ok) throw res.error;
    return normalizeListResponse<T>(res.json);
  },

  create: async <T extends Record<string, unknown>>(
    apiName: string,
    record: T,
    accessToken?: string,
  ): Promise<TrailbaseRecordId> => {
    const path = `/api/records/v1/${encodeURIComponent(apiName)}`;
    const res = await trailbaseFetch(path, {
      method: 'POST',
      accessToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw res.error;

    // Create usually returns the record id (string|number). Fall back to unknown.
    const json = res.json;
    if (typeof json === 'string' || typeof json === 'number') return json;
    if (json && typeof json === 'object' && 'id' in (json as any)) return (json as any).id as TrailbaseRecordId;
    return '';
  },

  delete: async (apiName: string, id: TrailbaseRecordId, accessToken?: string): Promise<void> => {
    const path = `/api/records/v1/${encodeURIComponent(apiName)}/${encodeURIComponent(String(id))}`;
    const res = await trailbaseFetch(path, { method: 'DELETE', accessToken });
    if (!res.ok) throw res.error;
  },
};
