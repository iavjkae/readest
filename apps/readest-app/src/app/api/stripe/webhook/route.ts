import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import {
  getStripe,
  createOrUpdateSubscription,
  createOrUpdatePayment,
} from '@/libs/payment/stripe/server';
import { trailbaseRecords } from '@/services/backend/trailbaseRecords';

const getTrailbaseServiceToken = (): string | undefined => {
  return process.env['TRAILBASE_SERVICE_TOKEN'] || undefined;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 401 });
    }

    const stripe = getStripe();

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env['STRIPE_WEBHOOK_SECRET']!,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Webhook signature verification failed: ${message}`);
      return NextResponse.json(
        {
          error: `Webhook signature verification failed: ${message}`,
        },
        { status: 400 },
      );
    }

    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        const userId = session.metadata?.['userId'];
        if (userId) {
          if (session.mode === 'subscription') {
            await handleSuccessfulSubscription(session, userId);
          } else {
            await handleSuccessfulPayment(session, userId);
          }
        }
        break;

      case 'invoice.payment_succeeded':
        await handleSuccessfulInvoice(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleFailedInvoice(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCancelled(event.data.object);
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Webhook error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleSuccessfulPayment(session: Stripe.Checkout.Session, userId: string) {
  const customerId = session.customer as string;
  await createOrUpdatePayment(userId, customerId, session.id, getTrailbaseServiceToken());
}

async function handleSuccessfulSubscription(session: Stripe.Checkout.Session, userId: string) {
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  await createOrUpdateSubscription(userId, customerId, subscriptionId, getTrailbaseServiceToken());
}

async function handleSuccessfulInvoice(invoice: Stripe.Invoice) {
  const customerId = invoice.customer;
  const subscriptionId = invoice.parent?.subscription_details?.subscription;

  if (!subscriptionId) {
    return;
  }

  const customerParams = new URLSearchParams();
  customerParams.set('limit', '1');
  customerParams.set('filter[stripe_customer_id]', String(customerId));
  const customerRes = await trailbaseRecords.list<any>(
    'customers',
    customerParams,
    getTrailbaseServiceToken(),
  );
  const customerData = customerRes.records[0];

  if (!customerData?.user_id) {
    console.error('Customer not found:', customerId);
    return;
  }

  await trailbaseRecords.create(
    'subscriptions',
    {
      stripe_subscription_id: subscriptionId,
      status: 'active',
      current_period_end: new Date(invoice.lines.data[0]!.period.end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    getTrailbaseServiceToken(),
  );

  await trailbaseRecords.create(
    'plans',
    {
      user_id: customerData.user_id,
      status: 'active',
      updated_at: new Date().toISOString(),
    },
    getTrailbaseServiceToken(),
  );
}

async function handleFailedInvoice(invoice: Stripe.Invoice) {
  const customerId = invoice.customer;
  const subscriptionId = invoice.parent?.subscription_details?.subscription;

  if (!subscriptionId) {
    return;
  }

  const customerParams = new URLSearchParams();
  customerParams.set('limit', '1');
  customerParams.set('filter[stripe_customer_id]', String(customerId));
  const customerRes = await trailbaseRecords.list<any>(
    'customers',
    customerParams,
    getTrailbaseServiceToken(),
  );
  const customerData = customerRes.records[0];

  if (!customerData?.user_id) {
    console.error('Customer not found:', customerId);
    return;
  }

  await trailbaseRecords.create(
    'subscriptions',
    {
      stripe_subscription_id: subscriptionId,
      status: 'past_due',
      updated_at: new Date().toISOString(),
    },
    getTrailbaseServiceToken(),
  );

  await trailbaseRecords.create(
    'plans',
    {
      user_id: customerData.user_id,
      status: 'past_due',
      updated_at: new Date().toISOString(),
    },
    getTrailbaseServiceToken(),
  );
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id;

  const params = new URLSearchParams();
  params.set('limit', '1');
  params.set('filter[stripe_subscription_id]', subscriptionId);
  const subscriptionRes = await trailbaseRecords.list<any>(
    'subscriptions',
    params,
    getTrailbaseServiceToken(),
  );
  const subscriptionData = subscriptionRes.records[0];

  if (!subscriptionData) {
    console.error('Subscription not found:', subscriptionId);
    return;
  }
  const { user_id, stripe_customer_id } = subscriptionData;
  await createOrUpdateSubscription(user_id, stripe_customer_id, subscriptionId, getTrailbaseServiceToken());
}

async function handleSubscriptionCancelled(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id;

  await trailbaseRecords.create(
    'subscriptions',
    {
      stripe_subscription_id: subscriptionId,
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    getTrailbaseServiceToken(),
  );

  const params = new URLSearchParams();
  params.set('limit', '1');
  params.set('filter[stripe_subscription_id]', subscriptionId);
  const subscriptionRes = await trailbaseRecords.list<any>(
    'subscriptions',
    params,
    getTrailbaseServiceToken(),
  );
  const subscriptionData = subscriptionRes.records[0];

  if (subscriptionData?.user_id) {
    await trailbaseRecords.create(
      'plans',
      {
        user_id: subscriptionData.user_id,
        plan: 'free',
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      },
      getTrailbaseServiceToken(),
    );
  }
}
