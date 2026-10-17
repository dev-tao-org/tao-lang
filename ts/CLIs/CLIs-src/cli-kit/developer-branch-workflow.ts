import { Errors, Try } from '@shared'
import { Env, Platform, Repo } from '@shared/os'
import { IO } from './cli-kit'

const mainBranch = 'main'
const remote = 'origin'
const developerPrefix = 'dev/'

type GitOptions = { variadicArgs?: readonly string[]; cwd: string }
type GitResult = {
  command: string
  cwd: string
  variadicArgs: readonly string[]
  status: number
  signal: string | null
  stdout: string
  stderr: string
}
type DetachedWorktree = { head: string; path: string }

/** selectDeveloperBranch switches this checkout to the developer's personal branch. */
export async function selectDeveloperBranch(name = ''): Promise<void> {
  const cwd = Repo.getWorkspaceRoot()
  const branch = await resolveDeveloperBranch(name, cwd)
  const current = await currentBranch(cwd)
  if (current === branch) {
    IO.info(`PASS  Already on '${branch}'.`)
    return
  }
  const elsewhere = (await worktreesOn(branch, cwd)).filter(path => path !== cwd)
  if (elsewhere.length > 0) {
    Errors.ThrowUserInput(
      `'${branch}' is checked out in ${elsewhere.join(', ')}; a branch lives in one worktree at a time.`,
    )
  }
  const exists = (await readRef(`refs/heads/${branch}`, cwd)) !== ''
  await checkedGit(exists ? 'git switch' : 'git switch --create', {
    variadicArgs: exists ? [branch] : [branch, mainBranch],
    cwd,
  })
  IO.info(
    exists ? `PASS  Switched to '${branch}'.` : `PASS  Created '${branch}' from ${mainBranch} and switched to it.`,
  )
  if (await checkoutStatus(cwd) !== '') {
    IO.info(`NOTE  Uncommitted changes came with you onto '${branch}'.`)
  }
}

/** syncMainIntoCurrentBranch fast-forwards main, refreshes mirrors, and merges main here. */
export async function syncMainIntoCurrentBranch(): Promise<void> {
  const cwd = Repo.getWorkspaceRoot()
  const branch = await currentBranch(cwd)
  requireDeveloperBranch(branch)
  requireCleanCheckout(await checkoutStatus(cwd))
  await checkedGit('git fetch --prune origin', { cwd })
  const lines = await fastForwardMain(cwd)
  lines.push(...await refreshMirrors(cwd))
  const mainHead = await readRef(`refs/heads/${mainBranch}`, cwd)
  if (await isAncestor(mainHead, 'HEAD', cwd)) {
    lines.push(`PASS  '${branch}' already contains ${mainBranch}.`)
    printLines(lines)
    return
  }
  const merged = await runGit('git merge --no-edit', { variadicArgs: [mainBranch], cwd }, true)
  if (merged.status === 0) {
    lines.push(`PASS  Merged ${mainBranch} into '${branch}'.`)
    printLines(lines)
    return
  }
  const conflicts = await conflictedPaths(cwd)
  if (conflicts.length === 0) {
    throwCommandFailure(merged)
  }
  lines.push(
    `FAIL  ${mainBranch} conflicts with '${branch}' in ${conflicts.length} file(s):`,
    ...conflicts.map(path => `      ${path}`),
    'NEXT  Resolve them yourself and `git commit`, or run `just my-resolve` to hand the merge to an agent.',
  )
  printLines(lines)
  throwCommandFailure(merged)
}

/** normalizeDeveloperBranch adds the personal prefix and slugifies a supplied name. */
export function normalizeDeveloperBranch(name: string): string {
  return developerBranch(name)
}

/** parseDetachedWorktrees keeps detached worktrees that Git has not marked prunable. */
export function parseDetachedWorktrees(source: string): DetachedWorktree[] {
  return source.trim().split(/\n\n+/u).filter(Boolean).flatMap(block => {
    const fields = new Map(
      block.split('\n').map(line => {
        const separator = line.indexOf(' ')
        return separator < 0 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)]
      }),
    )
    const path = fields.get('worktree')
    const head = fields.get('HEAD')
    return path === undefined || head === undefined || fields.has('branch') || fields.has('prunable')
      ? []
      : [{ head, path }]
  })
}

