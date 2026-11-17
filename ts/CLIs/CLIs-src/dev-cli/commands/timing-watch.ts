import * as CLIKit from '@cli-kit'
import { Env, FS, Path } from '@shared/os'
import { executeRemote } from '../../agent-skills/performance-investigation/Remote'
import { timingProgressPath } from '../../agent-skills/performance-investigation/TimingProgress'
import { resolveTimingSocket } from '../timing/TimingConnection'
import { registerCommand } from './_command-runner'

type OptionalTimingRunner = string | undefined
const DefaultTimingRunner = 'ro@192.168.50.199'

/** timingWatchCommand follows benchmark progress across jobs on the timing machine. */
export default registerCommand({
  name: 'timing-watch',
  description: 'Follow live timing progress over SSH, or on this machine with --local.',
  arguments: [{ name: 'host', description: 'Existing SSH alias or user@hostname for the timing laptop.' }],
  options: [{ flags: '--local', description: 'Follow the timing log on this machine.' }],
  async action(host: OptionalTimingRunner, options: { local?: boolean }) {
    const path = timingProgressPath()
    if (!options.local) {
      const runner = host ?? Env.get('TAO_TIMING_HOST') ?? DefaultTimingRunner
      const relative = Path.toPortablePath(Path.relative(Path.home(), path))
      const args = ['/bin/sh', '-c', 'trap \'exit 0\' INT; /usr/bin/tail -n 25 -F "$HOME/$1"', 'tao-timing', relative]
      await executeRemote(runner, args, {
        directory: '/',
        controlPath: resolveTimingSocket(runner),
        terminal: true,
      }, CLIKit.runForegroundCommand)
      return
    }
    await FS.mkdirPrivate(Path.dirname(path))
    await FS.writeFile(path, '', { flag: 'a', mode: 0o600 })
    await CLIKit.runForegroundCommand('tail', ['-n', '25', '-F', path])
  },
})
