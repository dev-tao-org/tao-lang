import { Errors, NewlineCharacter, Regxs, Try } from '@shared'
import { Artifacts, FS, Platform, Repo } from '@shared/os'
import Exec, { type CommandArgs } from '@shared/os/exec'

/** DoctorReport contains environment diagnostics and the host fingerprint. */
export type DoctorReport = {
  version: 1
  repositoryRoot: string
  checks: Check[]
  status: Check['status']
  fingerprint: Fingerprint
}
/** doctorReport gathers diagnostics for the active implementation without changing developer state. */
export async function doctorReport(fingerprintOnly = false): Promise<DoctorReport> {
  const snapshot = await readSnapshot()
  const fingerprint = await readFingerprint(snapshot)
  const checks = fingerprintOnly ? [] : await readChecks(snapshot)
  const status = resolveReportStatus(checks)
  return { version: 1, repositoryRoot: Repo.getWorkspaceRoot(), checks, status, fingerprint }
}

/** assertDoctorReady raises the diagnosis after its report has been printed. */
export function assertDoctorReady(status: Check['status']): void {
  if (status === 'fail') {
    Errors.ThrowUserInput('Doctor found required setup failures; resolve the FAIL entries above.')
  }
}

type OptionalToolOutput = string | undefined
type CheckStatus = 'pass' | 'warn' | 'fail'

function resolveReportStatus(checks: readonly Check[]): Check['status'] {
  if (checks.some(check => check.status === 'fail')) {
    return 'fail'
  }
  if (checks.some(check => check.status === 'warn')) {
    return 'warn'
  }
  return 'pass'
}

function safeToken(value: OptionalToolOutput): string | undefined {
  const token = value?.trim()
  return token && Regxs.DoctorToken.test(token) ? token : undefined
}

function toolVersion(output: OptionalToolOutput): string | undefined {
  const token = output?.split(NewlineCharacter)[0]?.trim().split(Regxs.WhitespaceRunsRegx).map(value =>
    value.replace(Regxs.TrailingComma, '')
  )
    .find(value => Regxs.ToolVersionToken.test(value))
  return safeToken(token?.replace(Regxs.VersionPrefix, ''))
}

function diagnoseTools(
  tools: readonly string[],
  versions: readonly OptionalToolOutput[],
  failures: readonly OptionalToolOutput[] = [],
): Check[] {
  return tools.map((name, index) => {
    const version = toolVersion(versions[index])
    const optional = name === 'age' || name === 'docker'
    if (!version) {
      const diagnostic = failures[index] || versions[index]?.trim()
      return {
        name,
        status: optional ? 'warn' : 'fail',
        detail: diagnostic || 'Not available on the managed PATH.',
        remediation: 'Enter the repository devenv; run ./agent unsandboxed setup.',
      }
    }
    if (!isSupportedRuntime(name, version)) {
      return {
        name,
        status: 'fail',
        detail: `Unsupported version ${version}; requires Node 24 and Bun >=1.4.2.`,
        remediation: 'Enter the pinned repository devenv.',
      }
    }
    return { name, status: 'pass', detail: version }
  })
}

type Check = { name: string; status: CheckStatus; detail: string; remediation?: string }
type Fingerprint = {
  version: 1
  architecture?: string
  kernel: { name?: string; version?: string }
  os: { name?: string }
  tao: { commit?: string; describe?: string; modified?: boolean }
  toolchain: { name: string; present: boolean; version?: string; hash?: string }[]
}

type DoctorSnapshot = {
  versions: OptionalToolOutput[]
  failures: OptionalToolOutput[]
  commit: OptionalToolOutput
  describe: OptionalToolOutput
  changes: OptionalToolOutput
}

const tools = ['bun', 'node', 'git', 'just', 'dprint', 'tsc', 'age', 'docker']

