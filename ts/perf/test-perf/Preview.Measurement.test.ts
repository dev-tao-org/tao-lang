import * as Grammar from '@grammar'
import { NewlineCharacter } from '@shared'
import * as Tests from '@shared-tests'

import * as PreviewMeasurement from '../perf-src/Preview/PreviewMeasurement'

const LoadViewDeclarationRegx = /view Load\d+ \{/g

Tests.test('repeated measurement edits change source each time and reset each complete cycle', async () => {
  const settings = PreviewMeasurement.readPreviewMeasurement({ editCount: 32, frameCount: 1 })
  const canonical = await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao')
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

Tests.test('the fixed measurement retains four established edit names', () => {
  const settings = PreviewMeasurement.readPreviewMeasurement({ editCount: 4, frameCount: 2 })
  Tests.expect(PreviewMeasurement.createMeasurementScenarios(settings).map(scenario => scenario.name)).toEqual([
    'text',
    'add-text',
    'row',
    'reset',
  ])
})

Tests.test('the performance project has 240 unique views in six groups of four modules', async () => {
  const fixture = PreviewMeasurement.createMeasurementFiles(
    await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao'),
  )
  Tests.expect(fixture.extraFiles).toHaveLength(24)
  Tests.expect(fixture.entry).toContain('use package ./LoadViews0')
  Tests.expect(fixture.entry).toContain('use package ./LoadViews20')
  Tests.expect(fixture.entry).toContain('Text("Hello World")')
  Tests.expect(fixture.extraFiles[0]!.source).toContain('use package ./LoadViews3')
  Tests.expect(fixture.extraFiles[20]!.source).toContain('use package ./LoadViews23')
  const allSources = fixture.extraFiles.map(file => file.source).join(NewlineCharacter)
  const declarations = allSources.match(LoadViewDeclarationRegx) ?? []
  Tests.expect(new Set(declarations).size).toBe(240)
  const parser = Grammar.createParser()
  for (const file of fixture.extraFiles) {
    Tests.expect(parser.parse(file.source).rootNode.hasError).toBe(false)
  }
  Tests.expect(allSources).toContain('view Load0 {')
  Tests.expect(allSources).toContain('view Load239 {')
})
