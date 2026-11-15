import { Json } from '@shared'
import { Errors, NewlineCharacter, Range, S } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path, Platform, Repo } from '@shared/os'
import type * as LearningTypes from '../../CLIs-src/agent-skills/review-learning/LearningTypes'
import { runLearning } from '../../CLIs-src/agent-skills/review-learning/review-learning'

const { expect, test } = Tests

test('captures corrections and follows symbol aliases without matching unrelated calls', async () => {
  const root = await createFixture()
  await FS.writeFile(Path.join(root, 'source.ts'), 'export function target() { return 1 }' + NewlineCharacter)
  await FS.writeFile(
    Path.join(root, 'consumer.ts'),
    Shared.joinTextLines(
      S`
        import { target as alias } from './source'
        alias()
        const other = { target() {} }; other.target()
      `,
      '',
    ),
  )
  await capture(root, 'explicit')
  const scan = await scanLearning(root, 'example')
  expect(scan.findings).toHaveLength(1)
  expect((await readLearningStatus(root)).corrections).toHaveLength(1)
})

test('rejects authority values that only coerce to an allowed authority string', async () => {
  const root = await createFixture()
  for (const authority of [['explicit'], ['existing'], ['inferred']]) {
    await expect(capture(root, authority)).rejects.toThrow('authority must be')
  }
  expect((await readLearningStatus(root)).corrections).toHaveLength(0)
})

test('revalidates existing rule evidence before scanning and applying', async () => {
  const root = await createFixture()
  await FS.writeFile(Path.join(root, 'source.ts'), 'export function target() { return 1 }' + NewlineCharacter)
  const policy = Path.join(root, 'POLICY.md')
  const quote = 'Every target must return 2.'
  await FS.writeFile(policy, quote)
  await capture(root, 'existing', 'example', { file: 'POLICY.md', quote })
  await FS.writeFile(policy, 'Keep the existing return value.')
  await expect(runLearning(['scan', '--repo', root, '--rule', 'example'])).rejects.toThrow('authority quote')
  await FS.writeFile(policy, quote)
  const scan = await scanLearning(root, 'example')
  await propose(root, scan.id as string, 'existing-rule')
  await FS.writeFile(policy, 'Keep the existing return value.')
  await expect(runLearning(['apply', '--repo', root, '--proposal', 'existing-rule']))
    .rejects.toThrow('authority quote')
  expect(await FS.readFile(Path.join(root, 'source.ts'), 'utf8')).toContain('return 1')
  await FS.writeFile(policy, quote + (NewlineCharacter + 'Additional guidance.'))
  await expect(runLearning(['apply', '--repo', root, '--proposal', 'existing-rule'])).rejects.toThrow('stale')
  await FS.writeFile(policy, quote)
  await runLearning(['apply', '--repo', root, '--proposal', 'existing-rule'])
  expect(await FS.readFile(Path.join(root, 'source.ts'), 'utf8')).toContain('return 2')
})

test('preflights authority, protection, stale coverage and exact edits before applying', async () => {
  const root = await createFixture()
  await FS.writeFile(Path.join(root, 'source.ts'), 'export function target() { return 1 }' + NewlineCharacter)
  await capture(root, 'inferred')
  const scan = await scanLearning(root, 'example')
  await propose(root, scan.id as string, 'first')
  await expect(runLearning(['apply', '--repo', root, '--proposal', 'first'])).rejects.toThrow('inferred')
  await capture(root, 'explicit', 'authorized')
  const fresh = await scanLearning(root, 'authorized')
  await propose(root, fresh.id as string, 'second')
  await expect(runLearning(['apply', '--repo', root, '--proposal', 'second', '--protected-files', 'source.ts']))
    .rejects.toThrow('Protected')
  await FS.writeFile(Path.join(root, 'added.ts'), 'const added = 1' + NewlineCharacter)
  await expect(runLearning(['apply', '--repo', root, '--proposal', 'second'])).rejects.toThrow('stale')
  await FS.rm(Path.join(root, 'added.ts'))
  await runLearning(['apply', '--repo', root, '--proposal', 'second'])
  expect(await FS.readFile(Path.join(root, 'source.ts'), 'utf8')).toContain('return 2')
})

