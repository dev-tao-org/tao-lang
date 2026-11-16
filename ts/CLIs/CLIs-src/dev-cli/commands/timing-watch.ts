import * as CLIKit from '@cli-kit'
import { FS, Path } from '@shared/os'
import { timingProgressPath } from '../../agent-skills/performance-investigation/TimingProgress'
import { registerCommand } from './_command-runner'

/** timingWatchCommand follows benchmark progress across jobs on the timing machine. */
export default registerCommand({
  name: 'timing-watch',
  description: 'Follow live timing progress in Terminal on the timing laptop.',
  async action() {
    const path = timingProgressPath()
    await FS.mkdirPrivate(Path.dirname(path))
    await FS.writeFile(path, '', { flag: 'a', mode: 0o600 })
    await CLIKit.runForegroundCommand('tail', ['-n', '25', '-F', path])
  },
})
