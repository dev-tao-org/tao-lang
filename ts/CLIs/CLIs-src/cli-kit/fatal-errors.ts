import { Errors, Try } from '@shared'
import { inspect } from 'node:util'
import { IO } from './cli-kit'

process.on('uncaughtException', fatalError)
process.on('unhandledRejection', fatalError)

function fatalError(error: unknown): never {
  const commandFailure = Errors.isTaoError(error) && error.name === 'CommandExecutionError'
  const status = commandFailure ? error.result.status : undefined
  Try(() => printError(error), { catch: () => IO.error('\u001b[31m%s\u001b[0m', inspect(error)) })
  process.exit(isFailureStatus(status) ? status : 1)
}

function printError(error: unknown): void {
  const stacks: string[] = []
  const details = errorDetails(error, stacks, new WeakSet())
  for (const stack of stacks) {
    IO.error('\u001b[33m%s\u001b[0m', stack)
  }
  IO.error('\u001b[31m%s\u001b[0m', inspect(details, { depth: null, customInspect: false, colors: false }))
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
  const frames = stack?.split('\n').slice(1).join('\n')
  if (frames) {
    stacks.push(frames)
  }
  return {
    ...details,
    name: error.name,
    message: error.message,
    ...(cause === undefined ? {} : { cause: errorDetails(cause, stacks, seen) }),
  }
}

function isFailureStatus(status: unknown): status is number {
  return typeof status === 'number' && Number.isInteger(status) && status > 0 && status <= 255
}
