import { IO } from '@cli-kit'
import { createLandingIO, git } from '../landing/LandingIO'
import { inspectLanding } from '../landing/PullRequest'
import { registerCommand } from './_command-runner'

/** landedCommand checks authoritative merged-PR and remote main ancestry evidence. */
export default registerCommand({
  name: 'landed',
  description: 'Prove whether a feature branch merged into remote main.',
  arguments: [{ name: 'branch', description: 'Feature branch; defaults to the current branch.' }],
  async action(branch?: string) {
    const io = createLandingIO()
    const selected = branch ?? await git(io, ['branch', '--show-current'])
    const proof = await inspectLanding(io, selected)
    if (!proof) {
      IO.print(`Not landed: ${selected}; GitHub reports no merged pull request into main.`)
      return
    }
    IO.print(`Landed ${proof.branch}: ${proof.url} at ${proof.mergeCommit} (${proof.mergedAt})`)
  },
})
