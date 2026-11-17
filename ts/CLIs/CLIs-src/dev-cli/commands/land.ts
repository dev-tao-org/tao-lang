import { IO } from '@cli-kit'
import { BuildLock, Path, Repo } from '@shared/os'
import { land } from '../landing/Land'
import { createLandingIO } from '../landing/LandingIO'
import { registerCommand } from './_command-runner'

/** landCommand publishes measured history and lands the reviewed feature through GitHub. */
export default registerCommand({
  name: 'land',
  description: 'Integrate, verify, archive performance and squash-merge the reviewed feature branch.',
  options: [{ flags: '--with-ios', description: 'Also require hosted iOS journeys before merging.' }],
  async action(options: { withIos?: boolean } = {}) {
    const proof = await BuildLock.withBuildLock(
      Path.join(Repo.getMainWorktreeRoot(), '.artifacts/landing.lock'),
      () => land(createLandingIO(), options.withIos),
    )
    IO.print(`Landed ${proof.branch}: ${proof.url} at ${proof.mergeCommit} (${proof.mergedAt})`)
  },
})
