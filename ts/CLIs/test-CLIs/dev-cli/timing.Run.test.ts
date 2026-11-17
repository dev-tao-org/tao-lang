import { NewlineCharacter, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import timingWatch from '../../CLIs-src/dev-cli/commands/timing-watch'
import { runTiming } from '../../CLIs-src/dev-cli/timing/TimingRun'

Tests.test('the timing recipe selects the configured runner unless a local diagnostic is explicit', async () => {
  const cwd = Repo.getWorkspaceRoot()
  const addEnv = { TAO_TIMING_HOST: 'runner.invalid', TAO_TIMING_CHECKOUT: '/runner/checkout' }
  const remote = await Exec.captureStdout('just', ['timing', '--dry-run'], { cwd, addEnv })
  Tests.expect(remote).toContain('5 sessions × 24 edits on runner.invalid, checkout /runner/checkout')

  const local = await Exec.captureStdout('just', ['timing', '--local', '--dry-run'], { cwd, addEnv })
  Tests.expect(local).toContain('Would run a local preview diagnostic in the current checkout.')

  const unconfigured = { TAO_TIMING_HOST: undefined, TAO_TIMING_CHECKOUT: undefined }
  const failure = await Exec.capture('just', ['timing', '--dry-run'], { cwd, addEnv: unconfigured, check: false })
  Tests.expect(failure.status).not.toBe(0)
  Tests.expect(failure.stdout + failure.stderr).toContain('Set TAO_TIMING_HOST and TAO_TIMING_CHECKOUT')
})

Tests.test.skipIf(Path.sep === '\\')('timing resolves the fixture in the runner candidate tree', async () => {
  const temporary = Artifacts.resolvePath('tmp')
  await FS.mkdir(temporary)
  const directory = await FS.mkdtemp(Path.join(temporary, 'timing-runner-'))
  const recording = Path.join(directory, 'calls')
  await Try(async () => {
    await writeTimingRunner(directory)
    const repo = '/runner/Candidate checkout'
    const request = {
      host: 'runner.invalid',
      repo,
      tooling: '/runner/tooling',
      samples: 1,
      edits: 24,
      label: 'Partial Review',
      controlPath: 'none',
    }
    await Tests.withEnv({ PATH: directory, TAO_TIMING_SSH_RECORDING: recording }, async () => {
      await runTiming({ ...request, dryRun: true })
      Tests.expect(await FS.exists(recording)).toBe(false)
      await Tests.expect(runTiming(request)).rejects.toThrow('one timing job identity')
      const calls = (await FS.readFile(recording, 'utf8')).trimEnd().split(NewlineCharacter)
      Tests.expect(calls).toHaveLength(2)
      const [lookup, run] = calls
      Tests.expect(lookup).toContain(`'git' '-C' '${repo}' 'ls-tree' '-rz' 'HEAD'`)
      Tests.expect(run).toContain(`'--fixture' '${repo}/ts/relocated fixtures/Performance/Performance.tao'`)
      Tests.expect(run).toContain("'--label' 'Partial Review'")
      await FS.writeFile(recording, '')
      const fixture = '/runner/explicit.tao'
      await Tests.expect(runTiming({ ...request, fixture })).rejects.toThrow('one timing job identity')
      const overridden = (await FS.readFile(recording, 'utf8')).trimEnd().split(NewlineCharacter)
      Tests.expect(overridden).toHaveLength(1)
      Tests.expect(overridden[0]).toContain(`'--fixture' '${fixture}'`)
    })
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
})

Tests.test.skipIf(Path.sep === '\\')('timing watch defaults to the runner and can follow the local log', async () => {
  const directory = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/timing-watch-'))
  const recording = Path.join(directory, 'calls')
  await Try(async () => {
    await writeTimingRunner(directory)
    await FS.cp(Path.join(directory, 'ssh'), Path.join(directory, 'tail'))
    const env = { PATH: directory, TAO_TIMING_HOST: undefined, TAO_TIMING_SSH_RECORDING: recording }
    await Tests.withEnv(env, () => timingWatch.action(undefined, {}))
    const args = (await FS.readFile(recording + '.args', 'utf8')).trimEnd().split(NewlineCharacter)
    Tests.expect(args).toContain('ro@192.168.50.199')
    Tests.expect(args).toContain('-tt')
    Tests.expect(args).toContain('-S')
    Tests.expect(args[args.indexOf('-S') + 1]).toStartWith(Path.home('.tao-dev/ssh/s-'))
    await Tests.withEnv({ ...env, HOME: directory }, () => timingWatch.action(undefined, { local: true }))
    const [remote, local] = (await FS.readFile(recording, 'utf8')).trimEnd().split(NewlineCharacter)
    Tests.expect(remote).toContain("'tao-timing' '.tao-dev/timing/transfers/live-preview.log'")
    Tests.expect(local).toBe(Path.join(directory, '.tao-dev/timing/transfers/live-preview.log'))
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
})

async function writeTimingRunner(directory: string): Promise<void> {
  const executable = Path.join(directory, 'ssh')
  const script = S`
    #!/bin/sh
    printf '%s\\n' "$@" >> "$TAO_TIMING_SSH_RECORDING.args"
    for command do :; done
    printf '%s\\n' "$command" >> "$TAO_TIMING_SSH_RECORDING"
    case "$command" in
      *"'ls-tree'"*)
        printf '100644 blob 1111111111111111111111111111111111111111\\tts/relocated fixtures/Performance/Performance.tao\\000'
        ;;
    esac
  `
  await FS.writeFile(executable, script + NewlineCharacter)
  await FS.chmod(executable, 0o755)
}
