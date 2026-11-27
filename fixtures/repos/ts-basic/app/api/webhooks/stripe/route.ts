import { db } from '@/lib/db'
import { stripe } from '@/lib/stripe'
export async function POST(req: Request) {
  const event = stripe.webhooks.constructEvent(await req.text(), '', '')
  return db.subscription.update({ where: { id: event.id }, data: { status: 'active' } })
}
