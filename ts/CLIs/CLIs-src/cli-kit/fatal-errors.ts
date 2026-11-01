import { Errors, Try } from '@shared'
import { Platform, Terminal, Text } from '@shared/os'
import { IO } from './cli-kit'

Platform.onUncaughtException(fatalError)
Platform.onUnhandledRejection(fatalError)

async function fatalError(error: unknown): Promise<void> {
  const commandFailure = Errors.isCommandExecutionError(error)
  const status = commandFailure ? error.result.status : undefined
  await Try(async () => {
    printError(error)
    IO.summary(`Failed: ${Errors.fromUnknown(error).message.split('\n')[0]!.slice(0, 240)}`)
    await IO.finish('failed')
  }, {
    catch: () => writeFallbackError(error),
    finally() {
      Platform.exit(status ?? 1)
    },
  })
}

function writeFallbackError(error: unknown): void {
  const { stacks, details } = Errors.describe(error)
  Terminal.stderr.write(`${[...stacks, Text.inspect(details)].filter(Boolean).join('\n')}\n`)
}

function printError(error: unknown): void {
  const { stacks, details } = Errors.describe(error)
  for (const stack of stacks) {
    IO.printToStdErr('\u001b[33m%s\u001b[0m', stack)
  }
  IO.printToStdErr('%s', Text.inspect(details))
}
