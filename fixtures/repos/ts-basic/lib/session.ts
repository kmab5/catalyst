import { getServerSession } from 'next-auth'
import { db } from './db'
export async function getCurrentUser() {
  const session = await getServerSession()
  return db.user.findUnique({ where: { email: session?.user?.email } })
}
