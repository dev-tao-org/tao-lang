import { Errors, Try } from '@shared'
import { Env, FileSystem, Path, Platform, Repo } from '@shared/os'
import { parse } from 'smol-toml'

type Table = Record<string, unknown>
const filesystemHeader = '[permissions.tao-workspace.filesystem]'

/** installGitPermissions adds exact Git metadata grants to the machine-local Codex configuration. */
export async function installGitPermissions(): Promise<void> {
  const home = Path.homeDirectory()
  const codexHome = Env.get('CODEX_HOME') ?? Path.join(home, '.codex')
  if (!Path.isAbsolute(codexHome)) {
    Errors.ThrowUserInput('CODEX_HOME must be an absolute directory: ' + codexHome)
  }
  const paths = await Promise.all([
    gitDirectory('git rev-parse --path-format=absolute --git-common-dir'),
    gitDirectory('git rev-parse --absolute-git-dir'),
  ])
  await FileSystem.updateLockedFile(
    Path.join(codexHome, 'config.toml'),
    source => withGitPermissions(source, [...new Set(paths)], home),
  )
}

async function gitDirectory(command: string): Promise<string> {
  const path = await Platform.capture(command, { cwd: Repo.getWorkspaceRoot() })
  if (!Path.isAbsolute(path) || path.includes('\n')) {
    Errors.ThrowHostEnvironment('Git did not report an absolute metadata directory.')
  }
  return FileSystem.realpathSync(path)
}

/** withGitPermissions adds missing grants without changing unrelated TOML values or restrictive rules. */
export function withGitPermissions(source: string, paths: readonly string[], home: string): string {
  const original = parseConfig(source)
  const permissions = asTable(original.permissions)
  const current = asTable(asTable(permissions?.['tao-workspace'])?.filesystem)
  assertCompatibleGrants(current, paths, home)
  const missing = paths.filter(path => current?.[path] !== 'write')
  if (missing.length === 0) {
    return source
  }
  const next = appendGrants(source, missing, current !== undefined)
  const expected = structuredClone(original)
  const filesystem = ensureTable(ensureTable(ensureTable(expected, 'permissions'), 'tao-workspace'), 'filesystem')
  for (const path of missing) {
    filesystem[path] = 'write'
  }
  if (!equalToml(parseConfig(next), expected)) {
    Errors.ThrowUserInput('Cannot safely update Codex Git grants; use a separate ' + filesystemHeader + ' table.')
  }
  return next
}

function parseConfig(source: string): Table {
  return Try(() => parse(source) as Table, {
    catch() {
      Errors.ThrowUserInput('Cannot install Git permissions: Codex config is not valid TOML.')
    },
  })
}

function asTable(value: unknown): Table | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Table : undefined
}

function ensureTable(parent: Table, key: string): Table {
  const table = asTable(parent[key]) ?? {}
  parent[key] = table
  return table
}

function assertCompatibleGrants(current: Table | undefined, paths: readonly string[], home: string): void {
  const workspace = asTable(current?.[':workspace_roots'])
  if (Object.values(workspace ?? {}).some(isRestricted)) {
    Errors.ThrowUserInput('Resolve restrictive :workspace_roots rules before installing Codex Git grants.')
  }
  for (const path of paths) {
    if (current?.[path] !== undefined && current[path] !== 'write') {
      Errors.ThrowUserInput('Resolve the existing Codex filesystem rule for ' + path + ' before installing Git grants.')
    }
    for (const [rule, action] of Object.entries(current ?? {})) {
      if (conflictsWithGrant(rule, action, path, home)) {
        Errors.ThrowUserInput('Resolve the conflicting Codex filesystem rule ' + rule + ' before granting ' + path)
      }
    }
  }
}

function conflictsWithGrant(rule: string, action: unknown, path: string, home: string): boolean {
  if (!isRestricted(action)) {
    return false
  }
  const base = rule.endsWith('/**') ? rule.slice(0, -3) : rule
  const expanded = base === '~' ? home : base.startsWith('~/') ? Path.resolve(home, base.slice(2)) : base
  if (!Path.isAbsolute(expanded)) {
    return false
  }
  const resolved = FileSystem.existsSync(expanded) ? FileSystem.realpathSync(expanded) : Path.resolve(expanded)
  return isWithin(resolved, path) || (action === 'deny' && isWithin(path, resolved))
}

function isRestricted(action: unknown): boolean {
  return action === 'read' || action === 'deny'
}

function isWithin(path: string, directory: string): boolean {
  const relative = Path.relative(directory, path)
  return relative === '' || (relative !== '..' && !relative.startsWith('../') && !Path.isAbsolute(relative))
}

function appendGrants(source: string, missing: readonly string[], hasTable: boolean): string {
  const lines = source.split(/(?<=\n)/)
  const headers = lines.flatMap((line, index) => line.trim() === filesystemHeader ? [index] : [])
  if (headers.length > 1 || (hasTable && headers.length === 0)) {
    Errors.ThrowUserInput('Use a separate ' + filesystemHeader + ' table before installing Codex Git grants.')
  }
  const additions = missing.map(path => JSON.stringify(path) + ' = "write"\n').join('')
  if (headers.length === 0) {
    return source + (source && !source.endsWith('\n') ? '\n' : '') + filesystemHeader + '\n' + additions
  }
  let end = headers[0] + 1
  while (end < lines.length && !/^\s*\[/.test(lines[end])) {
    end++
  }
  const offset = lines.slice(0, end).join('').length
  const newline = offset > 0 && source[offset - 1] !== '\n' ? '\n' : ''
  return source.slice(0, offset) + newline + additions + source.slice(offset)
}

function equalToml(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime()
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => equalToml(value, right[index]))
  }
  const leftTable = asTable(left)
  const rightTable = asTable(right)
  if (!leftTable || !rightTable) {
    return false
  }
  const keys = Object.keys(leftTable)
  return keys.length === Object.keys(rightTable).length
    && keys.every(key => Object.hasOwn(rightTable, key) && equalToml(leftTable[key], rightTable[key]))
}
