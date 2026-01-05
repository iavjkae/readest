import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/libs/payment/stripe/server';
import { validateUserAndToken } from '@/utils/access';
import { trailbaseRecords } from '@/services/backend/trailbaseRecords';

export async function POST(request: NextRequest) {
  const {
    priceId,
    planType = 'subscription',
    embedded = true,
    metadata = {},
  } = await request.json();

  const { user, token } = await validateUserAndToken(request.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  const enhancedMetadata = {
    ...metadata,
    userId: user.id,
  };

  try {
    const customerParams = new URLSearchParams();
    customerParams.set('limit', '1');
    customerParams.set('filter[user_id]', user.id);
    const customerRes = await trailbaseRecords.list<any>('customers', customerParams, token);
    const customerData = customerRes.records[0];

    let customerId;
    if (!customerData?.stripe_customer_id) {
      const stripe = getStripe();
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: {
          userId: user.id,
        },
      });
      customerId = customer.id;
      await trailbaseRecords.create(
        'customers',
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        token,
      );
    } else {
      customerId = customerData.stripe_customer_id;
    }

    const stripe = getStripe();
    const successUrl = `${request.headers.get('origin')}/user/subscription/success?payment=stripe&session_id={CHECKOUT_SESSION_ID}`;
    const returnUrl = `${request.headers.get('origin')}/user`;
    const session = await stripe.checkout.sessions.create({
      ui_mode: embedded ? 'embedded' : 'hosted',
      customer: customerId,
      mode: planType === 'subscription' ? 'subscription' : 'payment',
      allow_promotion_codes: true,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: enhancedMetadata,
      success_url: embedded ? undefined : successUrl,
      cancel_url: embedded ? undefined : returnUrl,
      redirect_on_completion: embedded ? 'never' : undefined,
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
      clientSecret: session.client_secret,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error creating checkout session' }, { status: 500 });
  }
}
