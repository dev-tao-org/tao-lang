/** describe separates stack frames from complete error details, including causes and aggregate members. */
export function describe(error: unknown): { stacks: string[]; details: unknown } {
  const stacks: string[] = []
  const details = errorDetails(error, stacks, new WeakSet())
  return { stacks, details }
}

function errorDetails(error: unknown, stacks: string[], seen: WeakSet<Error>): unknown {
  if (!(error instanceof Error)) {
    return error
  }
  if (seen.has(error)) {
    return '[Circular error cause]'
  }
  seen.add(error)
  const { stack, cause, ...details } = error
  const fields: Record<string, unknown> = details
  if (fields.messageForUser === error.message) {
    delete fields.messageForUser
  }
  const frames = stack?.split('\n').slice(1).join('\n')
  if (frames) {
    stacks.push(frames)
  }
  return {
    ...fields,
    name: error.name,
    message: error.message,
    ...(error instanceof AggregateError
      ? { errors: error.errors.map(member => errorDetails(member, stacks, seen)) }
      : {}),
    ...(cause === undefined ? {} : { cause: errorDetails(cause, stacks, seen) }),
  }
}
