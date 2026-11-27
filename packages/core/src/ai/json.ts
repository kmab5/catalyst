import { z } from 'zod';
export function parseOutput<T>(input: unknown, schema: z.ZodType<T, z.ZodTypeDef, any>): T {
  let value = input;
  if (typeof input === 'string') {
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
function coerce(value: unknown, schema: z.ZodTypeAny): unknown {
  if (schema instanceof z.ZodObject && value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        schema.shape[key] ? coerce(v, schema.shape[key]) : v,
      ]),
    );
  }
  if (schema instanceof z.ZodArray && Array.isArray(value))
    return value
      .slice(0, schema._def.maxLength?.value ?? value.length)
      .map((v) => coerce(v, schema.element));
  if (schema instanceof z.ZodString && typeof value === 'string')
    return value.slice(0, schema.maxLength ?? value.length);
  if (schema instanceof z.ZodEnum && !schema.options.includes(value) && schema.options.includes('other'))
    return 'other';
  if (schema instanceof z.ZodNumber && typeof value === 'number')
    return Math.max(schema.minValue ?? -Infinity, Math.min(schema.maxValue ?? Infinity, value));
  if (schema instanceof z.ZodOptional && value !== undefined) return coerce(value, schema.unwrap());
  return value;
}
