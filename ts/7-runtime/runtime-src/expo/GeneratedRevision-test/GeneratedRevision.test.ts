import { Tests } from '@shared/os'
import { createRevisionOwner, snapshotRevision } from '../GeneratedRevision'
import type { GeneratedRevision } from '../PreviewProtocol'

Tests.test('complete revision owner coalesces B while A is active and C retains its own outcome', async () => {
  let release!: () => void
  const blocked = new Promise<void>(resolve => release = resolve)
  const published: string[] = []
  const owner = createRevisionOwner('session', revision('r0', 0), async value => {
    published.push(value.revision)
    if (value.revision === 'rA') {
      await blocked
    }
    return { status: 'published' }
  })
  const first = owner.publish(revision('rA', 1))
  const second = owner.publish(revision('rB', 2))
  const third = owner.publish(revision('rC', 3))
  Tests.expect(await second).toMatchObject({ revision: 'rB', status: 'superseded' })
  Tests.expect(published).toEqual(['rA'])
  release()
  Tests.expect(await first).toMatchObject({ revision: 'rA', publishedRevision: 'rA' })
  Tests.expect(await third).toMatchObject({ revision: 'rC', publishedRevision: 'rC' })
  Tests.expect(published).toEqual(['rA', 'rC'])
})

Tests.test('snapshot copies authored bytes and rejects traversal and runtime namespace ownership', () => {
  const files = { 'App.tsx': 'A' }
  const snapshot = snapshotRevision({ revision: 'r1', sequence: 1, files })
  files['App.tsx'] = 'B'
  Tests.expect(snapshot.files).toEqual({ 'App.tsx': 'A' })
  Tests.expect(() => snapshotRevision({ revision: 'r2', sequence: 2, files: { '../App.tsx': 'B' } })).toThrow()
  Tests.expect(() => snapshotRevision({ revision: 'r2', sequence: 2, files: { '_gen_runtime/TR.ts': '' } })).toThrow()
})

Tests.test('no-op revisions retain served identity and an ordinary committed error can be corrected', async () => {
  const owner = createRevisionOwner('session', revision('rA', 0), async value => ({
    status: value.revision === 'rB' ? 'noop' : value.revision === 'rC' ? 'error' : 'published',
    committed: value.revision === 'rC',
  }))
  Tests.expect(await owner.publish(revision('rB', 1))).toMatchObject({ status: 'noop', publishedRevision: 'rA' })
  Tests.expect(owner.current().revision).toBe('rA')
  Tests.expect(await owner.publish(revision('rC', 2))).toMatchObject({ status: 'error', publishedRevision: 'rC' })
  Tests.expect(await owner.publish(revision('rD', 3))).toMatchObject({ status: 'published', publishedRevision: 'rD' })
})

function revision(name: string, sequence: number): GeneratedRevision {
  return { revision: name, sequence, files: { 'App.tsx': name } }
}

Tests.test('out-of-order requests cannot replace newer pending work or replay a duplicate active result', async () => {
  let release!: () => void
  const blocked = new Promise<void>(resolve => release = resolve)
  const published: string[] = []
  const owner = createRevisionOwner('session', revision('r0', 0), async value => {
    published.push(value.revision)
    if (value.sequence === 3) {
      await blocked
    }
    return { status: 'published' }
  })
  const active = owner.publish(revision('r3', 3))
  const pending = owner.publish(revision('r5', 5))
  Tests.expect(await owner.publish(revision('r4', 4))).toMatchObject({ revision: 'r4', status: 'superseded' })
  Tests.expect(await owner.publish(revision('r3', 3))).toMatchObject({ revision: 'r3', status: 'superseded' })
  Tests.expect(await owner.publish(revision('r1', 1))).toMatchObject({ revision: 'r1', status: 'superseded' })
  release()
  await Promise.all([active, pending])
  Tests.expect(published).toEqual(['r3', 'r5'])
})
