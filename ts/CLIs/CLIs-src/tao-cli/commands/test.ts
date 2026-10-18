import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { runTaoTests } from '../../dev-cli/testing/TaoTests'

/** taoTestCommand runs Tao app journeys on the default headless target. */
export default registerCommand({
  name: 'test',
  description: 'Run Tao app tests in a file or folder on headless web.',
  arguments: [{ name: 'target', defaultValue: '.', description: 'Tao file or folder.' }],
  async action(target: string) {
    await runTaoTests(target)
  },
})
