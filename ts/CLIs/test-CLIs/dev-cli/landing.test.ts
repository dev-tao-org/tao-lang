import { Json } from '@shared'
import { NullCharacter, S } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Platform } from '@shared/os'
import Exec from '@shared/os/exec'
import { publishPreviewArchive } from '../../CLIs-src/dev-cli/landing/Archive'
import { integrateMain } from '../../CLIs-src/dev-cli/landing/Integration'
import { land } from '../../CLIs-src/dev-cli/landing/Land'
import { pendingPreviewRecords } from '../../CLIs-src/dev-cli/landing/PreviewRecords'
import { inspectLanding, publishAndMerge } from '../../CLIs-src/dev-cli/landing/PullRequest'
import { recordingLanding } from './landing.test-utils'

const GitMutationCommandRegx = /^(storage )?git (fetch|push|add|commit) /
const IncompleteLandingEvidenceRegx = /inconsistent or incomplete/

Tests.test('landing orders verification, archive publication, remote confirmation, source push, checks and pinned merge', async () => {
  const f = recordingLanding()
  const proof = await land(f.io)
  Tests.expect(proof.sourceCommit).toBe(f.source)
  const stages = [
    './agent verify',
    `storage git push origin ${f.archive}:refs/heads/main`,
    'storage git ls-remote --exit-code origin refs/heads/main',
    `git update-index --cacheinfo 160000,${f.archive},.storage`,
    `git push origin ${f.source}:refs/heads/${f.branch}`,
    'gh pr create',
    'gh pr checks',
    'gh pr merge',
    'gh api',
    `write .artifacts/landing/${f.branch}.json`,
  ].map(stage => f.calls.findIndex(call => call.startsWith(stage)))
  Tests.expect(stages.every(index => index >= 0)).toBe(true)
  Tests.expect(stages).toEqual([...stages].sort((a, b) => a - b))
  Tests.expect(f.calls.find(call => call.startsWith('gh pr merge'))).toContain(`--match-head-commit ${f.source}`)
  Tests.expect(f.calls.filter(call => call.startsWith('storage git add'))).toEqual([
    `storage git add -- performance/preview/${f.source}/record.json performance/preview/${f.source}/report.json`,
  ])
})

Tests.test('dirty authored and ignored-storage work stop before any fetch or publication', async () => {
  for (const key of ['dirty', 'storageDirty'] as const) {
    const f = recordingLanding()
    f.state[key] = '?? unrelated.txt'
    await Tests.rejects(land(f.io))
    Tests.expect(f.calls.some(call => GitMutationCommandRegx.test(call))).toBe(false)
  }
})

Tests.test('archived fixture provenance uses its measured commit path and still rejects a changed checksum', async () => {
  const f = recordingLanding()
  const path = `${f.pending}/record.json`
  const record = Json.Parse(f.files.get(path)!) as LandingEvidenceFixture
  record.fixture.path = 'Apps/Tests/Hello World.tao'
  f.files.set(path, Json.Print(record))
  const records = await pendingPreviewRecords(f.io)
  Tests.expect(records.map(record => record.source)).toEqual([f.source])
  Tests.expect(f.calls).toContain(`git show ${f.source}:Apps/Tests/Hello World.tao`)
  record.fixture.sha256 = 'corrupted'
  f.files.set(path, Json.Print(record))
  await Tests.rejects(pendingPreviewRecords(f.io), IncompleteLandingEvidenceRegx)
})

Tests.test('merge-main preserves merge failures and never publishes', async () => {
  const f = recordingLanding()
  f.state.fail = 'git merge --no-edit'
  await Tests.rejects(integrateMain(f.io))
  Tests.expect(f.calls.some(call => call.includes('push') || call.includes('reset') || call.includes('abort'))).toBe(
    false,
  )
})

Tests.test('archive push failure leaves source unpublished and pointer uncommitted', async () => {
  const f = recordingLanding()
  f.state.fail = 'storage git push'
  await Tests.rejects(land(f.io))
  Tests.expect(f.calls.some(call => call.startsWith('git update-index') || call.startsWith('gh pr create'))).toBe(false)
})

Tests.test('missing and failed records cannot publish, and exact report bytes are required', async () => {
  for (const kind of ['missing', 'failed', 'tampered']) {
    const f = recordingLanding()
    const path = `${f.pending}/record.json`
    if (kind === 'missing') {
      f.files.delete(path)
    }
    if (kind === 'failed') {
      f.files.set(path, f.files.get(path)!.replace('passed', 'failed'))
    }
    if (kind === 'tampered') {
      f.files.set(`${f.pending}/report.json`, '{}')
    }
    await Tests.rejects(pendingPreviewRecords(f.io))
    Tests.expect(f.calls.some(call => call.includes('push'))).toBe(false)
  }
})

