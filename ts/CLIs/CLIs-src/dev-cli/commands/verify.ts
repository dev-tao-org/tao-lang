import * as CLIKit from '@cli-kit'
import { Repo } from '@shared/os'
import { workspaceTests } from '../../cli-checks/check'
import { registerCommand } from './_command-runner'
import check from './check'
import compile from './compile'
import fmt from './fmt'

/** verifyCommand fixes, checks and tests the new workspace. */
export default registerCommand({
  name: 'verify',
  description: 'Format, regenerate Studio compiler output, check and test the new TypeScript workspace.',
  arguments: [{
    name: 'format-paths',
    description: 'Limit formatting to named files or globs; checks stay workspace-wide.',
    variadic: true,
  }],
  options: [{ flags: '--yes', description: 'Authorize required app dependency setup.' }],
  async action(paths: string[], options: { yes?: boolean } = {}) {
    // Native app journeys await their testing implementation.
    await CLIKit.runSteps(
      () => fmt.action(paths),
      () =>
        compile.action(Repo.resolvePath('Apps/Dev/Kitchen Sink/Kitchen Sink.tao'), {
          session: 'review-build',
          yes: options.yes,
        }),
      () => compile.action('Demo', { package: Repo.resolvePath('Apps/TS Lib App/src/ts'), session: 'review-build' }),
      () => check.action(),
      () => workspaceTests([], undefined, { yes: options.yes }),
    )
  },
})
