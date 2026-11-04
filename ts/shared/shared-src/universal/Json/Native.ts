import z from '../../bridges/Bridge_zod'
import * as Errors from '../Errors'
import * as Schema from '../Schema'
import { Try } from '../TryCatch'

/** ParseOptions configures source-aware JSON decoding and optional schema validation. */
export type ParseOptions<SchemaType extends z.ZodType = z.ZodType> = {
  schema?: SchemaType
  sourceName?: string
}

/** PrintOptions controls native JSON replacer behavior and optional indentation. */
export type PrintOptions = {
  prettyPrint?: boolean
  replacer?: JsonReplacer
}

/** Parse decodes JSON as unknown or validates it and returns its schema output type. */
export function Parse<SchemaType extends z.ZodType>(
  source: string,
  options: ParseOptions<SchemaType> & { schema: SchemaType },
): z.output<SchemaType>
export function Parse(source: string, options?: ParseOptions<never>): unknown
export function Parse<SchemaType extends z.ZodType = z.ZodType>(
  source: string,
  options: ParseOptions<SchemaType> = {},
): unknown {
  const value = parseSource(source, options.sourceName)
  if (options.schema === undefined) {
    return value
  }
  return Schema.Parse(value, options.schema, { sourceName: options.sourceName })
}

/** Print serializes using native JSON omission and conversion rules; pretty printing defaults on. */
export function Print(value: unknown, options: PrintOptions = {}): string {
  requireAcyclic(value, new Set())
  const indentation = options.prettyPrint === false ? undefined : 2
  return JSON.stringify(value, options.replacer as never, indentation) as string
}

function parseSource(source: string, sourceName?: string): unknown {
  return Try(() => JSON.parse(source) as unknown, {
    catch(cause) {
      const name = sourceName === undefined ? 'JSON input' : `JSON input from ${sourceName}`
      const message = Errors.isNativeError(cause) ? cause.message : 'syntax error'
      Errors.ThrowUserInput(`${name} is invalid: ${message}`, undefined, { cause })
    },
  })
}

function requireAcyclic(value: unknown, ancestors: Set<object>): void {
  if (value === null || typeof value !== 'object') {
    return
  }
  if (ancestors.has(value)) {
    Errors.ThrowUserInput('JSON serialization cannot encode cycles.')
  }
  ancestors.add(value)
  for (const key of Object.keys(value)) {
    requireAcyclic((value as Record<string, unknown>)[key], ancestors)
  }
  ancestors.delete(value)
}

type JsonReplacer = ((this: unknown, key: string, value: unknown) => unknown) | (string | number)[]
