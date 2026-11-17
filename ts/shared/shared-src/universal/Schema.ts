import z from '../bridges/Bridge_zod'
import * as Errors from './Errors'
import { Try } from './TryCatch'
import * as UserInput from './UserInput'

export * from '../bridges/Bridge_zod'

/** ParseOptions configures source attribution for schema validation failures. */
export type ParseOptions = { sourceName?: string }

/** Parse validates unknown data and returns the schema's inferred output type. */
export function Parse<Value>(value: unknown, schema: z.ZodType<Value>, options: ParseOptions = {}): Value {
  return Try(() => schema.parse(value), {
    catch: cause => throwSchemaFailure(options.sourceName ?? 'Value', cause),
  }) as Value
}

/** ParseAsync validates unknown data with synchronous or asynchronous schema checks. */
export async function ParseAsync<Value>(
  value: unknown,
  schema: z.ZodType<Value>,
  options: ParseOptions = {},
): Promise<Value> {
  return await Try(() => schema.parseAsync(value), {
    catch: cause => throwSchemaFailure(options.sourceName ?? 'Value', cause),
  }) as Value
}

function throwSchemaFailure(sourceName: string, cause: unknown): never {
  if (isAsyncSchemaError(cause)) {
    Errors.ThrowShouldNeverHappen('Schema.Parse requires a synchronous schema. Use Schema.ParseAsync instead.', {
      cause,
    })
  }
  const detail = isSchemaError(cause)
    ? cause.issues.map(issue => `${formatPath(issue.path)} ${issue.message}`).join('; ')
    : 'validation failed'
  UserInput.fail(`${sourceName} did not match its schema: ${detail}`, undefined, { cause })
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? 'at root' : `at ${path.map(String).join('.')}`
}

function isSchemaError(value: unknown): value is z.ZodError {
  return value instanceof z.ZodError
}

function isAsyncSchemaError(value: unknown): value is z.core.$ZodAsyncError {
  return value instanceof z.core.$ZodAsyncError
}
