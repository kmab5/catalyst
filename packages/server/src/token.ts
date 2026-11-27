import { timingSafeEqual } from 'node:crypto';

export function matchesToken(expected: string, supplied?: string): boolean {
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}
