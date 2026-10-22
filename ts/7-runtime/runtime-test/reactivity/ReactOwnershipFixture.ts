import { S } from '@shared'

/** createReactOwnershipApp renders a representative generated Tao runtime fixture. */
export function createReactOwnershipApp(factor: number, addTopologyHook: boolean): string {
  const topologyHook = addTopologyHook ? topologyHookSource : ''
  const topologyView = addTopologyHook ? 'markerView,' : ''
  return reactOwnershipApp
    .replaceAll('__FACTOR__', String(factor))
    .replace('__TOPOLOGY_HOOK__', topologyHook)
    .replace('__TOPOLOGY_VIEW__', topologyView)
}

const topologyHookSource = S`
  const marker = Tao.useWritable(() => 'topology-2')
  const markerValue = Tao.useValue(marker)
  const markerView = createElement(Tao.Text, { testID: 'marker-' + id }, markerValue)
`
const reactOwnershipApp = S`
  import { createElement, StrictMode, Suspense, useLayoutEffect } from 'react'
  import Tao from '@tao/runtime-api'
  import { createReactiveEngine } from './_gen_runtime/runtime/ReactiveEngine'

  const never = new Promise<never>(() => {})
  const abandonedEngine = createReactiveEngine({ strategy: 'uncached-public-read' })
  const abandonedSource = abandonedEngine.createWritable(0)
  let abandonedEvaluations = 0
  const abandonedExpression = abandonedEngine.createComputed(() => {
    abandonedEvaluations += 1
    return { value: abandonedSource.jsValue() }
  })
  const retainedEngine = createReactiveEngine()
  const retainedSource = retainedEngine.createWritable(0)
  let retainedEvaluations = 0
  const retainedExpression = retainedEngine.createComputed(() => {
    retainedEvaluations += 1
    return { value: retainedSource.jsValue() }
  })
  const objectEngine = createReactiveEngine({ strategy: 'uncached-public-read' })
  const objectSource = objectEngine.createWritable(0)
  const objectExpression = objectEngine.createComputed(() => ({ value: objectSource.jsValue() }))
  const raceEngine = createReactiveEngine()
  const raceSource = raceEngine.createWritable(0)
  const raceExpression = raceEngine.createComputed(() => raceSource.jsValue())

  function CommitRaceUpdater() {
    useLayoutEffect(() => raceSource.update(1), [])
    return null
  }

  function CommitRaceReader() {
    const result = Tao.useValue(raceExpression)
    return createElement(Tao.Text, { testID: 'race-value' }, String(result))
  }

  function AbandonedProbe() {
    Tao.useValue(abandonedExpression)
    throw never
  }

  function RetainedProbe() {
    const result = Tao.useValue(retainedExpression)
    return createElement(Tao.Text, { testID: 'retained-value' }, String(result.value))
  }

  function Counter({ id, initial }) {
    const count = Tao.useWritable(() => initial)
    const current = Tao.useValue(count)
    const scaled = Tao.useComputed(() => count.jsValue() * __FACTOR__, [count])
    const scaledValue = Tao.useValue(scaled)
    __TOPOLOGY_HOOK__
    return createElement(Tao.View, null,
      createElement(Tao.Text, { testID: 'count-' + id }, String(current)),
      createElement(Tao.Text, { testID: 'scaled-' + id }, String(scaledValue)),
      createElement(Tao.Pressable, { testID: 'increment-' + id, onPress: () => count.update(current + 1) },
        createElement(Tao.Text, null, 'increment')),
      __TOPOLOGY_VIEW__
    )
  }

  function App() {
    const showA = Tao.useWritable(() => true)
    const visibleA = Tao.useValue(showA)
    const retained = Tao.useWritable(() => true)
    const retainedVisible = Tao.useValue(retained)
    const abandonedReport = Tao.useWritable(() => 0)
    const abandonedCount = Tao.useValue(abandonedReport)
    const retainedReport = Tao.useWritable(() => 0)
    const retainedCount = Tao.useValue(retainedReport)
    const objectValue = Tao.useValue(objectExpression)
    return createElement(StrictMode, null,
      createElement(Tao.View, null,
        createElement(Tao.Pressable, {
          testID: 'remove-A', onPress: () => showA.update(false),
        }, createElement(Tao.Text, null, 'remove A')),
        createElement(Tao.Pressable, {
          testID: 'advance-abandoned-source', onPress: () => {
            const before = abandonedEvaluations
            abandonedSource.update(abandonedSource.jsValue() + 1)
            abandonedReport.update(abandonedEvaluations - before)
          },
        }, createElement(Tao.Text, null, 'advance abandoned')),
        createElement(Tao.Text, { testID: 'abandoned-evaluations' }, String(abandonedCount)),
        createElement(Tao.Pressable, {
          testID: 'unmount-retained', onPress: () => retained.update(false),
        }, createElement(Tao.Text, null, 'unmount retained')),
        createElement(Tao.Pressable, {
          testID: 'advance-retained-source', onPress: () => {
            const before = retainedEvaluations
            retainedSource.update(retainedSource.jsValue() + 1)
            retainedReport.update(retainedEvaluations - before)
          },
        }, createElement(Tao.Text, null, 'advance retained')),
        createElement(Tao.Text, { testID: 'retained-evaluations' }, String(retainedCount)),
        createElement(CommitRaceUpdater),
        createElement(CommitRaceReader),
        createElement(Tao.Pressable, {
          testID: 'advance-object-source', onPress: () => objectSource.update(objectSource.jsValue() + 1),
        }, createElement(Tao.Text, null, 'advance object')),
        createElement(Tao.Text, { testID: 'object-value' }, String(objectValue.value)),
        visibleA ? createElement(Counter, { key: 'A', id: 'A', initial: 1 }) : null,
        createElement(Counter, { key: 'B', id: 'B', initial: 10 }),
        retainedVisible ? createElement(RetainedProbe) : null,
        createElement(Suspense, {
          fallback: createElement(Tao.Text, { testID: 'suspended-fallback' }, 'suspended'),
        }, createElement(AbandonedProbe)),
      ),
    )
  }

  export default App
`