async function readSnapshot(): Promise<DoctorSnapshot> {
  const [probes, commit, describe, changes] = await Promise.all([
    Promise.all(tools.map(probeTool)),
    probe('git', 'rev-parse HEAD'),
    probe('git', 'describe --always --dirty'),
    probe('git', 'status --porcelain'),
  ])
  return {
    versions: probes.map(probe => probe.output),
    failures: probes.map(probe => probe.failure),
    commit,
    describe,
    changes,
  }
}

async function probeTool(tool: string): Promise<{ output?: string; failure?: string }> {
  return await Try(async () => ({
    output: await Exec.captureStdout(tool, '--version', { cwd: Repo.getWorkspaceRoot() }),
  }), {
    catch(error) {
      const failure = Errors.isCommandExecutionError(error)
        ? error.result.stderr.trim() || error.result.stdout.trim() || `Exited with status ${error.result.status}.`
        : String(error)
      return { failure }
    },
  })
}

async function readFingerprint(snapshot: DoctorSnapshot): Promise<Fingerprint> {
  const system = Platform.systemInfo()
  const fingerprint: Fingerprint = {
    version: 1,
    architecture: safeToken(system.architecture),
    kernel: { name: safeToken(system.os), version: safeToken(system.kernel) },
    os: { name: safeToken(system.os) },
    tao: {
      commit: gitHash(snapshot.commit)?.slice(0, 12),
      describe: safeToken(snapshot.describe),
      modified: snapshot.changes === undefined ? undefined : snapshot.changes !== '',
    },
    toolchain: tools.map((name, index) => ({
      name,
      present: snapshot.versions[index] !== undefined,
      version: toolVersion(snapshot.versions[index]),
    })),
  }
  for (const name of ['ts/bun.lock', 'devenv.lock']) {
    const hash = gitHash(await probe('git', ['hash-object', '--', name]))
    fingerprint.toolchain.push({ name, present: hash !== undefined, hash })
  }
  return fingerprint
}

async function readChecks(snapshot: DoctorSnapshot): Promise<Check[]> {
  const checks = diagnoseTools(tools, snapshot.versions, snapshot.failures)
  const main = Try.WithDefault(undefined, Repo.getMainWorktreeRoot)
  checks.push({
    name: 'Git worktree',
    status: main ? 'pass' : 'warn',
    detail: main ? 'Primary worktree: ' + main : 'Could not determine the primary worktree.',
  })
  checks.push(...workspaceChecks())
  checks.push(...await artifactChecks())
  // Studio, Expo, native toolchain and machine-lane diagnostics await their new implementations.
  return checks
}

function workspaceChecks(): Check[] {
  return ['package.json', 'bun.lock', 'node_modules'].map(name => {
    const present = FS.existsSync(Repo.resolvePath('ts', name))
    return {
      name: 'workspace ' + name,
      status: present ? 'pass' : 'fail',
      detail: present ? 'Present in ts/.' : 'Missing from ts/.',
      remediation: present ? undefined : './agent unsandboxed setup',
    }
  })
}

async function artifactChecks(): Promise<Check[]> {
  return Promise.all(['', 'logs', 'cache', 'build', 'tmp'].map(async name => {
    const writable = await Artifacts.isWritable(name)
    return {
      name: 'artifacts ' + (name || 'root'),
      status: writable ? 'pass' : 'fail',
      detail: writable ? 'The artifact location is writable.' : 'The artifact location is not writable.',
    }
  }))
}

async function probe(command: string, args: CommandArgs): Promise<string | undefined> {
  return Try.WithDefault(
    undefined,
    () => Exec.captureStdout(command, args, { cwd: Repo.getWorkspaceRoot() }),
  )
}

function gitHash(value: OptionalToolOutput): string | undefined {
  return value && Regxs.Sha1HashRegx.test(value) ? value : undefined
}

function isSupportedRuntime(name: string, version: string): boolean {
  const [major, minor = 0, patch = 0] = version.split('.').map(Number)
  if (name === 'node') {
    return major === 24
  }
  if (name !== 'bun') {
    return true
  }
  if (major !== 1) {
    return major > 1
  }
  return minor > 4 || (minor === 4 && patch >= 2)
}
