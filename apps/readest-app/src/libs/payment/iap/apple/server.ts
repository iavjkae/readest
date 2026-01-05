import { ApplePaymentData } from '@/types/payment';
import { updateUserStorage } from '@/libs/payment/storage';
import { trailbaseRecords } from '@/services/backend/trailbaseRecords';
import {
  isStoragePurchase,
  mapProductIdToProductName,
  mapProductIdToUserPlan,
  parseStorageGB,
} from '../utils';
import { IAPError, VerifiedIAP } from '../types';
import { VerificationResult } from './verifier';

export type VerifiedPurchase = VerifiedIAP & {
  transactionId: string;
  originalTransactionId: string;
  purchaseDate?: string;
  expiresDate?: string | null;
  quantity: number;
  environment: string;
  bundleId: string;
  webOrderLineItemId?: string;
  subscriptionGroupIdentifier?: string;
  type?: string;
  revocationDate?: string | null;
  revocationReason?: number | null;
};

export async function createOrUpdateSubscription(
  userId: string,
  purchase: VerifiedPurchase,
  token?: string,
) {
  try {
    const existingParams = new URLSearchParams();
    existingParams.set('limit', '1');
    existingParams.set('filter[original_transaction_id]', purchase.originalTransactionId);
    const existingRes = await trailbaseRecords.list<any>(
      'apple_iap_subscriptions',
      existingParams,
      token,
    );
    const existingSubscription = existingRes.records[0];

    if (existingSubscription && existingSubscription.user_id !== userId) {
      throw new Error(IAPError.TRANSACTION_BELONGS_TO_ANOTHER_USER);
    }

    await trailbaseRecords.create(
      'apple_iap_subscriptions',
      {
        user_id: userId,
        platform: purchase.platform,
        product_id: purchase.productId,
        transaction_id: purchase.transactionId,
        original_transaction_id: purchase.originalTransactionId,
        status: purchase.status === 'active' ? 'active' : 'expired',
        purchase_date: purchase.purchaseDate,
        expires_date: purchase.expiresDate,
        environment: purchase.environment,
        bundle_id: purchase.bundleId,
        quantity: purchase.quantity || 1,
        auto_renew_status: true,
        web_order_line_item_id: purchase.webOrderLineItemId,
        subscription_group_identifier: purchase.subscriptionGroupIdentifier,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      token,
    );

    const plan = mapProductIdToUserPlan(purchase.productId, true);
    await trailbaseRecords.create(
      'plans',
      {
        user_id: userId,
        plan: ['active', 'trialing'].includes(purchase.status) ? plan : 'free',
        status: purchase.status,
        updated_at: new Date().toISOString(),
      },
      token,
    );

    return;
  } catch (error) {
    console.error('Failed to update user subscription:', error);
    throw error;
  }
}

export async function createOrUpdatePayment(userId: string, purchase: VerifiedPurchase, token?: string) {
  try {
    const existingParams = new URLSearchParams();
    existingParams.set('limit', '1');
    existingParams.set('filter[apple_original_transaction_id]', purchase.originalTransactionId);
    const existingRes = await trailbaseRecords.list<any>('payments', existingParams, token);
    const existingPayment = existingRes.records[0];
    if (existingPayment && existingPayment.user_id !== userId) {
      throw new Error(IAPError.TRANSACTION_BELONGS_TO_ANOTHER_USER);
    }

    const paymentData: ApplePaymentData = {
      user_id: userId,
      provider: 'apple',
      product_id: purchase.productId,
      apple_transaction_id: purchase.transactionId,
      apple_original_transaction_id: purchase.originalTransactionId,
      storage_gb: isStoragePurchase(purchase.productId) ? parseStorageGB(purchase.productId) : 0,
      status: purchase.status === 'active' ? 'completed' : 'failed',
      amount: purchase.amount,
      currency: purchase.currency,
    };

    await trailbaseRecords.create(
      'payments',
      {
        ...paymentData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>,
      token,
    );

    await updateUserStorage(userId, token);
    return;
  } catch (error) {
    console.error('Failed to update user payment:', error);
    throw error;
  }
}

export async function processPurchaseData(
  user: { id: string; email?: string | null | undefined },
  verificationResult: VerificationResult,
  token?: string,
): Promise<VerifiedPurchase> {
  const transaction = verificationResult.transaction!;

  if (transaction.environment === 'Sandbox' && process.env.NODE_ENV === 'production') {
    console.warn('Sandbox transaction in production environment');
  }

  const purchase: VerifiedPurchase = {
    status: verificationResult.status!,
    customerEmail: user.email ?? '',
    orderId: transaction.webOrderLineItemId || transaction.originalTransactionId,
    subscriptionId: transaction.webOrderLineItemId || transaction.originalTransactionId,
    planName: mapProductIdToProductName(transaction.productId),
    planType: verificationResult.planType!,
    productId: transaction.productId,
    platform: 'ios',
    transactionId: transaction.transactionId,
    originalTransactionId: transaction.originalTransactionId,
    purchaseDate: verificationResult.purchaseDate?.toISOString(),
    expiresDate: verificationResult.expiresDate?.toISOString() || null,
    quantity: transaction.quantity,
    environment: transaction.environment.toLowerCase(),
    bundleId: transaction.bundleId,
    webOrderLineItemId: transaction.webOrderLineItemId,
    subscriptionGroupIdentifier: transaction.subscriptionGroupIdentifier,
    type: transaction.type,
    revocationDate: verificationResult.revocationDate?.toISOString() || null,
    revocationReason: verificationResult.revocationReason,
  };

  if (purchase.planType === 'subscription') {
    await createOrUpdateSubscription(user.id, purchase, token);
  } else if (purchase.planType === 'purchase') {
    await createOrUpdatePayment(user.id, purchase, token);
  }

  return purchase;
}
