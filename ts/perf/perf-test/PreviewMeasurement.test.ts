import * as Parser from '@grammar/parser'
import { Tests } from '@shared/os'
import * as PreviewMeasurement from '../perf-src/PreviewMeasurement'

Tests.test('repeated measurement edits change source each time and reset each complete cycle', async () => {
  const settings = PreviewMeasurement.readPreviewMeasurement({ editCount: 32, frameCount: 1, extraViews: 0 })
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

Tests.test('the default sized measurement retains four established edit names and supports larger compiled source', async () => {
  const settings = PreviewMeasurement.readPreviewMeasurement({ editCount: 4, frameCount: 2, extraViews: 500 })
  Tests.expect(PreviewMeasurement.createMeasurementScenarios(settings).map(scenario => scenario.name)).toEqual([
    'text',
    'add-text',
    'row',
    'reset',
  ])
  const source = PreviewMeasurement.createMeasurementFiles(
    await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao'),
    settings,
  ).entry
  Tests.expect(source).toContain('view Load0 {')
  Tests.expect(source).toContain('view Load499 {')
  Tests.expect(source).not.toContain('view Load500 {')
  Tests.expect(source).toContain('Text("Hello World")')
})

Tests.test('multi-input measurements distribute unique generated views across imported sibling files', async () => {
  const settings = PreviewMeasurement.readPreviewMeasurement({
    editCount: 4,
    frameCount: 2,
    extraViews: 7,
    extraFileCount: 3,
  })
  const fixture = PreviewMeasurement.createMeasurementFiles(
    await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao'),
    settings,
  )
  Tests.expect(fixture.extraFiles.map(file => file.name)).toEqual(['LoadViews0', 'LoadViews1', 'LoadViews2'])
  Tests.expect(fixture.entry).toContain('use package ./LoadViews0')
  Tests.expect(fixture.entry).toContain('use package ./LoadViews2')
  Tests.expect(fixture.entry).not.toContain('view Load0 {')
  Tests.expect(fixture.extraFiles.map(file => (file.source.match(/view Load\d+ \{/g) ?? []).length)).toEqual([3, 2, 2])
  const allSources = fixture.extraFiles.map(file => file.source).join('\n')
  for (const file of fixture.extraFiles) {
    Tests.expect(Parser.createParser().parse(file.source).rootNode.hasError).toBe(false)
  }
  Tests.expect(allSources).toContain('view Load0 {')
  Tests.expect(allSources).toContain('view Load6 {')
  Tests.expect(allSources).not.toContain('view Load7 {')
  Tests.expect(PreviewMeasurement.describeMeasurement(settings).extraFileDefinition).toContain('sibling Tao modules')
})

Tests.test('multi-input measurements retain the single-file large-source setting when no extra modules are selected', async () => {
  const settings = PreviewMeasurement.readPreviewMeasurement({
    editCount: 4,
    frameCount: 1,
    extraViews: 3,
    extraFileCount: 0,
  })
  const fixture = PreviewMeasurement.createMeasurementFiles(
    await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao'),
    settings,
  )
  Tests.expect(fixture.extraFiles).toEqual([])
  Tests.expect(fixture.entry).toContain('view Load0 {')
  Tests.expect(fixture.entry).toContain('view Load2 {')
  Tests.expect(fixture.entry).not.toContain('use package ./LoadViews')
})
