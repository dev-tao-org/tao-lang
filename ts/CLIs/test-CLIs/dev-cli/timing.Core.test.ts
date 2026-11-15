import { Json, NewlineCharacter, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, Exec, FS, Path, Platform } from '@shared/os'
import { Command } from '../../CLIs-src/cli-kit/bridges/Bridge_commander'
import timingSetupController from '../../CLIs-src/dev-cli/commands/timing-setup-controller'
import timingSetupRunner from '../../CLIs-src/dev-cli/commands/timing-setup-runner'
import { installSshConfig } from '../../CLIs-src/dev-cli/timing/SshKeyConfig'
import { readAuthenticatedKeyFingerprint } from '../../CLIs-src/dev-cli/timing/SshKeyDiagnostics'
import * as TimingCommandOptions from '../../CLIs-src/dev-cli/timing/TimingCommandOptions'
import * as TimingConnection from '../../CLIs-src/dev-cli/timing/TimingConnection'
import * as TimingReport from '../../CLIs-src/dev-cli/timing/TimingReport'
import { runTiming, type TimingRunIO } from '../../CLIs-src/dev-cli/timing/TimingRun'
import { setupTiming, type TimingSetupIO } from '../../CLIs-src/dev-cli/timing/TimingSetup'

const MissingTimingBaselineRegx = /\n\nTiming deviation: NOT ASSESSED — no previous comparable report on this runner\.$/

Tests.test('SSH setup identifies the key that signed the destination login from macOS logs', () => {
  const dedicated = 'SHA256:dedicated'
  const alternate = 'SHA256:alternate'
  const offer = `debug1: Server accepts key: /Users/fixture/.ssh/tao ED25519 ${dedicated} explicit`
  const first = `debug3: sign_and_send_pubkey: signing using ssh-ed25519 ${dedicated}`
  const fallback = `debug3: sign_and_send_pubkey: signing using ssh-ed25519 ${alternate}`
  const success = 'Authenticated to timing.invalid (via proxy) using "publickey".'
  Tests.expect(readAuthenticatedKeyFingerprint([offer, first, success].join('\r\n'))).toBe(dedicated)
  Tests.expect(readAuthenticatedKeyFingerprint([offer, first, fallback, success].join('\r\n'))).toBe(alternate)
  Tests.expect(readAuthenticatedKeyFingerprint([offer, first].join('\r\n'))).toBeUndefined()
})