Tests.test('instruction-only commits are exempt and an identical archived record is preserved', async () => {
  const f = recordingLanding()
  f.state.implementation = false
  Tests.expect(await pendingPreviewRecords(f.io)).toEqual([])
  f.state.implementation = true
  const destination = `.storage/performance/preview/${f.source}/record.json`
  f.files.set(destination, f.files.get(`${f.pending}/record.json`)!)
  await publishPreviewArchive(f.io, f.source)
  Tests.expect(f.calls).not.toContain(`write ${destination}`)
})

Tests.test('unknown unpublished archive changes and immutable archive conflicts refuse publication', async () => {
  const f = recordingLanding()
  f.files.set(`.storage/performance/preview/${f.source}/record.json`, '{}')
  await Tests.rejects(publishPreviewArchive(f.io, f.source))
  Tests.expect(f.calls.some(call => call.includes('push'))).toBe(false)
})

Tests.test('a changed PR head and failed required checks cannot issue a merge', async () => {
  for (const kind of ['head', 'checks']) {
    const f = recordingLanding()
    if (kind === 'head') {
      f.state.remoteHead = f.tree
    } else {
      f.state.fail = 'gh pr checks'
    }
    await Tests.rejects(publishAndMerge(
      f.io,
      f.branch,
      Shared.joinTextLines(
        S`
          Land tooling

          - Reviewed
        `,
        '',
      ),
      f.source,
    ))
    Tests.expect(f.calls.some(call => call.startsWith('gh pr merge'))).toBe(false)
  }
})

Tests.test('landed requires merged PR ancestry and propagates authentication failures', async () => {
  const f = recordingLanding()
  Tests.expect(await inspectLanding(f.io, f.branch)).toBeUndefined()
  f.state.merged = true
  f.state.fail = 'gh api'
  await Tests.rejects(inspectLanding(f.io, f.branch))
  Tests.expect(f.calls.every(call => call.startsWith('gh '))).toBe(true)
})

Tests.test('integration that changes HEAD stops before verification or publication', async () => {
  const f = recordingLanding()
  f.state.integrationChanges = true
  await Tests.rejects(land(f.io))
  Tests.expect(f.calls.some(call => call.includes('push') || call === './agent verify')).toBe(false)
})

Tests.test('a retry after merge returns authoritative proof without publishing again', async () => {
  const f = recordingLanding()
  f.state.merged = true
  Tests.expect((await land(f.io)).sourceCommit).toBe(f.source)
  Tests.expect(f.calls.some(call => call.includes('push') || call.includes('fetch'))).toBe(false)
  Tests.expect(f.files.has(`.artifacts/landing/${f.branch}.json`)).toBe(true)
})

Tests.test('matching incomplete archive copies resume while unknown local archive history is preserved', async () => {
  const f = recordingLanding()
  const path = `performance/preview/${f.source}/record.json`
  f.state.storageDirty = `?? ${path}${NullCharacter}`
  f.files.set(`.storage/${path}`, f.files.get(`${f.pending}/record.json`)!)
  await publishPreviewArchive(f.io, f.source)
  Tests.expect(f.calls.some(call => call.startsWith('storage git push'))).toBe(true)
  const unknown = recordingLanding()
  unknown.state.archiveBase = unknown.source
  unknown.state.localArchivePaths = 'unrelated.txt'
  await Tests.rejects(publishPreviewArchive(unknown.io, unknown.source))
  Tests.expect(unknown.calls.some(call => call.includes('push'))).toBe(false)
})

Tests.test('source commits arriving during archive publication cannot reach a source push', async () => {
  const f = recordingLanding()
  f.state.advanceHeadOn = 'storage git push'
  await Tests.rejects(land(f.io))
  Tests.expect(f.calls.some(call => call.startsWith('git push'))).toBe(false)
  Tests.expect(f.files.has(`.artifacts/landing/${f.branch}.json`)).toBe(false)
})

Tests.test('storage advancing after remote confirmation cannot create an unpublished archive pin', async () => {
  const f = recordingLanding()
  f.state.advanceArchiveOn = 'storage git ls-remote --exit-code'
  await Tests.rejects(land(f.io))
  Tests.expect(f.calls.some(call => call.startsWith('git update-index') || call.startsWith('git commit'))).toBe(false)
  Tests.expect(f.calls.some(call => call.startsWith('git push'))).toBe(false)
  Tests.expect(f.files.has(`.artifacts/landing/${f.branch}.json`)).toBe(false)
})

