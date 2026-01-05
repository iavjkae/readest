import { describe, it, expect, vi } from 'vitest';
import { POST as applePost } from '@/app/api/apple/iap-verify/route';
import { POST as googlePost } from '@/app/api/google/iap-verify/route';
import { NextRequest } from 'next/server';
import { setupTrailbaseMocks } from '../helpers/trailbase-mock';

const SKIP_IAP_API_TESTS = !process.env['ENABLE_IAP_API_TESTS'];
vi.mock('@/services/backend/trailbaseRecords', () => ({
  trailbaseRecords: {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/libs/payment/storage', () => ({
  updateUserStorage: vi.fn(),
}));

vi.mock('@/services/backend', () => ({
  getAuthBackend: () => ({
    kind: 'trailbase',
    getSession: vi.fn(),
    refreshSession: vi.fn(),
    logout: vi.fn(),
    getUserFromAccessToken: vi.fn().mockResolvedValue({ id: 'test-user-123', email: 'test@example.com' }),
    onAuthStateChange: vi.fn().mockResolvedValue(() => {}),
    decodeClaims: vi.fn().mockReturnValue({ sub: 'test-user-123', email: 'test@example.com' }),
  }),
  getBackendKind: () => 'trailbase',
}));

describe.skipIf(SKIP_IAP_API_TESTS)('/api/apple/iap-verify', () => {
  it('should verify a valid Apple IAP transaction', async () => {
    setupTrailbaseMocks();
    const request = new NextRequest('http://localhost:3000/api/apple/iap-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        transactionId: '2000000969168810',
        originalTransactionId: '2000000968585424',
      }),
    });

    const response = await applePost(request);
    const data = await response.json();
    console.log('Response:', data);

    expect(response.status).toBe(200);
    expect(data.purchase).toBeDefined();
  });
});

describe.skipIf(SKIP_IAP_API_TESTS)('/api/google/iap-verify', () => {
  it('should verify a valid Google IAP purchase', async () => {
    setupTrailbaseMocks();
    const request = new NextRequest('http://localhost:3000/api/google/iap-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        packageName: 'com.bilingify.readest',
        productId: 'com.bilingify.readest.monthly.pro',
        orderId: 'GPA.3388-4630-1043-97604',
        purchaseToken:
          'bhedilellajejnodjfcanjai.AO-J1Ow94pzeLM6e8pCJLT_tV-RnffT3HKMTcstovMNVlUTOwhx38SU5Seq3EO5qiQ0Le_VQU1ShN7nxaFQILY3UPX2nhdAKLBbekC_MxBnRf-Bpgegh_NA',
      }),
    });

    const response = await googlePost(request);
    const data = await response.json();
    console.log('Response:', data);

    expect(response.status).toBe(200);
    expect(data.purchase).toBeDefined();
  });
});
