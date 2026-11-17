import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import { Errors } from '@shared'
import Exec from '@shared/os/exec'
import { watchVerifyRun } from './VerifyWatch'

/** TaoRepository names the configured GitHub origin used by verification commands. */
export const TaoRepository = 'tao-dev-org/tao-lang'

/** dispatchVerify starts hosted Verify and optionally waits for its exact source revision. */
export async function dispatchVerify(
  cwd: string,
  branch: string,
  commit: string,
  options: VerifyDispatchOptions,
): Promise<void> {
  const inputs = dispatchInputs(options)
  IO.print(`Dispatching Verify for ${branch} at ${commit}.`)
  const args = ['workflow', 'run', 'verify.yml', '--ref', branch, ...inputs, '--repo', TaoRepository]
  if (!options.wait) {
    await CLIKit.runNonInteractiveCommand('gh', args, { cwd })
    return
  }
  const output = await Exec.captureStdout('gh', args, { cwd })
  const runId = VerifyRunUrlRegx.exec(output)?.[1]
  if (!runId) {
    Errors.ThrowHostEnvironment(
      'GitHub did not return the dispatched Verify run URL. Inspect Verify status before retrying.',
    )
  }
  await watchVerifyRun(cwd, runId, { expectedHead: commit })
}

/** requirePushedFeature verifies that hosted Verify will run against the current feature revision. */
export async function requirePushedFeature(cwd: string) {
  const branch = await requireFeatureBranch(cwd)
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

/** requireFeatureBranch returns the current branch for a guarded Verify operation. */
export async function requireFeatureBranch(cwd: string): Promise<string> {
  const branch = await Exec.captureStdout('git', ['symbolic-ref', '--short', 'HEAD'], { cwd })
  if (!branch.startsWith('feat/')) {
    Errors.ThrowUserInput('This hosted Verify operation requires a checked-out feat/ branch.')
  }
  return branch
}

type VerifyDispatchOptions = { withIos?: boolean; wait?: boolean; shards?: string }
const DispatchShardsRegx = /^([1-8])\/([0-7])\/([1-7])$/u
const VerifyRunUrlRegx = /^https:\/\/github\.com\/(?:dev-tao-org|tao-dev-org)\/tao-lang\/actions\/runs\/([1-9]\d*)$/u

function dispatchInputs(options: VerifyDispatchOptions): string[] {
  if (options.shards === undefined) {
    return options.withIos ? ['-f', 'ios_shards=2'] : []
  }
  const match = DispatchShardsRegx.exec(options.shards)
  if (!match) {
    Errors.ThrowUserInput('--shards requires TypeScript (1–8), iOS (0–7), and Android (1–7) counts.')
  }
  if (options.withIos && match[2] === '0') {
    Errors.ThrowUserInput('--with-ios requires a positive iOS shard count.')
  }
  return ['-f', 'typescript_shards=' + match[1], '-f', 'ios_shards=' + match[2], '-f', 'android_shards=' + match[3]]
}
