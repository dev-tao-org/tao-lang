import { Errors } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import * as Check from '../../cli-checks/check'
import { parseSlowTestSeconds } from '../../cli-checks/slow-tests'
import { parseTestShard, selectHostedTypeScriptFiles } from '../testing/HostedTestShards'
import { runTaoTests } from '../testing/TaoTests'
import { planTestExecution, type TestExecutionOptions } from '../testing/TestPlan'
import { registerCommand } from './_command-runner'

type TestCommandOptions = TestExecutionOptions & {
  slow?: string
  platform?: string
  expoGo?: string
  suite?: string
  shard?: string
}
/** testCommand runs TypeScript and Tao app tests, retaining scoped selections. */
export default registerCommand({
  name: 'test',
  description: 'Run all TypeScript and Tao app tests; optionally select a Tao file or TypeScript path/name.',
  arguments: [{ name: 'target', description: 'Test file or directory.' }],
  options: [{
    flags: '--slow <seconds>',
    description: 'Warn for TypeScript tests exceeding this duration in seconds.',
    defaultValue: '0.075',
  }, {
    flags: '--platform <platform>',
    description: 'Run only authored Tao journeys on ios or android.',
  }, {
    flags: '--expo-go <path>',
    description: 'Use this SDK-matched Expo Go simulator app or emulator APK for native tests.',
  }, {
    flags: '--suite <suite>',
    description: 'Select the full typescript or web suite.',
  }, {
    flags: '--shard <index/count>',
    description: 'Run one CI partition of the TypeScript or native suite.',
  }, {
    flags: '--yes',
    description: 'Authorize required app dependency setup.',
  }, {
    flags: '--serial',
    description: 'Run TypeScript then Tao tests with one worker each.',
  }, {
    flags: '--parallel [workers]',
    description: 'Run concurrently with an optional total worker cap (defaults: 5 TypeScript, 1 Tao).',
  }],
  async action(target?: string, options: TestCommandOptions = {}) {
    if (options.shard !== undefined && target !== undefined) {
      Errors.ThrowUserInput('--shard cannot be combined with a test target.')
    }
    if (options.suite !== undefined) {
      await runSelectedSuite(target, options)
      return
    }
    if (options.platform !== undefined) {
      await runNativeTests(target, options)
      return
    }
    if (options.shard !== undefined) {
      Errors.ThrowUserInput('--shard requires --suite typescript or --platform.')
    }
    const slowSeconds = parseSlowTestSeconds(options.slow)
    const execution = { serial: options.serial, parallel: options.parallel, yes: options.yes }
    planTestExecution(execution)
    if (target?.endsWith('.tao')) {
      const path = Repo.resolvePath(target)
      Check.assertNewWorkspacePath(path)
      await runTaoTests(path, execution)
      return
    }
    await Check.assertNewWorkspaceTree()
    if (target) {
      Check.assertNewWorkspacePath(Repo.resolvePath(target))
    }
    const workspaceTarget = workspaceTestTarget(target)
    const args = resolveTestArguments(workspaceTarget, target)
    await Check.workspaceTests(args, slowSeconds, execution)
  },
})

async function runNativeTests(target: OptionalTestTarget, options: TestCommandOptions): Promise<void> {
  const platform = options.platform
  if (platform !== 'ios' && platform !== 'android') {
    Errors.ThrowUserInput('Select ios or android with --platform.')
  }
  if (!options.expoGo) {
    Errors.ThrowUserInput('Provide the SDK-matched simulator app or emulator APK with --expo-go.')
  }
  const path = Repo.resolvePath(target ?? '.')
  Check.assertNewWorkspacePath(path)
  const { runNativeTaoTests } = await import('../testing/NativeTaoTests')
  const shard = options.shard === undefined ? undefined : parseTestShard(options.shard)
  await runNativeTaoTests(platform, Repo.resolvePath(options.expoGo), path, options.yes, shard)
}

async function runSelectedSuite(target: OptionalTestTarget, options: TestCommandOptions): Promise<void> {
  if (target !== undefined || options.platform !== undefined || options.expoGo !== undefined) {
    Errors.ThrowUserInput('--suite selects a full portable suite.')
  }
  const execution = { serial: options.serial, parallel: options.parallel, yes: options.yes }
  if (options.suite === 'web' && options.shard === undefined) {
    await runTaoTests(Repo.resolvePath('Apps'), execution)
    return
  }
  if (options.suite !== 'typescript') {
    Errors.ThrowUserInput('Select typescript or web. Use --shard only with the TypeScript suite.')
  }
  await Check.assertNewWorkspaceTree()
  const slowSeconds = parseSlowTestSeconds(options.slow)
  if (options.shard === undefined) {
    await Check.workspaceTests([Repo.resolvePath('ts')], slowSeconds, execution)
    return
  }
  if (options.parallel !== undefined) {
    Errors.ThrowUserInput('Each hosted shard has its own runner. Use --serial with --shard.')
  }
  const files = await selectHostedTypeScriptFiles(parseTestShard(options.shard))
  await Check.workspaceTests(files, slowSeconds, { ...execution, serial: true, requireCompleteTypeScriptFiles: true })
}

type OptionalTestTarget = string | undefined

function resolveTestArguments(workspaceTarget: OptionalTestTarget, target: OptionalTestTarget): string[] {
  if (workspaceTarget) {
    return [workspaceTarget]
  }
  if (target) {
    return ['--test-name-pattern', target]
  }
  return []
}

function workspaceTestTarget(target: OptionalTestTarget): OptionalTestTarget {
  if (!target) {
    return undefined
  }
  const path = resolveTestTargetPath(target)
  Check.assertNewWorkspacePath(path)
  const canonical = FS.existsSync(path) ? FS.realpathSync(path) : path
  const root = FS.realpathSync(Repo.getWorkspaceRoot())
  const workspace = FS.realpathSync(Repo.resolvePath('ts'))
  if (canonical === root) {
    return workspace
  }
  if (FS.existsSync(path) || Path.isAbsolute(target)) {
    Check.assertNewWorkspacePath(path, workspace)
    return canonical
  }
  return undefined
}

function resolveTestTargetPath(target: string): string {
  const workspacePath = Path.resolve(Repo.resolvePath('ts'), target)
  const useWorkspacePath = Path.isAbsolute(target) || FS.existsSync(workspacePath)
  if (useWorkspacePath) {
    return workspacePath
  }
  return Repo.resolvePath(target)
}
