import { vi } from 'vitest';

type ListResponse = { records: any[]; total?: number };

export const setupTrailbaseMocks = async (
  customResponses: {
    list?: ListResponse;
    create?: any;
  } = {},
) => {
  const { trailbaseRecords } = await import('@/services/backend/trailbaseRecords');

  vi.mocked(trailbaseRecords.list).mockImplementation(async () => {
    return (
      customResponses.list || {
        records: [],
        total: 0,
      }
    );
  });

  vi.mocked(trailbaseRecords.create).mockImplementation(async () => {
    return customResponses.create || { ok: true };
  });

  vi.mocked(trailbaseRecords.delete).mockImplementation(async () => {
    return;
  });
};
