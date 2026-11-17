import z from '../../bridges/Bridge_zod'
import * as Errors from '../Errors'
import * as Schema from '../Schema'
import { Try } from '../TryCatch'
import * as UserInput from '../UserInput'

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

type JsonSchemaParseOptions<SchemaType extends z.ZodType> = ParseOptions<SchemaType> & { schema: SchemaType }
type JsonReplacer = JsonReplacerCallback | JsonReplacerKeyList
type JsonReplacerCallback = (this: unknown, key: string, value: unknown) => unknown
type JsonReplacerKeyList = JsonReplacerKey[]
type JsonReplacerKey = string | number

/** Parse decodes JSON as unknown or validates it and returns its schema output type. */
export function Parse<SchemaType extends z.ZodType>(
  source: string,
  options: JsonSchemaParseOptions<SchemaType>,
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
  return Schema.Parse(value, options.schema, { sourceName: options.sourceName ?? 'JSON input' })
}

/** ParseAsync decodes JSON and applies synchronous or asynchronous schema validation. */
export function ParseAsync<SchemaType extends z.ZodType>(
  source: string,
  options: JsonSchemaParseOptions<SchemaType>,
): Promise<z.output<SchemaType>>
export function ParseAsync(source: string, options?: ParseOptions<never>): Promise<unknown>
export async function ParseAsync<SchemaType extends z.ZodType = z.ZodType>(
  source: string,
  options: ParseOptions<SchemaType> = {},
): Promise<unknown> {
  const value = parseSource(source, options.sourceName)
  if (options.schema === undefined) {
    return value
  }
  return await Schema.ParseAsync(value, options.schema, { sourceName: options.sourceName ?? 'JSON input' })
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
      UserInput.fail(`${name} is invalid: ${message}`, undefined, { cause })
    },
  })
}

function requireAcyclic(value: unknown, ancestors: Set<object>): void {
  if (value === null || typeof value !== 'object') {
    return
  }
  UserInput.require(!ancestors.has(value), 'JSON serialization cannot encode cycles.')
  ancestors.add(value)
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor && Object.hasOwn(descriptor, 'value')) {
      requireAcyclic(descriptor.value, ancestors)
    }
  }
  ancestors.delete(value)
}
