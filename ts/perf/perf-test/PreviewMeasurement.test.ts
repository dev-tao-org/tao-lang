import { Tests } from '@shared/os'
import {
  createMeasurementScenarios,
  createMeasurementSource,
  describeMeasurement,
  readPreviewMeasurement,
} from '../perf-src/PreviewMeasurement'

Tests.test('repeated measurement edits change source each time and reset each complete cycle', async () => {
  const settings = readPreviewMeasurement({ editCount: 32, frameCount: 1, extraViews: 0 })
  const canonical = await Tests.readApp('Hello World')
  const scenarios = createMeasurementScenarios(settings)
  Tests.expect(scenarios).toHaveLength(32)
  let current = canonical
  for (const [index, scenario] of scenarios.entries()) {
    const next = scenario.apply(current, canonical)
    Tests.expect(next).not.toBe(current)
    if (index % 4 === 3) {
      Tests.expect(next).toBe(canonical)
    }
    current = next
  }
  Tests.expect(scenarios[28]!.apply(canonical, canonical)).toContain('Text("Hello Tao 8")')
  Tests.expect(describeMeasurement(settings).warmEditCount).toBe(28)
  Tests.expect(describeMeasurement(settings).warmStartIndex).toBe(4)
})

Tests.test('the default sized measurement retains four established edit names and supports larger compiled source', async () => {
  const settings = readPreviewMeasurement({ editCount: 4, frameCount: 2, extraViews: 500 })
  Tests.expect(createMeasurementScenarios(settings).map(scenario => scenario.name)).toEqual([
    'text',
    'add-text',
    'row',
    'reset',
  ])
  const source = createMeasurementSource(await Tests.readApp('Hello World'), settings)
  Tests.expect(source).toContain('view Load0 {')
  Tests.expect(source).toContain('view Load499 {')
  Tests.expect(source).not.toContain('view Load500 {')
  Tests.expect(source).toContain('Text("Hello World")')
})
