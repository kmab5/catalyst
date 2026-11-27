import { z } from 'zod';
export function parseOutput<T>(input: unknown, schema: z.ZodType<T>): T {
  let value = input;
  if (typeof input === 'string') {
    // Preserve typographic quotes inside valid string values.
    try {
      return schema.parse(coerce(JSON.parse(input), schema));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    const text = input.replace(/[“”]/g, '"');
    const start = text.search(/[{\[]/);
    let depth = 0,
      quoted = false,
      escaped = false,
      end = -1;
    for (let i = start; i >= 0 && i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') quoted = false;
      } else if (ch === '"') quoted = true;
      else if (ch === '{' || ch === '[') depth++;
      else if ((ch === '}' || ch === ']') && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end === -1) throw new Error('Incomplete provider JSON');
    const json = text.slice(start, end);
    try {
      value = JSON.parse(json);
    } catch {
      value = JSON.parse(
        json.replace(
          /("(?:\\.|[^"\\])*")|,\s*(?=[}\]])/g,
          (match, quoted: string | undefined) => quoted ?? '',
        ),
      );
    }
  }
  return schema.parse(coerce(value, schema));
}
function coerce(value: unknown, schema: z.core.$ZodType): unknown {
  if (schema instanceof z.ZodObject && value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        schema.shape[key] ? coerce(v, schema.shape[key]) : v,
      ]),
    );
  }
  if (schema instanceof z.ZodArray && Array.isArray(value)) {
    let limit = value.length;
    for (const check of schema.def.checks ?? []) {
      if (check instanceof z.core.$ZodCheckMaxLength)
        limit = Math.min(limit, check._zod.def.maximum);
    }
    return value.slice(0, limit).map((v) => coerce(v, schema.element));
  }
  if (schema instanceof z.ZodString && typeof value === 'string')
    return value.slice(0, schema.maxLength ?? value.length);
  if (schema instanceof z.ZodEnum && !schema.options.some((v) => v === value) && schema.options.includes('other'))
    return 'other';
  if (schema instanceof z.ZodNumber && typeof value === 'number')
    return Math.max(schema.minValue ?? -Infinity, Math.min(schema.maxValue ?? Infinity, value));
  if (schema instanceof z.ZodOptional && value !== undefined) return coerce(value, schema.unwrap());
  return value;
}