test('invalidates edits and config changes and rejects overlapping or escaping edits', async () => {
  const root = await createFixture()
  const original = 'export function target() { return 1 }' + NewlineCharacter
  await FS.writeFile(Path.join(root, 'source.ts'), original)
  await capture(root, 'explicit')
  const scan = await scanLearning(root, 'example')
  await propose(root, scan.id as string, 'change')
  await FS.writeFile(Path.join(root, 'source.ts'), original + ('// changed' + NewlineCharacter))
  await expect(runLearning(['apply', '--repo', root, '--proposal', 'change'])).rejects.toThrow('stale')
  await FS.writeFile(Path.join(root, 'source.ts'), original)
  await FS.writeFile(Path.join(root, 'tsconfig.json'), '{}' + NewlineCharacter)
  await expect(runLearning(['apply', '--repo', root, '--proposal', 'change'])).rejects.toThrow('stale')
  await FS.rm(Path.join(root, 'tsconfig.json'))
  const input = Path.join(root, 'proposal.json')
  const proposal = Json.Parse(await FS.readFile(input, 'utf8')) as LearningFixtureRecord
  proposal.id = 'overlap'
  proposal.edits.push(proposal.edits[0])
  await FS.writeFile(input, Json.Print(proposal))
  await expect(runLearning(['propose', '--repo', root, '--input', input])).rejects.toThrow('Overlapping')
  proposal.edits = [{ ...proposal.edits[0], file: '../outside.ts' }]
  await FS.writeFile(input, Json.Print(proposal))
  await expect(runLearning(['propose', '--repo', root, '--input', input])).rejects.toThrow('Unsafe')
  await FS.symlink(Path.join(root, 'source.ts'), Path.join(root, 'linked.ts'))
  proposal.edits[0].file = 'linked.ts'
  await FS.writeFile(input, Json.Print(proposal))
  await expect(runLearning(['propose', '--repo', root, '--input', input])).rejects.toThrow('Symbolic')
})

test('protects checkpointed review groups and marks accepted paths pending without altering accepted content', async () => {
  const root = await createFixture()
  await FS.writeFile(Path.join(root, 'source.ts'), 'export function target() { return 1 }' + NewlineCharacter)
  await capture(root, 'explicit')
  const scan = await scanLearning(root, 'example')
  await propose(root, scan.id as string, 'change')
  await runLearning(['checkpoint', '--repo', root, '--group', 'current', '--protected-files', 'source.ts'])
  await expect(runLearning(['apply', '--repo', root, '--proposal', 'change'])).rejects.toThrow('Protected')
  await runLearning(['checkpoint', '--repo', root, '--group', 'next', '--protected-files'])
  const directory = Path.join(root, '.artifacts/notes/incremental-review/active')
  await FS.mkdir(directory)
  const accepted = { 'source.ts': 'accepted-tree-entry' }
  await FS.writeFile(
    Path.join(directory, 'session.json'),
    Json.Print({
      version: 1,
      id: 'fixture',
      root,
      directory,
      accepted,
      recheck: [],
      notes: [],
      reviewedBranch: 'approved',
    }),
  )
  await FS.mkdir(Path.join(root, '.git/refs/heads'))
  await FS.writeFile(Path.join(root, '.git/index'), 'user staging')
  await FS.writeFile(Path.join(root, '.git/refs/heads/approved'), 'accepted commit')
  await runLearning(['apply', '--repo', root, '--proposal', 'change'])
  const session = Json.Parse(await FS.readFile(Path.join(directory, 'session.json'), 'utf8')) as LearningFixtureRecord
  expect(session.accepted).toEqual(accepted)
  expect(session.recheck).toEqual(['source.ts'])
  expect(await FS.readFile(Path.join(root, '.git/index'), 'utf8')).toBe('user staging')
  expect(await FS.readFile(Path.join(root, '.git/refs/heads/approved'), 'utf8')).toBe('accepted commit')
})

