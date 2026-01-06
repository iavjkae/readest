import type { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest, NextResponse } from 'next/server';
import { BookDataRecord } from '@/types/book';
import { transformBookConfigToDB } from '@/utils/transform';
import { transformBookNoteToDB } from '@/utils/transform';
import { transformBookToDB } from '@/utils/transform';
import { runMiddleware, corsAllMethods } from '@/utils/cors';
import { SyncData, SyncResult, SyncType } from '@/libs/sync';
import { validateUserAndToken } from '@/utils/access';
import { DBBook, DBBookConfig } from '@/types/records';
import { trailbaseRecords } from '@/services/backend/trailbaseRecords';

const transformsToDB = {
  books: transformBookToDB,
  book_notes: transformBookNoteToDB,
  book_configs: transformBookConfigToDB,
};

const DBSyncTypeMap = {
  books: 'books',
  book_notes: 'notes',
  book_configs: 'configs',
};

type TableName = keyof typeof transformsToDB;

type DBError = { table: TableName; error: Error };

const toIso = (timestamp: number): string => new Date(timestamp).toISOString();

const toMs = (iso?: string | null): number | undefined => {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : undefined;
};

const buildFilters = (filters: Array<[string, string, string]>) => {
  const params = new URLSearchParams();
  for (const [column, op, value] of filters) {
    const key = op === '$eq' ? `filter[${column}]` : `filter[${column}][${op}]`;
    params.append(key, value);
  }
  return params;
};

