import { Errors, Try } from '@shared'
import { Artifacts, FileSystem, Platform, Repo } from '@shared/os'

/** doctorReport gathers diagnostics for the active implementation without changing developer state. */
export async function doctorReport(fingerprintOnly = false): Promise<{
  version: 1
  repositoryRoot: string
  checks: Check[]
  status: Check['status']
  fingerprint: Fingerprint
}> {
  const snapshot = await readSnapshot()
  const fingerprint = await readFingerprint(snapshot)
  const checks = fingerprintOnly ? [] : await readChecks(snapshot)
  const status = checks.some(check => check.status === 'fail')
    ? 'fail'
    : checks.some(check => check.status === 'warn')
    ? 'warn'
    : 'pass'
  return { version: 1, repositoryRoot: Repo.getWorkspaceRoot(), checks, status, fingerprint }
}

/** safeToken admits only plain version and identifier tokens into the pasteable fingerprint. */
export function safeToken(value: string | undefined): string | undefined {
  const token = value?.trim()
  return token && /^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(token) ? token : undefined
}

/** toolVersion extracts a version token while dropping paths and other identifying output. */
export function toolVersion(output: string | undefined): string | undefined {
  const token = output?.split('\n')[0]?.trim().split(/\s+/).map(value => value.replace(/,$/, ''))
    .find(value => /^v?[0-9][0-9A-Za-z._+-]*$/.test(value))
  return safeToken(token?.replace(/^v/, ''))
}

/** diagnoseTools classifies required runtime versions and optional local-service tools. */
export function diagnoseTools(tools: readonly string[], versions: readonly (string | undefined)[]): Check[] {
  return tools.map((name, index) => {
    const version = toolVersion(versions[index])
    const optional = name === 'age' || name === 'docker'
    if (!version) {
      return {
        name,
        status: optional ? 'warn' : 'fail',
        detail: 'Not available on the managed PATH.',
        remediation: 'Enter the repository devenv; run ./agent setup.',
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

/** assertDoctorReady raises the diagnosis after its report has been printed. */
export function assertDoctorReady(status: Check['status']): void {
  if (status === 'fail') {
    Errors.ThrowUserInput('Doctor found required setup failures; resolve the FAIL entries above.')
  }
}

type Check = { name: string; status: 'pass' | 'warn' | 'fail'; detail: string; remediation?: string }
type Fingerprint = {
  version: 1
  architecture?: string
  kernel: { name?: string; version?: string }
  os: { name?: string }
  tao: { commit?: string; describe?: string; modified?: boolean }
  toolchain: { name: string; present: boolean; version?: string; hash?: string }[]
}

const tools = ['bun', 'node', 'git', 'just', 'dprint', 'tsc', 'age', 'docker']

async function readSnapshot() {
  const [versions, commit, describe, changes] = await Promise.all([
    Promise.all(tools.map(tool => probe(tool + ' --version'))),
    probe('git rev-parse HEAD'),
    probe('git describe --always --dirty'),
    probe('git status --porcelain'),
  ])
  return { versions, commit, describe, changes }
}

type Snapshot = Awaited<ReturnType<typeof readSnapshot>>

async function readFingerprint(snapshot: Snapshot): Promise<Fingerprint> {
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
    const hash = gitHash(await probe('git hash-object --', { variadicArgs: [name] }))
    fingerprint.toolchain.push({ name, present: hash !== undefined, hash })
  }
  return fingerprint
}

async function readChecks(snapshot: Snapshot): Promise<Check[]> {
  const checks = diagnoseTools(tools, snapshot.versions)
  const main = Try(Repo.getMainWorktreeRoot, {
    catch() {
      return undefined
    },
  })
  checks.push({
    name: 'Git worktree',
    status: main ? 'pass' : 'warn',
    detail: main ? 'Primary worktree: ' + main : 'Could not determine the primary worktree.',
  })
  checks.push(...workspaceChecks())
  checks.push(...await artifactChecks())
  // Generated parser, Studio, Expo, native toolchains and machine-lane diagnostics await their new implementations.
  return checks
}

function workspaceChecks(): Check[] {
  return ['package.json', 'bun.lock', 'node_modules'].map(name => {
    const present = FileSystem.existsSync(Repo.resolvePath('ts', name))
    return {
      name: 'workspace ' + name,
      status: present ? 'pass' : 'fail',
      detail: present ? 'Present in ts/.' : 'Missing from ts/.',
      remediation: present ? undefined : './agent setup',
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

async function probe(command: string, options: { variadicArgs?: readonly string[] } = {}): Promise<string | undefined> {
  return Try(() => Platform.capture(command, { variadicArgs: options.variadicArgs, cwd: Repo.getWorkspaceRoot() }), {
    catch() {
      return undefined
    },
  })
}

function gitHash(value: string | undefined): string | undefined {
  return value && /^[0-9a-f]{40}$/.test(value) ? value : undefined
}

function isSupportedRuntime(name: string, version: string): boolean {
  const [major, minor = 0, patch = 0] = version.split('.').map(Number)
  if (name === 'node') {
    return major === 24
  }
  if (name !== 'bun') {
    return true
  }
  return major > 1 || (major === 1 && (minor > 4 || (minor === 4 && patch >= 2)))
}
