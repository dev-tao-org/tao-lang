import { Tests } from '@shared/os'
import * as PreviewMeasurement from '../perf-src/PreviewMeasurement'

Tests.test('repeated measurement edits change source each time and reset each complete cycle', async () => {
  const settings = PreviewMeasurement.readPreviewMeasurement({ editCount: 32, frameCount: 1, extraViews: 0 })
  const canonical = await Tests.readApp('Hello World')
  const scenarios = PreviewMeasurement.createMeasurementScenarios(settings)
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
  Tests.expect(PreviewMeasurement.describeMeasurement(settings).warmEditCount).toBe(28)
  Tests.expect(PreviewMeasurement.describeMeasurement(settings).warmStartIndex).toBe(4)
})

Tests.test('the default sized measurement retains four established edit names and supports larger compiled source', async () => {
  const settings = PreviewMeasurement.readPreviewMeasurement({ editCount: 4, frameCount: 2, extraViews: 500 })
  Tests.expect(PreviewMeasurement.createMeasurementScenarios(settings).map(scenario => scenario.name)).toEqual([
    'text',
    'add-text',
    'row',
    'reset',
  ])
  const source = PreviewMeasurement.createMeasurementSource(await Tests.readApp('Hello World'), settings)
  Tests.expect(source).toContain('view Load0 {')
  Tests.expect(source).toContain('view Load499 {')
  Tests.expect(source).not.toContain('view Load500 {')
  Tests.expect(source).toContain('Text("Hello World")')
})