const mergeDedupe = <T extends Record<string, unknown>>(
  arrays: T[][],
  dedupeKeys?: string[],
): T[] => {
  const merged = arrays.flat();
  if (!dedupeKeys || dedupeKeys.length === 0) return merged;
  const seen = new Set<string>();
  return merged.filter((rec) => {
    const key = dedupeKeys
      .map((k) => String((rec as any)[k] ?? ''))
      .filter(Boolean)
      .join('|');
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export async function GET(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sinceParam = searchParams.get('since');
  const typeParam = searchParams.get('type') as SyncType | undefined;
  const bookParam =
    searchParams.get('book') ?? searchParams.get('book_hash') ?? searchParams.get('bookHash');
  const metaHashParam = searchParams.get('meta_hash') ?? searchParams.get('metaHash');

  if (!sinceParam) {
    return NextResponse.json({ error: '"since" query parameter is required' }, { status: 400 });
  }

  const since = new Date(Number(sinceParam));
  if (isNaN(since.getTime())) {
    return NextResponse.json({ error: 'Invalid "since" timestamp' }, { status: 400 });
  }

  const sinceIso = since.toISOString();

  try {
    const results: SyncResult = { books: [], configs: [], notes: [] };
    const errors: Record<TableName, DBError | null> = {
      books: null,
      book_notes: null,
      book_configs: null,
    };

    const queryTables = async (table: TableName, dedupeKeys?: string[]) => {
      const apiName = table;

      const baseFilters: Array<[string, string, string]> = [['user_id', '$eq', user.id]];

      if (bookParam) baseFilters.push(['book_hash', '$eq', bookParam]);
      if (metaHashParam) baseFilters.push(['meta_hash', '$eq', metaHashParam]);

      const updatedParams = buildFilters([...baseFilters, ['updated_at', '$gt', sinceIso]]);
      updatedParams.set('order', '-updated_at');
      const deletedParams = buildFilters([...baseFilters, ['deleted_at', '$gt', sinceIso]]);
      deletedParams.set('order', '-updated_at');

      const [updated, deleted] = await Promise.all([
        trailbaseRecords.list<Record<string, unknown>>(apiName, updatedParams, token),
        trailbaseRecords.list<Record<string, unknown>>(apiName, deletedParams, token),
      ]);

      // If both book & meta_hash were provided, previous backend used OR.
      // Trailbase list filters combine with AND, so we emulate OR via a second query.
      let extraOr: Record<string, unknown>[] = [];
      if (bookParam && metaHashParam) {
        const byBook = buildFilters([
          ['user_id', '$eq', user.id],
          ['book_hash', '$eq', bookParam],
          ['updated_at', '$gt', sinceIso],
        ]);
        byBook.set('order', '-updated_at');

        const byMeta = buildFilters([
          ['user_id', '$eq', user.id],
          ['meta_hash', '$eq', metaHashParam],
          ['updated_at', '$gt', sinceIso],
        ]);
        byMeta.set('order', '-updated_at');

        const [bookRes, metaRes] = await Promise.all([
          trailbaseRecords.list<Record<string, unknown>>(apiName, byBook, token),
          trailbaseRecords.list<Record<string, unknown>>(apiName, byMeta, token),
        ]);
        extraOr = [...bookRes.records, ...metaRes.records];
      }

      const merged = mergeDedupe<Record<string, unknown>>(
        [updated.records, deleted.records, extraOr],
        dedupeKeys,
      );

      results[DBSyncTypeMap[table] as SyncType] = merged as any;
    };

    if (!typeParam || typeParam === 'books') {
      await queryTables('books').catch((err: unknown) => {
        errors['books'] = { table: 'books', error: err instanceof Error ? err : new Error(String(err)) };
      });
    }
    if (!typeParam || typeParam === 'configs') {
      await queryTables('book_configs').catch((err: unknown) => {
        errors['book_configs'] = {
          table: 'book_configs',
          error: err instanceof Error ? err : new Error(String(err)),
        };
      });
    }
    if (!typeParam || typeParam === 'notes') {
      await queryTables('book_notes', ['note_id']).catch((err: unknown) => {
        errors['book_notes'] = {
          table: 'book_notes',
          error: err instanceof Error ? err : new Error(String(err)),
        };
      });
    }

    const dbErrors = Object.values(errors).filter((err) => err !== null);
    if (dbErrors.length > 0) {
      console.error('Errors occurred:', dbErrors);
      const errorMsg = dbErrors
        .map((err) => `${err.table}: ${err.error.message || 'Unknown error'}`)
        .join('; ');
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    const response = NextResponse.json(results, { status: 200 });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Pragma', 'no-cache');
    response.headers.delete('ETag');
    return response;
  } catch (error: unknown) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const body = await req.json();
  const {
    books = [],
    configs = (body as any)?.book_configs ?? [],
    notes = (body as any)?.book_notes ?? [],
  } = body as SyncData;

  const BATCH_SIZE = 100;
  const upsertRecords = async (
    table: TableName,
    records: BookDataRecord[],
  ) => {
    if (records.length === 0) return { data: [] };

    // Trailbase record APIs require an INTEGER/UUID primary key. To support upsert without
    // knowing that primary key, configure the underlying table with UNIQUE constraints on
    // natural keys (e.g. user_id+book_hash) and set record_apis.conflict_resolution=REPLACE.
    // Then POST /api/records/v1/<api> acts as a last-write-wins upsert.

    const allClientRecords: BookDataRecord[] = [];

    const loadExistingBook = async (bookHash: string): Promise<Record<string, unknown> | null> => {
      const params = new URLSearchParams();
      params.set('limit', '1');
      params.set('filter[user_id]', user.id);
      params.set('filter[book_hash]', bookHash);
      // Prefer non-deleted record when present.
      params.set('filter[deleted_at][$is]', 'NULL');
      const res = await trailbaseRecords.list<Record<string, unknown>>('books', params, token);
      return (res.records && res.records[0]) ? (res.records[0] as Record<string, unknown>) : null;
    };

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      for (const rec of batch) {
        // Some clients send partial payloads during incremental progress sync.
        // Because Trailbase uses conflict_resolution=REPLACE for upsert, missing
        // NOT NULL columns would overwrite existing rows with NULL and fail.
        if (table === 'books') {
          const r: any = rec as any;
          const bookHash = r.hash || r.book_hash;
          const needsBackfill = !r.title || !r.author || !r.format || r.createdAt === undefined || r.createdAt === null;
          if (bookHash && needsBackfill) {
            const existing = await loadExistingBook(String(bookHash));
            if (existing) {
              if (!r.title && typeof existing['title'] === 'string') r.title = existing['title'];
              if (!r.author && typeof existing['author'] === 'string') r.author = existing['author'];
              if (!r.format && typeof existing['format'] === 'string') r.format = existing['format'];
              if (r.createdAt === undefined || r.createdAt === null) {
                const ms = toMs(existing['created_at'] as any);
                if (ms !== undefined) r.createdAt = ms;
              }
            }
          }

          // If this is a brand-new record and the client sent a partial payload,
          // ensure NOT NULL columns have non-null defaults so we never write NULL.
          if (!r.title) r.title = '';
          if (!r.author) r.author = '';
          if (!r.format) r.format = 'EPUB';
          if (r.createdAt === undefined || r.createdAt === null) r.createdAt = Date.now();
        }

        if (table === 'book_notes') {
          const r: any = rec as any;
          // Ensure NOT NULL columns always have a value.
          if (r.note == null) r.note = '';
          if (!r.type) r.type = 'annotation';
          if (r.cfi == null) r.cfi = '';
          if (!r.id) r.id = r.note_id || `${Date.now()}`;
          if (r.createdAt == null) r.createdAt = Date.now();
          if (r.updatedAt == null) r.updatedAt = Date.now();
        }

        const dbRec = transformsToDB[table](rec, user.id) as DBBook | DBBookConfig;

        // Ensure client payload stays consistent with previous behavior.
        rec.user_id = user.id;
        rec.book_hash = (dbRec as any).book_hash;

        // If client didn't provide updated_at, set it now.
        if (!(dbRec as any).updated_at) {
          (dbRec as any).updated_at = toIso(Date.now());
        }

        try {
          await trailbaseRecords.create(table, dbRec as unknown as Record<string, unknown>, token);
        } catch (err: unknown) {
          if (err instanceof Error) {
            err.message = `${table}: ${err.message}`;
          }
          throw err;
        }
        allClientRecords.push(rec);
      }
    }

    return { data: allClientRecords };
  };

  try {
    const [booksResult, configsResult, notesResult] = await Promise.all([
      upsertRecords('books', books as BookDataRecord[]),
      upsertRecords('book_configs', configs as BookDataRecord[]),
      upsertRecords('book_notes', notes as BookDataRecord[]),
    ]);

    return NextResponse.json(
      {
        books: booksResult?.data || [],
        configs: configsResult?.data || [],
        notes: notesResult?.data || [],
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!req.url) {
    return res.status(400).json({ error: 'Invalid request URL' });
  }

  const protocol = process.env['PROTOCOL'] || 'http';
  const host = process.env['HOST'] || 'localhost:3000';
  const url = new URL(req.url, `${protocol}://${host}`);

  await runMiddleware(req, res, corsAllMethods);

  try {
    let response: Response;

    if (req.method === 'GET') {
      const nextReq = new NextRequest(url.toString(), {
        headers: new Headers(req.headers as Record<string, string>),
        method: 'GET',
      });
      response = await GET(nextReq);
    } else if (req.method === 'POST') {
      const nextReq = new NextRequest(url.toString(), {
        headers: new Headers(req.headers as Record<string, string>),
        method: 'POST',
        body: JSON.stringify(req.body), // Ensure the body is a string
      });
      response = await POST(nextReq);
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    res.status(response.status);

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.send(buffer);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export default handler;
