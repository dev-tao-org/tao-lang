import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import { repositoryRoot } from './cli-kit'

type Check = { name: string; status: 'pass' | 'warn' | 'fail'; detail: string; remediation?: string }
type Fingerprint = {
  version: 1
  architecture?: string
  kernel: { name?: string; version?: string }
  os: { name?: string }
  tao: { commit?: string; describe?: string; modified?: boolean }
  toolchain: { name: string; present: boolean; version?: string; hash?: string }[]
}

/** doctorReport gathers diagnostics for the active implementation without changing developer state. */
export async function doctorReport(fingerprintOnly = false): Promise<{
  version: 1
  repositoryRoot: string
  checks: Check[]
  status: Check['status']
  fingerprint: Fingerprint
}> {
  const tools = ['bun', 'node', 'git', 'just', 'dprint', 'tsc', 'age', 'docker']
  const versions = await Promise.all(tools.map(tool => probe(tool + ' --version')))
  const [commit, describe, changes, branch, origin, configuredOrigin, helpers] = await Promise.all([
    probe('git rev-parse HEAD'),
    probe('git describe --always --dirty'),
    probe('git status --porcelain'),
    probe('git symbolic-ref --quiet --short HEAD'),
    probe('git remote get-url origin'),
    probe('git config --local --get remote.origin.url'),
    probe('git config --get-all credential.https://github.com.helper'),
  ])
  const system = Platform.systemInfo()
  const fingerprint: Fingerprint = {
    version: 1,
    architecture: safeToken(system.architecture),
    kernel: { name: safeToken(system.os), version: safeToken(system.kernel) },
    os: { name: safeToken(system.os) },
    tao: {
      commit: gitHash(commit)?.slice(0, 12),
      describe: safeToken(describe),
      modified: changes === undefined ? undefined : changes !== '',
    },
    toolchain: tools.map((name, index) => ({
      name,
      present: versions[index] !== undefined,
      version: toolVersion(versions[index]),
    })),
  }
  for (const name of ['ts/bun.lock', 'devenv.lock']) {
    const hash = gitHash(await probe('git hash-object --', [name]))
    fingerprint.toolchain.push({ name, present: hash !== undefined, hash })
  }
  if (fingerprintOnly) {
    return { version: 1, repositoryRoot, checks: [], status: 'pass', fingerprint }
  }
  const checks = diagnoseTools(tools, versions)
  checks.push({
    name: 'Git branch',
    status: branch ? 'pass' : 'warn',
    detail: branch ?? 'Detached HEAD; select a branch before committing.',
  })
  for (const name of ['package.json', 'bun.lock', 'node_modules']) {
    const present = FileSystem.existsSync(Path.join(repositoryRoot, 'ts', name))
    checks.push({
      name: 'workspace ' + name,
      status: present ? 'pass' : 'fail',
      detail: present ? 'Present in ts/.' : 'Missing from ts/.',
      remediation: present ? undefined : './agent setup',
    })
  }
  checks.push(diagnoseGitHub(configuredOrigin, origin, helpers))
  for (const name of ['', 'logs', 'cache', 'build', 'tmp']) {
    const artifact = Path.join(repositoryRoot, '.artifacts', name)
    let existing = artifact
    while (!FileSystem.existsSync(existing)) {
      existing = Path.dirname(existing)
    }
    const writable = await Try(async () => {
      await FileSystem.access(existing, FileSystem.constants.W_OK)
      return true
    }, { catch: () => false })
    checks.push({
      name: 'artifacts ' + (name || 'root'),
      status: writable ? 'pass' : 'fail',
      detail: writable ? 'The artifact location is writable.' : 'The artifact location is not writable.',
    })
  }
  checks.push(...await gitHookChecks())
  // Generated parser, Studio, Expo, native toolchains and machine-lane diagnostics await their new implementations.
  const status = checks.some(check => check.status === 'fail')
    ? 'fail'
    : checks.some(check => check.status === 'warn')
    ? 'warn'
    : 'pass'
  return { version: 1, repositoryRoot, checks, status, fingerprint }
}

/** diagnoseGitHub preserves required HTTPS transport and the expected GitHub CLI helper diagnostics. */
export function diagnoseGitHub(
  configured: string | undefined,
  effective: string | undefined,
  helpers: string | undefined,
): Check {
  const name = 'GitHub transport'
  const remediation = 'just setup-github'
  if (!effective?.startsWith('https://github.com/')) {
    return { name, remediation, status: 'fail', detail: 'Origin is absent or does not resolve to GitHub HTTPS.' }
  }
  if (configured !== effective) {
    return {
      name,
      remediation,
      status: 'warn',
      detail: 'Origin depends on a URL rewrite; store the HTTPS URL directly.',
    }
  }
  if (!helpers?.split('\n').some(helper => helper.includes('auth git-credential'))) {
    return { name, remediation, status: 'warn', detail: 'The GitHub CLI HTTPS credential helper is missing.' }
  }
  return { name, status: 'pass', detail: 'Origin uses GitHub HTTPS and the GitHub CLI credential helper.' }
}

async function gitHookChecks(): Promise<Check[]> {
  const directory = await probe('git rev-parse --path-format=absolute --git-path hooks')
  const checks: Check[] = []
  for (const event of ['commit-msg', 'pre-commit']) {
    const path = directory ? Path.join(directory, event) : undefined
    const contents = await Try(async () => path ? await FileSystem.file(path).text() : undefined, {
      catch: () => undefined,
    })
    if (contents === undefined) {
      checks.push({ name: 'git hooks', status: 'warn', detail: event + ' is not installed; Git guards do not run.' })
      continue
    }
    if (!contents.includes('# tao-warn-only-git-hook')) {
      checks.push({ name: 'git hooks', status: 'pass', detail: event + ' is managed outside this repository.' })
      continue
    }
    const paths = [...contents.matchAll(/\$worktree\/([^"]+)"/g)].map(match => Path.resolve(repositoryRoot, match[1]))
    const executable = await Promise.all(paths.map(path =>
      Try(async () => {
        await FileSystem.access(path, FileSystem.constants.X_OK)
        return FileSystem.statSync(path).isFile()
      }, { catch: () => false })
    ))
    checks.push({
      name: 'git hooks',
      status: executable.some(Boolean) ? 'pass' : 'warn',
      detail: executable.some(Boolean)
        ? event + ' resolves its guard script.'
        : event + ' cannot resolve an executable guard script in this worktree.',
    })
  }
  // New setup does not install Git guards yet; inspect existing hooks without borrowing the old installer.
  return checks
}

async function probe(command: string, variadicArgs: readonly string[] = []): Promise<string | undefined> {
  return Try(() => Platform.capture(command, variadicArgs, repositoryRoot), { catch: () => undefined })
}

/** safeToken admits only plain version and identifier tokens into the pasteable fingerprint. */
export function safeToken(value: string | undefined): string | undefined {
  const token = value?.trim()
  return token && /^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(token) ? token : undefined
}

function gitHash(value: string | undefined): string | undefined {
  return value && /^[0-9a-f]{40}$/.test(value) ? value : undefined
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

/** assertDoctorReady raises the diagnosis after its report has been printed. */
export function assertDoctorReady(status: Check['status']): void {
  if (status === 'fail') {
    Errors.ThrowUserInput('Doctor found required setup failures; resolve the FAIL entries above.')
  }
}
