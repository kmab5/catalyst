import { getCurrentUser } from '@/lib/session'
export default async function Billing() { return getCurrentUser() }
