import * as Tests from '@shared-tests'
import Exec from '@shared/os/exec'
import { createReactiveEngine } from '../runtime-src/client/ReactiveEngine'
import { areValueSnapshotsEqual, takeValueSnapshot } from '../runtime-src/client/ValueSnapshots'
import { snapshotComparisonFixturePath } from './client.test-fixtures.SnapshotComparison'

Tests.test('constant ingress copies ordinary values and retains nested reactive capabilities', () => {
  const engine = createReactiveEngine()
  const live = engine.createWritable('before')
  const outer = { rows: [{ value: 'A' }], live }
  const constant = engine.createConstant(outer)
  outer.rows[0]!.value = 'external'
  const snapshot = constant.jsValue()
  const checkReadonly = (): void => {
    // @ts-expect-error Values read from a snapshot have deeply readonly fields.
    snapshot.rows[0]!.value = 'readonly'
    // @ts-expect-error Lists read from a snapshot have no mutating array methods.
    snapshot.rows.push({ value: 'readonly' })
  }
  void checkReadonly
  Tests.expect(snapshot.rows[0]?.value).toBe('A')
  const sameCapabilityType: typeof live = snapshot.live
  Tests.expect(sameCapabilityType).toBe(live)
  const observation = live.observe(() => {})
  const holder = engine.createConstant({ observation })
  const sameObservationType: typeof observation = holder.jsValue().observation
  Tests.expect(sameObservationType).toBe(observation)
  observation.unobserve()
  snapshot.live.update('after')
  Tests.expect(live.jsValue()).toBe('after')
  const nested = engine.createConstant({ snapshot })
  Tests.expect(nested.jsValue().snapshot).toBe(snapshot)
  engine.dispose()
})

Tests.test('symbol fields cannot bypass ownership for plain records and lists', () => {
  const engine = createReactiveEngine()
  const externalKey = Symbol('external')
  const input = { rows: [{ label: 'before' }], [externalKey]: 1 }
  Tests.expect(() => engine.createConstant(input)).toThrow('string field names')
  const list = Object.assign(['before'], { [externalKey]: 1 })
  Tests.expect(() => engine.createConstant(list)).toThrow('string field names')
  engine.dispose()
})

Tests.test('a spread expression with nested data publishes an ordinary snapshot', () => {
  const engine = createReactiveEngine()
  const expression = engine.createWritable('before')
  const data = { label: 'published' }
  const spread = { ...expression, data }
  const snapshot = engine.createConstant(spread).jsValue()
  const checkReadonly = (): void => {
    // @ts-expect-error Spreading a capability produces ordinary data with readonly fields.
    snapshot.data.label = 'readonly'
  }
  void checkReadonly
  data.label = 'external'
  Tests.expect(snapshot).not.toBe(spread)
  Tests.expect(snapshot.data.label).toBe('published')
  Tests.expect(Object.isFrozen(snapshot.data)).toBe(true)
  engine.dispose()
})

Tests.test('a rejected cyclic write preserves the prior snapshot and observer delivery', () => {
  const engine = createReactiveEngine()
  const source = engine.createWritable<{ children: unknown[] }>({ children: ['before'] })
  const initial = source.jsValue()
  const observed: (typeof initial)[] = []
  source.observe(snapshot => observed.push(snapshot))
  const cyclic = { children: [undefined as unknown] }
  cyclic.children[0] = cyclic
  Tests.expect(() => source.update(cyclic)).toThrow('acyclic lists and records')
  Tests.expect(source.jsValue()).toBe(initial)
  Tests.expect(observed).toEqual([initial])
  source.update({ children: ['after'] })
  Tests.expect(observed).toEqual([{ children: ['before'] }, { children: ['after'] }])
  engine.dispose()
})

Tests.test('deep snapshots publish changes at the leaf without invalidating equal replacements', () => {
  const engine = createReactiveEngine()
  const input = nestValue('before')
  const constant = engine.createConstant(input)
  Tests.expect(readLeaf(constant.jsValue())).toBe('before')

  const source = engine.createWritable(input)
  const initial = source.jsValue()
  let evaluations = 0
  const leaf = engine.createComputed(() => {
    evaluations += 1
    return readLeaf(source.jsValue())
  })
  const observed: string[] = []
  leaf.observe(value => observed.push(value))

  source.update(nestValue('before'))
  Tests.expect(source.jsValue()).toBe(initial)
  Tests.expect(evaluations).toBe(1)
  source.update(nestValue('after'))
  Tests.expect(observed).toEqual(['before', 'after'])
  Tests.expect(evaluations).toBe(2)
  engine.dispose()
})

Tests.test('snapshot equality bounds repeated pairs and compares each distinct pairing', async () => {
  const child = { label: 'A' }
  const left = takeValueSnapshot({ first: child, second: child })
  const right = takeValueSnapshot({ first: { label: 'A' }, second: { label: 'B' } })
  Tests.expect(areValueSnapshotsEqual(left, right)).toBe(false)

  const result = await Exec.capture('bun', ['run', snapshotComparisonFixturePath], { timeoutMs: 5000 })
  Tests.expect(result.stdout.trim()).toBe('Shared snapshots compared')
})

type NestedValue = string | { readonly child: NestedValue }

function nestValue(leaf: string): NestedValue {
  const depth = 20_000
  let value: NestedValue = leaf
  for (let level = 0; level < depth; level += 1) {
    value = { child: value }
  }
  return value
}

function readLeaf(value: NestedValue): string {
  while (typeof value !== 'string') {
    value = value.child
  }
  return value
}
