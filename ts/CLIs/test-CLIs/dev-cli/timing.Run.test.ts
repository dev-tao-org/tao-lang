import { NewlineCharacter, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { runTiming } from '../../CLIs-src/dev-cli/timing/TimingRun'

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
      await FS.writeFile(recording, '')
      const fixture = '/runner/explicit.tao'
      await Tests.expect(runTiming({ ...request, fixture })).rejects.toThrow('one timing job identity')
      const overridden = (await FS.readFile(recording, 'utf8')).trimEnd().split(NewlineCharacter)
      Tests.expect(overridden).toHaveLength(1)
      Tests.expect(overridden[0]).toContain(`'--fixture' '${fixture}'`)
    })
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
})

async function writeTimingRunner(directory: string): Promise<void> {
  const executable = Path.join(directory, 'ssh')
  const script = S`
    #!/bin/sh
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
