import { Errors, EscapeCharacter, NewlineCharacter, Try } from '@shared'
import { Platform, Terminal, Text } from '@shared/os'
import * as ExternalErrors from '../../../shared/shared-src/universal/Errors/external'
import { IO } from './cli-kit'

Platform.onUncaughtException(fatalError)
Platform.onUnhandledRejection(fatalError)

async function fatalError(error: unknown): Promise<void> {
  const commandFailure = Errors.isCommandExecutionError(error)
  const status = commandFailure ? error.result.status : undefined
  await Try(async () => {
    printError(error)
    IO.summary(`Failed: ${ExternalErrors.fromUnknown(error).message.split(NewlineCharacter)[0]!.slice(0, 240)}`)
    await IO.finish('failed')
  }, {
    catch: () => writeFallbackError(error),
    finally() {
      Platform.exit(status || 1)
    },
  })
}

function writeFallbackError(error: unknown): void {
  const { stacks, details } = Errors.describe(error)
  Terminal.stderr.write(
    `${[...stacks, Text.inspect(details)].filter(Boolean).join(NewlineCharacter)}${NewlineCharacter}`,
  )
}

function printError(error: unknown): void {
  const { stacks, details } = Errors.describe(error)
  for (const stack of stacks) {
    IO.printToStdErr(EscapeCharacter + '[33m%s' + EscapeCharacter + '[0m', stack)
  }
  IO.printToStdErr('%s', Text.inspect(details))
}