test('recovers interrupted multi-file output and refuses foreign edits without rolling anything back', async () => {
  const root = await createFixture()
  await FS.writeFile(Path.join(root, 'source.ts'), 'export function target() { return 1 }' + NewlineCharacter)
  await FS.writeFile(Path.join(root, 'second.ts'), 'const second = 1' + NewlineCharacter)
  await capture(root, 'explicit')
  const scan = await scanLearning(root, 'example')
  const input = Path.join(root, 'proposal.json')
  const edits = []
  for (const file of ['source.ts', 'second.ts']) {
    const text = await FS.readFile(Path.join(root, file), 'utf8')
    const start = text.indexOf('1')
    edits.push({ file, range: Range(start, start + 1), expected: '1', replacement: '2' })
  }
  await FS.writeFile(
    input,
    Json.Print({ id: 'batch', scan: scan.id, analysis: 'Both equivalent cases checked.', edits }),
  )
  await runLearning(['propose', '--repo', root, '--input', input])
  const statePath = Path.join(root, '.artifacts/notes/review-learning/state.json')
  const state = Json.Parse(await FS.readFile(statePath, 'utf8')) as LearningTypes.LearningState
  const proposal = state.proposals[0]!
  proposal.state = 'applying'
  proposal.outputs = {}
  for (const edit of edits) {
    const before = await FS.readFile(Path.join(root, edit.file), 'utf8')
    proposal.outputs[edit.file] = { before, after: before.replace('1', '2'), done: edit.file === 'source.ts' }
  }
  await FS.writeFile(statePath, Json.Print(state))
  await FS.writeFile(Path.join(root, 'source.ts'), proposal.outputs['source.ts']!.after)
  await FS.writeFile(Path.join(root, 'second.ts'), '// user changed this' + NewlineCharacter)
  await expect(runLearning(['recover', '--repo', root, '--proposal', 'batch'])).rejects.toThrow('stale')
  expect(await FS.readFile(Path.join(root, 'second.ts'), 'utf8')).toBe('// user changed this\n')
  expect(await FS.readFile(Path.join(root, 'source.ts'), 'utf8')).toContain('return 2')
  await FS.writeFile(Path.join(root, 'second.ts'), proposal.outputs['second.ts']!.before)
  await runLearning(['recover', '--repo', root, '--proposal', 'batch'])
  expect(await FS.readFile(Path.join(root, 'second.ts'), 'utf8')).toContain('second = 2')
  expect((await readLearningStatus(root)).appliedProposals).toEqual(['batch'])
})
async function createFixture(): Promise<string> {
  const root = Path.join(Repo.getWorkspaceRoot(), '.artifacts/notes/review-learning-tests', Platform.randomUUID())
  await FS.mkdir(root)
  return root
}

async function scanLearning(root: string, id: string): Promise<LearningTypes.Scan> {
  const result = await runLearning(['scan', '--repo', root, '--rule', id])
  if (!isLearningScan(result)) {
    Errors.ThrowShouldNeverHappen('Review learning scan returned a different command result.')
  }
  return result
}

async function readLearningStatus(root: string): Promise<LearningTypes.LearningStatus> {
  const result = await runLearning(['status', '--repo', root])
  if (!isLearningStatus(result)) {
    Errors.ThrowShouldNeverHappen('Review learning status returned a different command result.')
  }
  return result
}

function isLearningScan(result: LearningTypes.ReviewLearningCommandResult): result is LearningTypes.Scan {
  return 'findings' in result && 'complete' in result
}

function isLearningStatus(result: LearningTypes.ReviewLearningCommandResult): result is LearningTypes.LearningStatus {
  return 'corrections' in result && 'appliedProposals' in result
}

async function capture(
  root: string,
  authority: unknown,
  id = 'example',
  authoritySource?: LearningTypes.Correction['authoritySource'],
): Promise<void> {
  const input = Path.join(root, 'capture.json')
  await FS.writeFile(
    input,
    Json.Print({
      id,
      authority,
      authoritySource,
      evidence: 'Human correction in group one',
      before: 'return 1',
      after: 'return 2',
      scope: ['.'],
      exceptions: [],
      rule: { kind: 'call-symbol', declarationFile: 'source.ts', declarationName: 'target' },
    }),
  )
  await runLearning(['capture', '--repo', root, '--input', input])
}

async function propose(root: string, scan: string, id: string): Promise<void> {
  const input = Path.join(root, 'proposal.json')
  const source = await FS.readFile(Path.join(root, 'source.ts'), 'utf8')
  const start = source.indexOf('1')
  await FS.writeFile(
    input,
    Json.Print({
      id,
      scan,
      analysis: 'Equivalent numeric correction within the explicit scope.',
      edits: [{ file: 'source.ts', range: Range(start, start + 1), expected: '1', replacement: '2' }],
    }),
  )
  await runLearning(['propose', '--repo', root, '--input', input])
}

// Authored fixture output is inspected and deliberately damaged by these tests.
type LearningFixtureRecord = {
  id: string
  accepted: unknown
  recheck: unknown
  analysis: string
  edits: LearningTypes.Proposal['edits']
  queryVersion: unknown
  inputs: unknown
  selected: unknown
  complete: boolean
  files: unknown
}
