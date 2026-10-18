import { z } from 'zod';

/** Adapt canonical JSON Schema to the SDK's Zod 3 boundary; contracts stay authoritative. */
export function sdkSchema(raw: unknown, root: unknown = raw): z.ZodTypeAny {
  if (!raw || typeof raw !== 'object') throw new Error('Unsupported SDK input schema.');
  const schema = raw as Record<string, unknown>;
  if (typeof schema.$ref === 'string') {
    if (!schema.$ref.startsWith('#/')) throw new Error('External schema references are not permitted.');
    let resolved: unknown = root;
    for (const key of schema.$ref.slice(2).split('/')) resolved = (resolved as Record<string, unknown>)[key.replaceAll('~1', '/').replaceAll('~0', '~')];
    return sdkSchema(resolved, root);
  }
  const variants = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(variants)) {
    const items = variants.map(value => sdkSchema(value, root));
    if (items.length === 1) return items[0]!;
    if (items.length < 2) throw new Error('Empty schema union.');
    return z.union(items as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }
  if ('const' in schema && ['string', 'number', 'boolean'].includes(typeof schema.const)) return z.literal(schema.const as string | number | boolean);
  if (Array.isArray(schema.enum) && schema.enum.every(value => typeof value === 'string') && schema.enum.length) return z.enum(schema.enum as [string, ...string[]]);
  if (Array.isArray(schema.type)) return sdkSchema({ anyOf: schema.type.map(type => ({ ...schema, type })) }, root);
  switch (schema.type) {
    case 'null': return z.null();
    case 'boolean': return z.boolean();
    case 'string': {
      let value = z.string();
      if (typeof schema.minLength === 'number') value = value.min(schema.minLength);
      if (typeof schema.maxLength === 'number') value = value.max(schema.maxLength);
      if (typeof schema.pattern === 'string') value = value.regex(new RegExp(schema.pattern));
      if (schema.format === 'uuid') value = value.uuid();
      if (schema.format === 'date-time') value = value.datetime();
      if (schema.format === 'uri') value = value.url();
      return value;
    }
    case 'number': case 'integer': {
      let value = z.number();
      if (schema.type === 'integer') value = value.int();
      if (typeof schema.minimum === 'number') value = value.min(schema.minimum);
      if (typeof schema.maximum === 'number') value = value.max(schema.maximum);
      return value;
    }
    case 'array': {
      let value = z.array(sdkSchema(schema.items, root));
      if (typeof schema.minItems === 'number') value = value.min(schema.minItems);
      if (typeof schema.maxItems === 'number') value = value.max(schema.maxItems);
      return value;
    }
    case 'object': {
      const required = new Set(Array.isArray(schema.required) ? schema.required : []);
      const properties = schema.properties as Record<string, unknown> | undefined;
      const shape = Object.fromEntries(Object.entries(properties ?? {}).map(([key, definition]) => [key, required.has(key) ? sdkSchema(definition, root) : sdkSchema(definition, root).optional()]));
      return schema.additionalProperties === false ? z.object(shape).strict() : z.object(shape);
    }
    default: throw new Error(`Unsupported canonical schema type: ${String(schema.type)}`);
  }
}
