import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import { Errors } from '@shared'
import { Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { registerCommand } from './_command-runner'

const TaoRepository = 'tao-dev-org/tao-lang'
/** verifyCICommand dispatches the official Verify workflow for the pushed feature branch. */
export default registerCommand({
  name: 'verify-ci',
  description: 'Dispatch hosted Verify for this checkout’s pushed feature branch.',
  options: [{ flags: '--status', description: 'Show the latest Verify run for the pushed commit.' }],
  async action(options: { status?: boolean } = {}) {
    const cwd = Repo.getWorkspaceRoot()
    const { branch, commit } = await requirePushedFeature(cwd)
    if (options.status) {
      await printVerifyRun(cwd, branch, commit)
      return
    }
    IO.print(`Dispatching Verify for ${branch} at ${commit}.`)
    await CLIKit.runNonInteractiveCommand(
      'gh',
      ['workflow', 'run', 'verify.yml', '--repo', TaoRepository, '--ref', branch],
      { cwd },
    )
  },
})

async function printVerifyRun(cwd: string, branch: string, commit: string): Promise<void> {
  await CLIKit.runNonInteractiveCommand('gh', [
    'run',
    'list',
    '--repo',
    TaoRepository,
    '--workflow',
    'verify.yml',
    '--event',
    'workflow_dispatch',
    '--branch',
    branch,
    '--commit',
    commit,
    '--limit',
    '1',
    '--json',
    'databaseId,headSha,status,conclusion,url',
  ], { cwd })
}

async function requirePushedFeature(cwd: string) {
  const branch = await Exec.captureStdout('git', ['symbolic-ref', '--short', 'HEAD'], { cwd })
  if (!branch.startsWith('feat/')) {
    Errors.ThrowUserInput('Hosted Verify dispatch requires a checked-out feat/ branch.')
  }
  const origin = await Exec.captureStdout('git', ['remote', 'get-url', 'origin'], { cwd })
  if (origin !== `https://github.com/${TaoRepository}.git`) {
    Errors.ThrowUserInput(`Hosted Verify dispatch expects the official origin at ${TaoRepository}.`)
  }
  const commit = await Exec.captureStdout('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { cwd })
  const ref = `refs/heads/${branch}`
  const remote = await Exec.captureStdout('git', ['ls-remote', '--heads', 'origin', ref], { cwd })
  if (remote !== `${commit}\t${ref}`) {
    Errors.ThrowUserInput(`Push ${branch} to origin before dispatching Verify for ${commit}.`)
  }
  return { branch, commit }
}
