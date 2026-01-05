import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/libs/payment/stripe/server';
import { validateUserAndToken } from '@/utils/access';
import { trailbaseRecords } from '@/services/backend/trailbaseRecords';

export async function POST(request: NextRequest) {
  const { user, token } = await validateUserAndToken(request.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  try {
    const customerParams = new URLSearchParams();
    customerParams.set('limit', '1');
    customerParams.set('filter[user_id]', user.id);
    const customerRes = await trailbaseRecords.list<any>('customers', customerParams, token);
    const customerData = customerRes.records[0];

    if (!customerData?.stripe_customer_id) {
      throw new Error('Customer not found');
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerData.stripe_customer_id,
      return_url: `${request.headers.get('origin')}/user`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error creating portal session' }, { status: 500 });
  }
}
