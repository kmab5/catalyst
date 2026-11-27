import { CatalystError, type Project } from '@catalyst/core';
import { Lang } from '@catalyst/shared';
import type { Context } from 'hono';
import { z } from 'zod';

export type ProjectEnv = { Variables: { project: Project } };
export function language(c: Context<ProjectEnv>): Lang {
  return Lang.parse(c.req.query('lang') ?? c.get('project').info().outputLanguage);
}
export function integer(raw: string | undefined, min: number, max: number): number | undefined {
  if (raw === undefined) return;
  return z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max)).parse(raw);
}
export function csv<T extends z.ZodTypeAny>(raw: string | undefined, schema: T): z.output<T>[] | undefined {
  return raw === undefined ? undefined : z.array(schema).parse(raw.split(',').map(v => v.trim()));
}
export async function body<T extends z.ZodTypeAny>(c: Context, schema: T, optional = false): Promise<z.output<T>> {
  const raw = await c.req.text();
  if (optional && !raw.trim()) return schema.parse({});
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new CatalystError('BAD_REQUEST', 'Expected a JSON request body'); }
  return schema.parse(value);
}
