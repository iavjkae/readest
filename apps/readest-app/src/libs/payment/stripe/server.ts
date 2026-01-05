import Stripe from 'stripe';
import { UserPlan } from '@/types/quota';
import { PaymentStatus, StripePaymentData, StripeProductMetadata } from '@/types/payment';
import { updateUserStorage } from '../storage';
import { trailbaseRecords } from '@/services/backend/trailbaseRecords';

let stripe: Stripe | null;

export const getStripe = () => {
  if (!stripe) {
    const stripeSecretKey =
      process.env.NODE_ENV === 'production'
        ? process.env['STRIPE_SECRET_KEY']
        : process.env['STRIPE_SECRET_KEY_DEV'];
    stripe = new Stripe(stripeSecretKey!, {
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return stripe;
};

export const createOrUpdateSubscription = async (
  userId: string,
  customerId: string,
  subscriptionId: string,
  token?: string,
) => {
  const stripe = getStripe();

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  });
  const subscriptionItem = subscription.items.data[0]!;
  const priceId = subscriptionItem.price.id;
  const product = subscriptionItem.price.product as Stripe.Product & {
    metadata: StripeProductMetadata;
  };
  const plan = product.metadata?.plan || 'free';

  try {
    const period_start = new Date(subscriptionItem.current_period_start * 1000).toISOString();
    const period_end = new Date(subscriptionItem.current_period_end * 1000).toISOString();

    // Upsert via conflict_resolution=REPLACE + UNIQUE(stripe_subscription_id)
    await trailbaseRecords.create(
      'subscriptions',
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_price_id: priceId,
        status: subscription.status,
        current_period_start: period_start,
        current_period_end: period_end,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
      token,
    );
  } catch (error) {
    console.error('Error checking existing subscription:', error);
  }

  await trailbaseRecords.create(
    'plans',
    {
      user_id: userId,
      plan: ['active', 'trialing'].includes(subscription.status) ? plan : 'free',
      status: subscription.status,
      updated_at: new Date().toISOString(),
    },
    token,
  );
};

export const COMPLETED_PAYMENT_STATUSES: PaymentStatus[] = ['completed', 'succeeded'];

export const createOrUpdatePayment = async (
  userId: string,
  customerId: string,
  checkoutSessionId: string,
  token?: string,
) => {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
    expand: ['line_items.data.price.product', 'payment_intent'],
  });

  if (!session.payment_intent) {
    throw new Error('No payment intent in checkout session');
  }

  const paymentIntent = session.payment_intent as Stripe.PaymentIntent;
  const lineItem = session.line_items?.data[0];
  const product = lineItem?.price?.product as Stripe.Product & {
    metadata: { plan: UserPlan; storageGB: string };
  };
  const productMetadata = product?.metadata;

  try {
    const paymentData: Partial<StripePaymentData> = {
      user_id: userId,
      provider: 'stripe',
      stripe_customer_id: customerId,
      stripe_checkout_id: checkoutSessionId,
      stripe_payment_intent_id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status as PaymentStatus,
      payment_method: paymentIntent.payment_method as string | null,
      product_id: product?.id,
      storage_gb: productMetadata?.storageGB ? parseInt(productMetadata.storageGB) : 0,
      metadata: product?.metadata,
    };

    // Upsert via conflict_resolution=REPLACE + UNIQUE(stripe_payment_intent_id)
    await trailbaseRecords.create(
      'payments',
      {
        ...paymentData,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      } as Record<string, unknown>,
      token,
    );

    await updateUserStorage(userId, token);
  } catch (error) {
    console.error('Error creating or updating payment:', error);
    throw error;
  }
};