Tests.test('a pointer whose gitlink differs from the confirmed archive cannot publish', async () => {
  const f = recordingLanding()
  f.state.pointerPending = true
  f.state.pinnedArchive = f.tree
  await Tests.rejects(land(f.io))
  Tests.expect(f.calls.some(call => call.startsWith('git push') || call.startsWith('git commit'))).toBe(false)
})

Tests.test('pointer commits preserve unrelated user changes staged immediately before the commit', async () => {
  const f = recordingLanding()
  f.state.pointerPending = true
  const command = f.io.command
  f.io.command = async (name, args = [], options = {}) => {
    const [subcommand] = Exec.resolveCommandArgs(args)
    const gitCommit = name === 'git' && subcommand === 'commit'
    if (gitCommit && options.cwd === '/recording') {
      f.state.userStagedPaths = 'user-owned.ts'
    }
    return command(name, args, options)
  }
  const published = await publishPreviewArchive(f.io, f.source)
  Tests.expect(published.landingHead).toBe('e'.repeat(40))
  Tests.expect(f.state.committedUserPaths).toBe('')
  Tests.expect(f.state.userStagedPaths).toBe('user-owned.ts')
})

Tests.test('source commits arriving immediately before publication fail the explicit expected-head guard', async () => {
  const f = recordingLanding()
  const read = f.io.read
  let messageReads = 0
  f.io.read = async path => {
    const text = await read(path)
    if (path.endsWith('.msg') && ++messageReads === 2) {
      f.state.localHead = f.tree
    }
    return text
  }
  await Tests.rejects(land(f.io))
  Tests.expect(f.calls.some(call => call.startsWith('storage git push'))).toBe(true)
  Tests.expect(f.calls.some(call => call.startsWith('git push'))).toBe(false)
})

Tests.test('archive pointers retain the verified parent and only the storage diff', async () => {
  const f = recordingLanding()
  f.state.pointerPending = true
  const proof = await land(f.io)
  Tests.expect(proof.sourceCommit).toBe('e'.repeat(40))
  Tests.expect(f.calls).toContain('git diff --cached --name-only --ignore-submodules=none')
  Tests.expect(f.calls).toContain(`git push origin ${proof.sourceCommit}:refs/heads/${f.branch}`)
  for (const kind of ['parent', 'paths']) {
    const invalid = recordingLanding()
    invalid.state.pointerPending = true
    if (kind === 'parent') {
      invalid.state.pointerParents = invalid.tree
    } else {
      invalid.state.pointerPaths = S`
        .storage
        ts/new-source.ts
      `
    }
    await Tests.rejects(land(invalid.io))
    Tests.expect(invalid.calls.some(call => call.startsWith('git push'))).toBe(false)
  }
})

Tests.test('an older merged PR cannot produce a success receipt for a branch with new source', async () => {
  const f = recordingLanding()
  f.state.merged = true
  f.state.localHead = f.tree
  await Tests.rejects(land(f.io))
  Tests.expect(f.files.has(`.artifacts/landing/${f.branch}.json`)).toBe(false)
  Tests.expect(f.calls.some(call => call.includes('push') || call.includes('fetch'))).toBe(false)
})

Tests.test('a fork with the same branch name does not prove this repository branch landed', async () => {
  const f = recordingLanding()
  f.state.merged = true
  f.state.crossRepository = true
  Tests.expect(await inspectLanding(f.io, f.branch)).toBeUndefined()
  Tests.expect(f.calls.some(call => call.startsWith('gh api'))).toBe(false)
})

Tests.test('raw reports need the measured source identity even when their updated checksums are valid', async () => {
  for (const raw of [{ version: 1, commit: 'f'.repeat(40) }, { version: 1 }]) {
    const f = recordingLanding()
    const report = Json.Print(raw)
    const metadata = Json.Parse(f.files.get(`${f.pending}/record.json`)!) as LandingEvidenceFixture
    metadata.reportSha256 = Platform.hashText(report)
    f.files.set(`${f.pending}/record.json`, Json.Print(metadata))
    f.files.set(`${f.pending}/report.json`, report)
    await Tests.rejects(pendingPreviewRecords(f.io))
    Tests.expect(f.calls.some(call => call.includes('push'))).toBe(false)
  }
})

// Authored fixture output is inspected and deliberately damaged by these tests.
type LandingEvidenceFixture = { fixture: { path: string; sha256: string }; reportSha256: string }
