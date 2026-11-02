import { IO, type OutputChannel, runNonInteractiveCommand } from '@cli-kit'
import { Streams } from '@shared/os'
import { executeRemote } from '../../agent-skills/performance-investigation/Remote'

/** TimingRemoteRequest selects literal runner arguments through an existing authenticated socket. */
export type TimingRemoteRequest = { host: string; directory: string; controlPath: string; args: readonly string[] }

/** readTimingRemote retains runner stdout while preserving ordinary command logs and SSH supervision. */
export async function readTimingRemote(
  request: TimingRemoteRequest,
  execute = runNonInteractiveCommand,
  channel = IO.channel({ title: 'Timing runner' }),
): Promise<string> {
  let text = ''
  const decode = Streams.createDecoder()
  const output: OutputChannel = {
    ...channel,
    stdout(chunk) {
      text += decode(chunk)
      channel.stdout(chunk)
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
  }, (command, options) => execute(command, withTimingOutput(options, output)))
  return text
}

type CommandOptions = Parameters<typeof runNonInteractiveCommand>[1]

function withTimingOutput(options: CommandOptions, output: OutputChannel): CommandOptions {
  return { ...options, output }
}
