import { Errors, Try } from '@shared'
import { Platform, Text } from '@shared/os'
import { IO } from './cli-kit'

Platform.onUncaughtException(fatalError)
Platform.onUnhandledRejection(fatalError)

async function fatalError(error: unknown): Promise<void> {
  const commandFailure = Errors.isCommandExecutionError(error)
  const status = commandFailure ? error.result.status : undefined
  await Try(async () => {
    await IO.finish('failed')
    printError(error)
  }, {
    finally() {
      Platform.exit(status ?? 1)
    },
  })
}

function printError(error: unknown): void {
  const { stacks, details } = Errors.describe(error)
  for (const stack of stacks) {
    IO.printToStdErr('\u001b[33m%s\u001b[0m', stack)
  }
  IO.printToStdErr('%s', Text.inspect(details))
}
