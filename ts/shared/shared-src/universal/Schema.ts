import z from '../bridges/Bridge_zod'
import * as Errors from './Errors'
import { Try } from './TryCatch'

export * from '../bridges/Bridge_zod'

/** SchemaParseOptions names the input whose value is being validated. */
export type ParseOptions = { sourceName?: string }

/** Parse validates unknown data and returns the schema's inferred output type. */
export function Parse<Value>(value: unknown, schema: z.ZodType<Value>, options: ParseOptions = {}): Value {
  return Try(() => schema.parse(value), {
    catch(cause) {
      const sourceName = options.sourceName ?? 'Value'
      const detail = cause instanceof z.ZodError
        ? cause.issues.map(issue => `${formatPath(issue.path)} ${issue.message}`).join('; ')
        : 'validation failed'
      Errors.ThrowUserInput(`${sourceName} did not match its schema: ${detail}`, undefined, { cause })
    },
  }) as Value
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? 'at root' : `at ${path.map(String).join('.')}`
}
