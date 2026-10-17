import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { Errors, Time, Try } from '../universal/universal'
import * as FileSystem from './FileSystem'
import * as Path from './Path'
import * as Repo from './Repo'

export { appendFileSync, mkdirSync } from 'node:fs'
export { rename as move } from 'node:fs/promises'
export { file, mkdir, mkdtemp, realpathSync, rm, write } from './FileSystem'

/** writePrivate creates a new owner-only artifact without a window of public readability. */
export function writePrivate(path: string, data: string): Promise<void> {
  return writeFile(path, data, { mode: 0o600, flag: 'wx' })
}

/** resolvePath resolves artifact paths beneath this checkout's shared artifact directory. */
export function resolvePath(...segments: string[]): string {
  return Path.resolve(Repo.resolvePath('.artifacts'), ...segments)
}

/** isWritable checks an artifact location or its nearest existing parent without creating files. */
export async function isWritable(...segments: string[]): Promise<boolean> {
  let existing = resolvePath(...segments)
  while (!FileSystem.existsSync(existing)) {
    existing = Path.dirname(existing)
  }
  return Try(async () => {
    await FileSystem.access(existing, FileSystem.constants.W_OK)
    return true
  }, {
    catch() {
      return false
    },
  })
}

/** trackTemporary records an exclusively owned log or scratch path for cleanup after successful process completion. */
export function trackTemporary(path: string): void {
  const absolute = Path.resolve(path)
  if (!isDisposablePath(absolute)) {
    return
  }
  if (!activeRun) {
    const directory = resolvePath('cleanup')
    if (!hasSafeParents(Path.join(directory, 'record.json'))) {
      Errors.ThrowHostEnvironment('Artifact cleanup records must remain inside the checkout artifact directory.')
    }
    mkdirSync(directory, { recursive: true })
    activeRun = {
      path: Path.join(directory, `${Time.now()}-${process.pid}-${crypto.randomUUID()}.json`),
      record: { status: 'running', artifacts: [] },
    }
    process.once('exit', completeTemporaryRun)
  }
  if (!activeRun.record.artifacts.includes(absolute)) {
    activeRun.record.artifacts.push(absolute)
    writeTemporaryRun()
  }
}

/** cleanPartial removes tracked successful output older than 24 hours, retaining failures and active runs. */
export async function cleanPartial(): Promise<number> {
  const directory = resolvePath('cleanup')
  if (!FileSystem.existsSync(directory)) {
    return 0
  }
  if (!hasSafeParents(Path.join(directory, 'record.json'))) {
    Errors.ThrowHostEnvironment('Artifact cleanup records must remain inside the checkout artifact directory.')
  }
  const receipts = await readTemporaryRuns(directory)
  const paths = expiredTemporaryArtifacts(receipts.map(receipt => receipt.record), Time.now())
  let removed = 0
  for (const path of paths) {
    if (isDisposablePath(path) && hasSafeParents(path)) {
      await FileSystem.rm(path, { recursive: true, force: true })
      removed++
    }
  }
  for (const receipt of receipts) {
    if (isExpiredRun(receipt.record, Time.now())) {
      await FileSystem.rm(receipt.path, { force: true })
    }
  }
  return removed
}

/** expiredTemporaryArtifacts selects expired successful artifacts while protecting every retained run's paths. */
export function expiredTemporaryArtifacts(runs: readonly TemporaryRun[], now: number): string[] {
  const retained = runs.filter(run => !isExpiredRun(run, now)).flatMap(run => run.artifacts)
  const expired = runs.filter(run => isExpiredRun(run, now)).flatMap(run => run.artifacts)
  return [...new Set(expired)].filter(path => !retained.includes(path))
}

type TemporaryRun = { status: 'running' | 'succeeded' | 'failed'; completedAt?: number; artifacts: string[] }
let activeRun: { path: string; record: TemporaryRun } | undefined
const retentionMs = 24 * 60 * 60 * 1000

function isExpiredRun(run: TemporaryRun, now: number): boolean {
  return run.status === 'succeeded' && run.completedAt !== undefined && run.completedAt <= now - retentionMs
}

function completeTemporaryRun(status: number): void {
  if (!activeRun || !FileSystem.existsSync(Path.dirname(activeRun.path))) {
    return
  }
  activeRun.record.status = status === 0 ? 'succeeded' : 'failed'
  activeRun.record.completedAt = Time.now()
  writeTemporaryRun()
}

function writeTemporaryRun(): void {
  if (!activeRun) {
    return
  }
  const temporary = activeRun.path + '.tmp'
  writeFileSync(temporary, JSON.stringify(activeRun.record))
  renameSync(temporary, activeRun.path)
}

async function readTemporaryRuns(directory: string): Promise<{ path: string; record: TemporaryRun }[]> {
  const receipts: { path: string; record: TemporaryRun }[] = []
  for (const entry of await FileSystem.readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue
    }
    const path = Path.join(directory, entry.name)
    const record: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isTemporaryRun(record)) {
      Errors.ThrowHostEnvironment(`Invalid artifact cleanup record: ${path}`)
    }
    receipts.push({ path, record })
  }
  return receipts
}

function isTemporaryRun(value: unknown): value is TemporaryRun {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as TemporaryRun
  const validStatus = ['running', 'succeeded', 'failed'].includes(record.status)
  const validTime = record.completedAt === undefined || Number.isFinite(record.completedAt)
  const validPaths = Array.isArray(record.artifacts) && record.artifacts.every(path => typeof path === 'string')
  return validStatus && validTime && validPaths
}

function isDisposablePath(path: string): boolean {
  const relative = Path.relative(resolvePath(), path)
  return ['logs', 'scratch', 'tmp'].some(directory => relative.startsWith(directory + '/'))
}

function hasSafeParents(path: string): boolean {
  let parent = Path.dirname(path)
  const root = resolvePath()
  while (parent.startsWith(root)) {
    if (FileSystem.existsSync(parent) && lstatSync(parent).isSymbolicLink()) {
      return false
    }
    if (parent === root) {
      return true
    }
    parent = Path.dirname(parent)
  }
  return false
}
