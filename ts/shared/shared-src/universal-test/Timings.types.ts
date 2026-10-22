import { Timings } from '@shared'

/** TimingResult proves the callable entry retains its callback's ordinary result type. */
export type TimingResult = ReturnType<typeof entry>

const operation = Timings.measured('typed', (value: string) => value.length)
const orchestration = Timings.measure('typed-parent', (timings, value: string) => timings.run(operation, value))
const entry = Timings.createTopLevelTimer((timings, value: string) => timings.run(orchestration, value))
// @ts-expect-error The collector constructor is private.
const constructor: new() => Timings = Timings
void constructor
Timings.createTopLevelTimer(collector => {
  const result: number = collector.run(operation, 'Tao')
  const nested: number = collector.run(entry, 'Tao')
  const direct: number = entry('Tao')
  void [result, nested, direct]
  // @ts-expect-error Measured operations are descriptors, not callable functions.
  operation('Tao')
  // @ts-expect-error Orchestration operations are descriptors, not callable functions.
  orchestration('Tao')
  // @ts-expect-error Execution preserves the authored argument type.
  collector.run(operation, 42)
  // @ts-expect-error Context injection does not add an authored argument.
  collector.run(orchestration, collector, 'Tao')
})
// @ts-expect-error Injected clocks require an explicit identity.
Timings.createTopLevelTimer(() => {}, { now: () => 0 })
