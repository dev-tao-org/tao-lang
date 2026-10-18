import { IO } from '@cli-kit'
import { BuildLock, Path, Repo } from '@shared/os'
import { integrateMain } from '../landing/Integration'
import { createLandingIO } from '../landing/LandingIO'
import { registerCommand } from './_command-runner'

/** mergeMainCommand integrates remote main into a clean feature branch without publishing. */
export default registerCommand({
  name: 'merge-main',
  description: 'Fetch and merge origin/main into the current clean feature branch.',
  async action() {
    const changed = await BuildLock.withBuildLock(
      Path.join(Repo.getMainWorktreeRoot(), '.artifacts/landing.lock'),
      () => integrateMain(createLandingIO()),
    )
    IO.print(changed ? 'Integrated main. Review the changes before continuing.' : 'Main is already integrated.')
  },
})