async function resolveDeveloperBranch(name: string, cwd: string): Promise<string> {
  const asked = name.trim()
  if (asked !== '') {
    return developerBranch(asked)
  }
  const fromEnvironment = (Env.get('TAO_DEV_BRANCH') ?? '').trim()
  if (fromEnvironment !== '') {
    return developerBranch(fromEnvironment)
  }
  const configured = await optionalGitValue('git config --get', { variadicArgs: ['tao.devBranch'], cwd })
  if (configured !== '') {
    return developerBranch(configured)
  }
  const identity = await optionalGitValue('git config --get', { variadicArgs: ['user.name'], cwd })
  const firstName = slug(identity.split(/\s+/u)[0] ?? '')
  return `${developerPrefix}${firstName || 'local'}`
}

function developerBranch(name: string): string {
  return name.startsWith(developerPrefix) ? name : `${developerPrefix}${slug(name)}`
}

function slug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '')
}

async function optionalGitValue(command: string, options: GitOptions): Promise<string> {
  return Try(() => Platform.capture(command, options), {
    catch(error) {
      if (isMissingValue(error)) {
        return ''
      }
      Errors.Throw(error)
    },
  })
}

function isMissingValue(error: unknown): boolean {
  return Errors.isTaoError(error) && error.name === 'CommandExecutionError' && error.result.status === 1
}

async function currentBranch(cwd: string): Promise<string> {
  const result = await runGit('git symbolic-ref --quiet --short HEAD', { cwd })
  return result.status === 0 ? result.stdout.trim() : ''
}

async function worktreesOn(branch: string, cwd: string): Promise<string[]> {
  const listing = (await runGit('git worktree list --porcelain', { cwd })).stdout
  return listing.trim().split(/\n\n+/u).flatMap(block => {
    const lines = block.split('\n').map(line => line.trim())
    const path = lines[0]?.startsWith('worktree ') ? lines[0].slice('worktree '.length) : undefined
    return path !== undefined && lines.includes(`branch refs/heads/${branch}`) ? [path] : []
  })
}

async function readRef(ref: string, cwd: string): Promise<string> {
  const result = await runGit('git rev-parse --verify --quiet', { variadicArgs: [ref], cwd })
  return result.status === 0 ? result.stdout.trim() : ''
}

async function checkoutStatus(cwd: string): Promise<string> {
  return (await runGit('git status --porcelain=v1 --untracked-files=all', { cwd })).stdout.trimEnd()
}

function requireDeveloperBranch(branch: string): void {
  if (branch === mainBranch) {
    Errors.ThrowUserInput(
      `This checkout is on '${mainBranch}', which nothing may hold: switch to your own branch first with `
        + '`./dev my-branch`.',
    )
  }
  if (branch === '') {
    Errors.ThrowUserInput(
      'This checkout is on a detached HEAD; switch to your own branch first with `./dev my-branch`.',
    )
  }
}

function requireCleanCheckout(pending: string): void {
  if (pending === '') {
    return
  }
  const changes = pending.split('\n')
  const shown = changes.slice(0, 10).map(line => `  ${line}`).join('\n')
  const more = changes.length > 10 ? `\n  ... and ${changes.length - 10} more` : ''
  Errors.ThrowUserInput(
    `This checkout has uncommitted changes; my-sync has not fetched or moved refs:\n${shown}${more}\n`
      + 'Commit your work and coordinate with others editing this checkout, then run `./dev my-sync` again.',
  )
}

