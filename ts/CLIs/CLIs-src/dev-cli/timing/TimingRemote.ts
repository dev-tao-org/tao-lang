import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'

import { Streams } from '@shared/os'
import { executeRemote } from '../../agent-skills/performance-investigation/Remote'

/** TimingRemoteRequest selects literal runner arguments through an existing authenticated socket. */
export type TimingRemoteRequest = {
  host: string
  directory: string
  controlPath: string
  args: readonly string[]
  streamOutput?: boolean
}

/** readTimingRemote retains runner stdout while preserving ordinary command logs and SSH supervision. */
export async function readTimingRemote(request: TimingRemoteRequest): Promise<string> {
  const channel = IO.channel({ title: 'Timing runner' })
  let text = ''
  const decode = Streams.createDecoder()
  const output: CLIKit.OutputChannel = {
    ...channel,
    stdout(chunk) {
      text += decode(chunk)
      if (request.streamOutput !== false) {
        channel.stdout(chunk)
      }
    },
  }
  const args = [
    '/bin/zsh',
    '-lc',
    'exec "$@"',
    'tao-timing',
    '/usr/bin/env',
    'TERMINAL_OUTPUT=1',
    'TERMINAL_UI=0',
    ...request.args,
  ]
  await executeRemote(request.host, args, {
    directory: request.directory,
    controlPath: request.controlPath,
  }, (command, args, options) => CLIKit.runNonInteractiveCommand(command, args, withTimingOutput(options, output)))
  return text
}

type CommandOptions = Parameters<typeof CLIKit.runNonInteractiveCommand>[2]

function withTimingOutput(options: CommandOptions, output: CLIKit.OutputChannel): CommandOptions {
  return { ...options, output }
}
