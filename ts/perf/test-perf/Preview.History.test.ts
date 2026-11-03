import { Json } from '@shared'
import { Errors, NewlineCharacter, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { recordPreviewPerformance } from '../perf-src/Preview/PreviewHistory'

Tests.test('commit recording captures exact committed fixture once and retains raw evidence', async () => {
  await withFixture(async fixture => {
    const [first, second] = await Promise.all([fixture.record(), fixture.record()])
    const third = await fixture.record()
    Tests.expect(first.reused).toBe(false)
    Tests.expect([second.reused, third.reused]).toEqual([true, true])
    Tests.expect(fixture.sources).toEqual([source])
    Tests.expect(first.directory).toBe(Path.join(fixture.root, '.artifacts/notes/preview-history', commit))
    Tests.expect(await FS.readFile(Path.join(first.directory, 'report.json'), 'utf8')).toBe(report)
    const record = Json.Parse(
      await FS.readFile(Path.join(first.directory, 'record.json'), 'utf8'),
    ) as PreviewHistoryMetadataFixture
    Tests.expect(record).toMatchObject({
      sourceCommit: commit,
      sourceTree: tree,
      status: 'passed',
      fixture: { sha256: Platform.hashText(source) },
      reportSha256: Platform.hashText(report),
    })
    await FS.writeFile(Path.join(first.directory, 'report.json'), '{}')
    await Tests.expect(fixture.record()).rejects.toThrow('checksum differs')
    const wrongReport = Json.Print({ version: 1, commit: 'c'.repeat(40) })
    await FS.writeFile(Path.join(first.directory, 'report.json'), wrongReport)
    record.reportSha256 = Platform.hashText(wrongReport)
    await FS.writeFile(Path.join(first.directory, 'record.json'), Json.Print(record))
    await Tests.expect(fixture.record()).rejects.toThrow('does not identify the measured source commit')
    Tests.expect(fixture.sources).toHaveLength(1)
  })
})

Tests.test('initialized submodule receives commit records without publishing or staging', async () => {
  await withFixture(async fixture => {
    const storage = Path.join(fixture.root, '.storage')
    await FS.mkdir(storage)
    await FS.writeFile(Path.join(storage, '.git'), 'gitdir: fixture')
    const result = await fixture.record()
    Tests.expect(result.directory).toBe(Path.join(storage, 'performance/preview', commit))
    Tests.expect(fixture.gitCalls.every(args => !args.includes('push') && !args.includes('add'))).toBe(true)
  })
})

Tests.test('dirty implementation inputs prevent measurement and retain a failure record', async () => {
  await withFixture(async fixture => {
    fixture.dirty = true
    await Tests.expect(fixture.record()).rejects.toThrow('Commit benchmark implementation inputs')
    Tests.expect(fixture.sources).toEqual([])
    const path = Path.join(fixture.root, '.artifacts/notes/preview-history', commit, 'record.json')
    Tests.expect(Json.Parse(await FS.readFile(path, 'utf8')) as PreviewHistoryMetadataFixture).toMatchObject({
      status: 'failed',
    })
  })
})

Tests.test('a changed HEAD during capture cannot produce a successful record', async () => {
  await withFixture(async fixture => {
    await Tests.expect(fixture.record(async () => {
      fixture.head = 'c'.repeat(40)
      return { path: fixture.reportPath }
    })).rejects.toThrow('HEAD and inputs must stay unchanged')
    const path = Path.join(fixture.root, '.artifacts/notes/preview-history', commit, 'record.json')
    Tests.expect(Json.Parse(await FS.readFile(path, 'utf8')) as PreviewHistoryMetadataFixture).toMatchObject({
      status: 'failed',
    })
  })
})

const commit = 'a'.repeat(40)
const tree = 'b'.repeat(40)
const source = '  app Example { root RootView }' + NewlineCharacter
const report = Json.Print({ version: 1, commit, modified: true }) + NewlineCharacter

type PreviewHistoryFixture = {
  root: string
  reportPath: string
  sources: string[]
  gitCalls: (readonly string[])[]
  dirty: boolean
  head: string
  record(measure?: (input: string) => Promise<{ path: string }>): Promise<{ directory: string; reused: boolean }>
}

async function withFixture(run: (fixture: PreviewHistoryFixture) => Promise<void>): Promise<void> {
  const root = Artifacts.resolvePath('tmp', `preview-history-${Platform.randomUUID()}`)
  await FS.mkdir(root)
  const fixture = createFixture(root)
  await FS.writeFile(fixture.reportPath, report)
  await Try(() => run(fixture), {
    finally: () => FS.rm(root, { recursive: true, force: true }),
  })
}

function createFixture(root: string) {
  const state = {
    root,
    reportPath: Path.join(root, 'raw.json'),
    sources: [] as string[],
    gitCalls: [] as (readonly string[])[],
    dirty: false,
    head: commit,
    record: (measure = async (input: string) => {
      state.sources.push(input)
      return { path: state.reportPath }
    }) => recordPreviewPerformance(measure, { directory: root, git }),
  }
  return state

  async function git(args: readonly string[], exact?: boolean): Promise<string> {
    state.gitCalls.push(args)
    const operation = args.join(' ')
    if (operation === 'rev-parse HEAD') {
      return state.head
    }
    if (operation === `rev-parse ${commit}^{tree}`) {
      return tree
    }
    if (operation === `show ${commit}:ts/perf/perf-fixtures/Performance/Performance.tao`) {
      Tests.expect(exact).toBe(true)
      return source
    }
    if (args[0] === 'status') {
      return state.dirty ? ' M ts/compiler.ts' : ''
    }
    if (args.at(-1) === '--show-toplevel') {
      return Path.join(root, '.storage')
    }
    if (args.at(-1) === '--show-superproject-working-tree') {
      return root
    }
    return Errors.ThrowShouldNeverHappen('Unexpected Git operation: ' + operation)
  }
}

// Authored fixture output is inspected and deliberately damaged by these tests.
type PreviewHistoryMetadataFixture = Record<string, unknown>