Tests.test('SSH key setup preserves user settings and replaces its own entry on rerun', async () => {
  if (Platform.systemInfo().os !== 'Darwin') {
    return
  }
  const root = Artifacts.resolvePath('tmp')
  await FS.mkdir(root)
  const directory = await FS.mkdtemp(Path.join(root, 'ssh-config-'))
  await Try(async () => {
    const config = Path.join(directory, 'config')
    const original = S`
      Host other
        User someone
      Host timing.invalid
        IdentitiesOnly no
        AddKeysToAgent no
        UseKeychain no
    ` + NewlineCharacter
    const host = 'ro@timing.invalid'
    const key = Path.join(directory, 'id_ed25519_tao_primary')
    await FS.writeFile(config, original)
    await installSshConfig(host, key, config)
    const installed = await FS.readFile(config, 'utf8')
    Tests.expect(installed.startsWith(original)).toBe(true)
    Tests.expect(installed).toContain('Match originalhost timing.invalid user ro')
    Tests.expect(installed).toContain('  IdentityFile ~/.ssh/id_ed25519_tao_primary')
    Tests.expect(installed).toContain('  UseKeychain yes')
    const resolved = await Exec.captureStdout('/usr/bin/ssh', ['-G', '-F', config, '--', host])
    Tests.expect(resolved).toContain('identitiesonly no')
    Tests.expect(resolved).toContain('addkeystoagent false')
    await installSshConfig(host, key, config)
    Tests.expect(await FS.readFile(config, 'utf8')).toBe(installed)
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
})

Tests.test('both timing setup registrations preserve parsed browser choices and dry-run behavior', async () => {
  const registrations = [
    { command: timingSetupController, role: 'controller' as const, hostname: 'tao-controller' },
    { command: timingSetupRunner, role: 'runner' as const, hostname: 'tao-timing' },
  ]
  for (const { command, role, hostname } of registrations) {
    for (const args of [[], ['--no-browser'], ['--dry-run', '--no-browser']]) {
      const fixture = createSetupFixture()
      const parser = new Command().name(command.name)
      for (const option of command.options ?? []) {
        parser.option(option.flags, option.description)
      }
      parser.action(async () => {
        const options = parser.opts<TimingCommandOptions.TimingSetupCommandOptions>()
        await setupTiming(TimingCommandOptions.describeTimingSetup(role, options), fixture.io)
      })
      await parser.parseAsync(args, { from: 'user' })
      if (args.includes('--dry-run')) {
        Tests.expect(fixture.commands).toEqual([])
      } else {
        const browserArgs = args.length > 0 ? ['--no-browser'] : []
        Tests.expect(fixture.commands.find(record => record.name === 'netbird up')?.args)
          .toEqual(['--hostname', hostname, ...browserArgs])
      }
    }
  }
})

Tests.test('timing setup previews without mutation and retains its pinned package before installing a root service', async () => {
  const fixture = createSetupFixture()
  await setupTiming({ role: 'runner', dryRun: true }, fixture.io)
  Tests.expect(fixture.commands).toEqual([])
  await setupTiming({ role: 'runner', noBrowser: true }, fixture.io)
  Tests.expect(fixture.commands.map(command => command.name)).toEqual([
    'nix-store',
    'sudo env',
    'sudo env',
    'netbird up',
    'netbird status',
  ])
  Tests.expect(fixture.commands[0].args).toEqual([
    '--realise',
    '/nix/store/fixture-netbird',
    '--add-root',
    '/fixture/netbird-package',
    '--indirect',
  ])
  Tests.expect(fixture.commands[1].args).toEqual([
    'PATH=/nix/store/fixture-netbird/bin',
    'netbird',
    'service',
    'install',
  ])
  Tests.expect(fixture.commands[3].args).toEqual(['--hostname', 'tao-timing', '--no-browser'])
  const foreign = createSetupFixture(true)
  await Tests.expect(setupTiming({ role: 'controller' }, foreign.io)).rejects.toThrow('different executable')
  Tests.expect(foreign.commands).toEqual([])
})

Tests.test('timing connection returns locally and reuses an authenticated socket without opening another master', async () => {
  const { commands, phases, io } = createConnectionFixture()
  await TimingConnection.connectTiming({ host: 'ro@fixture.netbird.cloud' }, io)
  Tests.expect(phases).toEqual(['interactive', 'noninteractive'])
  Tests.expect(commands.length).toBe(2)
  Tests.expect(commands[0].name).toContain('ssh -fN')
  Tests.expect(commands[0].args).toEqual([
    '-S',
    '/private/tmp/Timing Fixtures/control.sock',
    '--',
    'ro@fixture.netbird.cloud',
  ])
  Tests.expect(commands[1].args).toEqual([
    '-S',
    '/private/tmp/Timing Fixtures/control.sock',
    '--',
    'ro@fixture.netbird.cloud',
    'true',
  ])
  commands.length = 0
  io.exists = async () => true
  await TimingConnection.connectTiming({ host: 'ro@fixture.netbird.cloud' }, io)
  Tests.expect(commands.map(command => command.name)).toEqual(['ssh -O check'])
  Tests.expect(commands[0].args).toEqual([
    '-S',
    '/private/tmp/Timing Fixtures/control.sock',
    '--',
    'ro@fixture.netbird.cloud',
  ])
  await TimingConnection.disconnectTiming({ host: 'ro@fixture.netbird.cloud' }, io)
  Tests.expect(commands.at(-1)?.name).toBe('ssh -O exit')
  Tests.expect(commands.at(-1)?.args).toEqual([
    '-S',
    '/private/tmp/Timing Fixtures/control.sock',
    '--',
    'ro@fixture.netbird.cloud',
  ])
  const count = commands.length
  io.exists = async () => false
  await TimingConnection.disconnectTiming({ host: 'ro@fixture.netbird.cloud' }, io)
  Tests.expect(commands.length).toBe(count)
})

Tests.test('timing remote jobs retain literal paths and reject invalid workloads before executing', async () => {
  const commands: RecordedCommand[] = []
  const printed: string[] = []
  const request = {
    host: 'ro@fixture.netbird.cloud',
    repo: "/Users/ro/Timing X's",
    samples: 5,
    edits: 24,
    controlPath: '/private/tmp/Timing Fixtures/control.sock',
  }
  const report = createTimingReportFixture(request.repo)
  const reportsDirectory = Artifacts.resolvePath('tmp/timing-report', Platform.randomUUID())
  Artifacts.trackTemporary(reportsDirectory)
  const execute: TimingSetupIO['execute'] = async (name, options) => {
    commands.push({ name, args: [...options?.variadicArgs ?? []] })
    const responses = [`Performance job: ${report.directory}\n`, Json.Print([report]), createJobResponse(report)]
    const response = responses[commands.length - 1]
    options?.output?.stdout(response)
  }
  const io: TimingRunIO = {
    execute,
    print: message => printed.push(message),
    summary: message => printed.push(message),
    resolveSocket: () => '/private/tmp/reusable.sock',
    reportsDirectory,
  }
  const invokeTiming = (input: typeof request) => runTiming(input, io)
  await invokeTiming(request)
  Tests.expect(commands.length).toBe(3)
  Tests.expect(commands[0].name).toContain('BatchMode=yes')
  Tests.expect(commands[0].args.slice(0, 3)).toEqual(['-S', '/private/tmp/Timing Fixtures/control.sock', '--'])
  Tests.expect(commands[0].args.at(-1)).toContain("'--samples' '5' '--edits' '24'")
  Tests.expect(commands[0].args.at(-1)).toContain('\'exec "$@"\'')
  Tests.expect(commands[0].args.at(-1)).toContain("'--repo' '/Users/ro/Timing X'\\''s'")
  Tests.expect(commands[1].args.at(-1)).toContain("'summarize'")
  Tests.expect(printed.at(-1)).toContain('5 independent sessions × 24 edits')
  Tests.expect(printed.at(-1)).toContain('25.00')
  Tests.expect(printed.at(-1)).toContain('20.00–30.00')
  Tests.expect(printed.at(-1)).toMatch(MissingTimingBaselineRegx)
  await Tests.expect(invokeTiming({ ...request, edits: 3 })).rejects.toThrow('positive multiple of four')
  await Tests.expect(invokeTiming({ ...request, host: '-oProxyCommand=surprise' })).rejects.toThrow('SSH alias')
  Tests.expect(commands.length).toBe(3)
})

Tests.test('retained timing reports select one exact job and never launch another measurement', async () => {
  const report = createTimingReportFixture('/Users/ro/Timing')
  const commands: RecordedCommand[] = []
  const responses = ['11111111-2222-3333-4444-555555555555\n', Json.Print([report]), createJobResponse(report)]
  const execute: TimingSetupIO['execute'] = async (name, options) => {
    commands.push({ name, args: [...options?.variadicArgs ?? []] })
    options?.output?.stdout(responses.shift()!)
  }
  const request = { host: 'ro@fixture.local', tooling: '/Users/ro/Timing' }
  const collected = await TimingReport.readTimingReport(request, '/private/tmp/fixture.sock', execute)
  Tests.expect(collected).toEqual(report)
  Tests.expect(commands[0].args.at(-1)).toContain("'/bin/ls' '-1t'")
  Tests.expect(commands[1].args.at(-1)).toContain("'summarize'")
  Tests.expect(commands.every(command => !command.args.at(-1)?.includes("'run'"))).toBe(true)
  Tests.expect(() => TimingReport.readTimingJobPath('', request.tooling)).toThrow('one timing job identity')
  Tests.expect(() => TimingReport.readTimingJobPath('Performance job: /outside/jobs/fixture\n', request.tooling))
    .toThrow('inside this tooling checkout')
})

type RecordedCommand = { name: unknown; args: string[] }

function createTimingReportFixture(tooling: string): TimingReport.TimingReport {
  return {
    runner: 'ro@fixture.local',
    startedAt: '2026-11-01T10:00:00.000Z',
    finishedAt: '2026-11-01T10:01:00.000Z',
    directory: tooling + '/.artifacts/notes/performance-investigation/jobs/11111111-2222-3333-4444-555555555555',
    commit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    fixtureSha256: 'fixture',
    settings: { repo: tooling, fixture: tooling + '/fixture.tao', samples: 5, edits: 24 },
    conditions: {
      browser: 'fixture',
      runtime: 'fixture',
      system: {},
      measurement: { editCount: 24, frameCount: 2, extraViews: 0, extraFileCount: 0 },
      frameSizes: [{ width: 380, height: 756 }, { width: 899, height: 756 }],
    },
    groups: [{
      name: 'warm/text',
      sessions: 5,
      medianMs: 25,
      minMs: 20,
      maxMs: 30,
      runMediansMs: [20, 22, 25, 28, 30],
    }],
    interpretation: 'Fixture independent-session summary.',
  }
}

function createJobResponse(report: TimingReport.TimingReport): string {
  return Json.Print({
    ...report,
    version: 1,
    status: 'passed',
    environment: {},
    system: { os: 'Fixture', architecture: 'fixture', kernel: 'fixture' },
    samples: ['sample-1.json'],
  })
}

function createConnectionFixture() {
  const commands: RecordedCommand[] = []
  const phases: string[] = []
  const io: TimingConnection.TimingConnectionIO = {
    interactive: true,
    async execute(name, options) {
      phases.push('noninteractive')
      commands.push({ name, args: [...options?.variadicArgs ?? []] })
    },
    async executeInteractive(name, options) {
      phases.push('interactive')
      commands.push({ name, args: [...options?.variadicArgs ?? []] })
    },
    exists: async () => false,
    async mkdir() {},
    print() {},
    resolveSocket: () => '/private/tmp/Timing Fixtures/control.sock',
  }
  return { commands, phases, io }
}

function createSetupFixture(installed = false) {
  const commands: RecordedCommand[] = []
  const io: TimingSetupIO = {
    platform: 'Darwin',
    interactive: true,
    capture: async () => '/foreign/netbird',
    resolveExecutable: async () => '/nix/store/fixture-netbird/bin/netbird',
    async execute(name, options) {
      commands.push({ name, args: [...options?.variadicArgs ?? []] })
    },
    async executeInteractive(name, options) {
      commands.push({ name, args: [...options?.variadicArgs ?? []] })
    },
    exists: async () => installed,
    async mkdir() {},
    print() {},
    packageRoot: '/fixture/netbird-package',
  }
  return { io, commands }
}
