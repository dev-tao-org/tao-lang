import { Json } from '@shared'
import { Errors, NewlineCharacter, S, TabCharacter } from '@shared'
import * as Shared from '@shared'
import { Platform } from '@shared/os'
import Exec from '@shared/os/exec'
import { type LandingIO } from '../../CLIs-src/dev-cli/landing/LandingIO'

/** recordingLanding records external effects and resolves Git/GitHub responses without subprocesses. */
export function recordingLanding() {
  const state = initialState()
  const calls: string[] = []
  const files = initialFiles()
  const io: LandingIO = {
    root: '/recording',
    command: (command, args = [], { cwd = '/recording' } = {}) =>
      Promise.resolve(commandReply(command, Exec.resolveCommandArgs(args), cwd, state, calls)),
    async verifyHostedIos(branch, head) {
      calls.push(`hosted iOS ${branch} ${head}`)
      if (state.fail === 'hosted iOS') {
        Errors.ThrowHostEnvironment('Hosted iOS failed.')
      }
    },
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
const fixture = 'App Hello' + NewlineCharacter

type RecordingLandingState = {
  dirty: string
  storageDirty: string
  integrated: boolean
  implementation: boolean
  prOpen: boolean
  merged: boolean
  fail: string
  remoteHead: string
  localArchivePaths: string
  archiveBase: string
  localHead: string
  advanceHeadOn: string
  localArchiveHead: string
  advanceArchiveOn: string
  pinnedArchive: string
  userStagedPaths: string
  committedUserPaths: string
  pointerPending: boolean
  pointerParents: string
  pointerPaths: string
  crossRepository: boolean
  integrationChanges: boolean
}

function initialState(): RecordingLandingState {
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
  const report = Json.Print({ version: 1, commit: source, samples: [1] }) + NewlineCharacter
  return new Map([
    [
      `.artifacts/merge/${branch}.msg`,
      Shared.joinTextLines(
        S`
          Land tooling

          - Archive ${archive} source ${source}
        `,
        '',
      ),
    ],
    [`${pending}/report.json`, report],
    [
      `${pending}/record.json`,
      Json.Print({
        version: 1,
        status: 'passed',
        sourceCommit: source,
        sourceTree: tree,
        fixture: {
          path: 'ts/repo-analysis/performance-fixtures/Performance/Performance.tao',
          sha256: Platform.hashText(fixture),
        },
        reportSha256: Platform.hashText(report),
      }),
    ],
  ])
}

function commandReply(
  command: string,
  args: readonly string[],
  directory: string,
  state: RecordingLandingState,
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
  if (command === 'gh') {
    return githubReply(args, state)
  }
  if (command === './agent' && args[0] === 'verify') {
    return ''
  }
  return gitReply(args, state, storage)
}

function gitReply(args: readonly string[], state: RecordingLandingState, storage: boolean): string {
  applyGitChanges(args, state, storage)
  const exact: Record<string, string> = {
    'branch --show-current': branch,
    'submodule status -- .storage': ` ${archive} .storage${NewlineCharacter}`,
    'rev-parse HEAD': storage ? state.localArchiveHead : state.localHead,
    [`rev-parse ${source}^{tree}`]: tree,
    'rev-parse FETCH_HEAD': archive,
    'ls-remote --symref origin HEAD': 'ref: refs/heads/main' + TabCharacter + 'HEAD' + NewlineCharacter,
  }
  const prefixes: Record<string, string> = {
    'status': storage ? state.storageDirty : state.dirty || state.userStagedPaths,
    'merge-base': state.archiveBase,
    'log': storage ? state.localArchivePaths : 'd'.repeat(40),
    'rev-list': source,
    'diff-tree': state.implementation ? 'ts/source.ts' : 'AGENTS.md',
    'show': args.includes('--format=%P') ? state.pointerParents : fixture,
    'ls-remote': `${archive}${TabCharacter}refs/heads/main${NewlineCharacter}`,
    'ls-files': `160000 ${state.pinnedArchive} 0${TabCharacter}.storage`,
    'ls-tree': `160000 commit ${state.pinnedArchive}${TabCharacter}.storage`,
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

function applyGitChanges(args: readonly string[], state: RecordingLandingState, storage: boolean): void {
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

function githubReply(args: readonly string[], state: RecordingLandingState): string {
  if (args[0] === 'api') {
    return '{"status":"ahead"}'
  }
  if (args[1] === 'create') {
    state.prOpen = true
  }
  if (args[1] === 'merge') {
    state.merged = true
  }
  if (args[1] !== 'list') {
    return ''
  }
  const merged = args.includes('merged')
  if (merged ? !state.merged : !state.prOpen || state.merged) {
    return '[]'
  }
  return Json.Print([{
    url: 'https://github.com/example/tao/pull/1',
    headRefName: branch,
    headRefOid: state.remoteHead,
    baseRefName: 'main',
    isCrossRepository: state.crossRepository,
    mergedAt: merged ? '2026-10-18T00:00:00Z' : null,
    mergeCommit: merged ? { oid: source } : null,
  }])
}