async function fastForwardMain(cwd: string): Promise<string[]> {
  const lines: string[] = []
  const mainBefore = await readRef(`refs/heads/${mainBranch}`, cwd)
  const remoteMain = await readRef(`refs/remotes/${remote}/${mainBranch}`, cwd)
  if (mainBefore === '') {
    Errors.ThrowUserInput(`This checkout has no local '${mainBranch}' to sync.`)
  }
  if (remoteMain === '' || remoteMain === mainBefore) {
    lines.push(`PASS  ${mainBranch} is current at ${short(mainBefore)}.`)
    return lines
  }
  if (!await isAncestor(mainBefore, remoteMain, cwd)) {
    Errors.ThrowUserInput(
      `Local ${mainBranch} (${short(mainBefore)}) holds commits ${remote}/${mainBranch} `
        + `(${short(remoteMain)}) does not. Reconcile them deliberately; this command only fast-forwards.`,
    )
  }
  await requireMainIsNotCheckedOut(cwd)
  await checkedGit('git update-ref -m', {
    variadicArgs: ['sync-main: fast-forward to origin', `refs/heads/${mainBranch}`, remoteMain, mainBefore],
    cwd,
  })
  lines.push(`PASS  Moved ${mainBranch} to ${short(remoteMain)}.`)
  return lines
}

async function requireMainIsNotCheckedOut(cwd: string): Promise<void> {
  const paths = await worktreesOn(mainBranch, cwd)
  if (paths.length > 0) {
    Errors.ThrowUserInput(
      `Cannot fast-forward local '${mainBranch}' while it is checked out in ${paths.join(', ')}. `
        + 'Switch those worktrees to another branch first.',
    )
  }
}

async function refreshMirrors(cwd: string): Promise<string[]> {
  const mainHead = await readRef(`refs/heads/${mainBranch}`, cwd)
  const listing = (await runGit('git worktree list --porcelain', { cwd })).stdout
  const lines: string[] = []
  for (const worktree of parseDetachedWorktrees(listing)) {
    if (worktree.head === mainHead || !await isAncestor(worktree.head, mainHead, cwd)) {
      continue
    }
    if (await checkoutStatus(worktree.path) !== '') {
      continue
    }
    const moved = await runGit('git checkout --detach', { variadicArgs: [mainHead], cwd: worktree.path })
    lines.push(
      moved.status === 0
        ? `PASS  Moved the ${mainBranch} mirror at ${worktree.path} to ${short(mainHead)}.`
        : `WARN  Could not move the ${mainBranch} mirror at ${worktree.path}.`,
    )
  }
  return lines
}

async function isAncestor(ancestor: string, descendant: string, cwd: string): Promise<boolean> {
  return (await runGit('git merge-base --is-ancestor', { variadicArgs: [ancestor, descendant], cwd })).status === 0
}

async function conflictedPaths(cwd: string): Promise<string[]> {
  const result = await runGit('git diff --name-only --diff-filter=U', { cwd })
  return result.stdout.split('\n').map(line => line.trim()).filter(Boolean)
}

async function checkedGit(command: string, options: GitOptions): Promise<GitResult> {
  const result = await runGit(command, options)
  if (result.status !== 0 || result.signal !== null) {
    throwCommandFailure(result)
  }
  return result
}

async function runGit(command: string, options: GitOptions, inheritOutput = false): Promise<GitResult> {
  if (inheritOutput) {
    const child = Platform.spawn(command, {
      variadicArgs: options.variadicArgs,
      cwd: options.cwd,
      stdout: 'inherit',
      stderr: 'inherit',
    })
    return {
      command,
      cwd: options.cwd,
      variadicArgs: options.variadicArgs ?? [],
      status: await child.exited,
      signal: child.signalCode,
      stdout: '',
      stderr: '',
    }
  }
  const child = Platform.spawn(command, {
    variadicArgs: options.variadicArgs,
    cwd: options.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  return {
    command,
    cwd: options.cwd,
    variadicArgs: options.variadicArgs ?? [],
    status,
    signal: child.signalCode,
    stdout,
    stderr,
  }
}

function throwCommandFailure(result: GitResult): never {
  const args = [...result.command.trim().split(/ +/u), ...result.variadicArgs]
  Errors.ThrowCommandExecution({
    command: args[0]!,
    args: args.slice(1),
    cwd: result.cwd,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  })
}

function printLines(lines: readonly string[]): void {
  for (const line of lines) {
    IO.info(line)
  }
}

function short(sha: string): string {
  return sha.slice(0, 12)
}
