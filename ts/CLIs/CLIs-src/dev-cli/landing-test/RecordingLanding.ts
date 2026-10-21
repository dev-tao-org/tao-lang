import { Errors } from '@shared'
import { Platform } from '@shared/os'
import { type LandingIO } from '../landing/LandingIO'

/** recordingLanding records external effects and resolves Git/GitHub responses without subprocesses. */
export function recordingLanding() {
  const state = initialState()
  const calls: string[] = []
  const files = initialFiles()
  const io: LandingIO = {
    root: '/recording',
    command: (command, args = [], directory = '/recording') =>
      Promise.resolve(commandReply(command, args, directory, state, calls)),
    async read(path) {
      const content = files.get(path)
      if (content === undefined) {
        Errors.ThrowShouldNeverHappen(`Missing recording file: ${path}`)
      }
      return content
    },
    exists: path => Promise.resolve(files.has(path)),
    async write(path, text) {
      calls.push(`write ${path}`)
      files.set(path, text)
    },
  }
  return { io, state, calls, files, source, archive, tree, branch, pending }
}

const source = 'a'.repeat(40)
const archive = 'b'.repeat(40)
const tree = 'c'.repeat(40)
const branch = 'feat/landing'
const pending = `.artifacts/notes/preview-history/${source}`
const fixture = 'App Hello\n'

function initialState() {
  return {
    dirty: '',
    storageDirty: '',
    integrated: false,
    implementation: true,
    prOpen: false,
    merged: false,
    fail: '',
    remoteHead: source,
    localArchivePaths: '',
    archiveBase: archive,
    localHead: source,
    advanceHeadOn: '',
    localArchiveHead: archive,
    advanceArchiveOn: '',
    pinnedArchive: archive,
    userStagedPaths: '',
    committedUserPaths: '',
    pointerPending: false,
    pointerParents: source,
    pointerPaths: '.storage',
    crossRepository: false,
    integrationChanges: false,
  }
}

function initialFiles(): Map<string, string> {
  const report = JSON.stringify({ version: 1, commit: source, samples: [1] }) + '\n'
  return new Map([
    [`.artifacts/merge/${branch}.msg`, `Land tooling\n\n- Archive ${archive} source ${source}\n`],
    [`${pending}/report.json`, report],
    [
      `${pending}/record.json`,
      JSON.stringify({
        version: 1,
        status: 'passed',
        sourceCommit: source,
        sourceTree: tree,
        fixture: { path: 'Apps/Tests/Hello World.tao', sha256: Platform.hashText(fixture) },
        reportSha256: Platform.hashText(report),
      }),
    ],
  ])
}

function commandReply(
  command: string,
  args: readonly string[],
  directory: string,
  state: ReturnType<typeof initialState>,
  calls: string[],
): string {
  const storage = directory.endsWith('/.storage')
  const label = `${storage ? 'storage ' : ''}${command} ${args.join(' ')}`.trim()
  calls.push(label)
  if (state.advanceHeadOn && label.includes(state.advanceHeadOn)) {
    state.localHead = tree
  }
  if (state.advanceArchiveOn && label.includes(state.advanceArchiveOn)) {
    state.localArchiveHead = tree
  }
  if (state.fail && label.includes(state.fail)) {
    Errors.ThrowHostEnvironment(`Recording failure: ${label}`)
  }
  if (command.startsWith('gh ')) {
    return githubReply(command, args, state)
  }
  if (command === './agent verify') {
    return ''
  }
  return gitReply(args, state, storage)
}

function gitReply(args: readonly string[], state: ReturnType<typeof initialState>, storage: boolean): string {
  applyGitChanges(args, state, storage)
  const exact: Record<string, string> = {
    'branch --show-current': branch,
    'submodule status -- .storage': ` ${archive} .storage\n`,
    'rev-parse HEAD': storage ? state.localArchiveHead : state.localHead,
    [`rev-parse ${source}^{tree}`]: tree,
    'rev-parse FETCH_HEAD': archive,
    'ls-remote --symref origin HEAD': 'ref: refs/heads/main\tHEAD\n',
  }
  const prefixes: Record<string, string> = {
    status: storage ? state.storageDirty : state.dirty || state.userStagedPaths,
    'merge-base': state.archiveBase,
    log: storage ? state.localArchivePaths : 'd'.repeat(40),
    'rev-list': source,
    'diff-tree': state.implementation ? 'ts/source.ts' : 'AGENTS.md',
    show: args.includes('--format=%P') ? state.pointerParents : fixture,
    'ls-remote': `${archive}\trefs/heads/main\n`,
    'ls-files': `160000 ${state.pinnedArchive} 0\t.storage`,
    'ls-tree': `160000 commit ${state.pinnedArchive}\t.storage`,
  }
  const words = args.join(' ')
  if (!storage && args[0] === 'diff' && args.includes('--cached')) {
    return state.pointerPending && args.includes('--ignore-submodules=none') ? '.storage' : ''
  }
  if (args[0] === 'diff-tree' && args.includes('e'.repeat(40))) {
    return state.pointerPaths
  }
  const result = exact[words] ?? prefixes[args[0]]
  if (result !== undefined) {
    return result
  }
  if (['worktree', 'fetch', 'merge', 'push', 'add', 'commit', 'submodule', 'diff', 'update-index'].includes(args[0])) {
    return ''
  }
  Errors.ThrowShouldNeverHappen(`Unrecognized recording Git command: ${words}`)
}

function applyGitChanges(args: readonly string[], state: ReturnType<typeof initialState>, storage: boolean): void {
  if (args.join(' ') === 'merge --no-edit refs/remotes/origin/main') {
    state.integrated = state.integrationChanges
    if (state.integrated) {
      state.localHead = tree
    }
  }
  if (!storage && args[0] === 'commit') {
    if (!args.includes('--')) {
      state.committedUserPaths = state.userStagedPaths
      state.userStagedPaths = ''
    }
    state.localHead = 'e'.repeat(40)
    state.remoteHead = state.localHead
    state.pointerPending = false
  }
}

function githubReply(command: string, args: readonly string[], state: ReturnType<typeof initialState>): string {
  if (command === 'gh api') {
    return '{"status":"ahead"}'
  }
  if (command === 'gh pr create') {
    state.prOpen = true
  }
  if (command === 'gh pr merge') {
    state.merged = true
  }
  if (command !== 'gh pr list') {
    return ''
  }
  const merged = args.includes('merged')
  if (merged ? !state.merged : !state.prOpen || state.merged) {
    return '[]'
  }
  return JSON.stringify([{
    url: 'https://github.com/example/tao/pull/1',
    headRefName: branch,
    headRefOid: state.remoteHead,
    baseRefName: 'main',
    isCrossRepository: state.crossRepository,
    mergedAt: merged ? '2026-10-18T00:00:00Z' : null,
    mergeCommit: merged ? { oid: source } : null,
  }])
}
