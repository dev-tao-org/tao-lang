import * as Grammar from '@grammar'
import { NewlineCharacter } from '@shared'
import * as Tests from '@shared-tests'

import * as PreviewMeasurement from '../../repo-analysis-src/Performance/Preview/PreviewMeasurement'

const LoadViewDeclarationRegx = /view Load\d+ \{/g

Tests.test('repeated measurement edits change source each time and reset each complete cycle', async () => {
  const settings = PreviewMeasurement.readPreviewMeasurement({ editCount: 32, frameCount: 1 })
  const fixture = PreviewMeasurement.createMeasurementFiles(
    await Tests.readFixture('ts/repo-analysis/performance-fixtures/Performance/Performance.tao'),
  )
  const canonical = fixture.entry
  const scenarios = PreviewMeasurement.createMeasurementScenarios(settings)
  Tests.expect(scenarios).toHaveLength(32)
  let current = canonical
  let dependency = fixture.extraFiles[1]!.source
  for (const [index, scenario] of scenarios.entries()) {
    if (scenario.path === 'LoadViews1.tao') {
      const changed = scenario.apply(dependency, canonical)
      Tests.expect(changed).not.toBe(dependency)
      dependency = changed
      continue
    }
    const next = scenario.apply(current, canonical)
    Tests.expect(next).not.toBe(current)
    if (index % 8 === 7) {
      Tests.expect(next).toBe(canonical)
    }
    current = next
  }
  Tests.expect(scenarios[24]!.apply(canonical, canonical)).toContain('Text("Render Small text edit 4")')
  Tests.expect(dependency).toContain('Text("Imported edit 4")')
  Tests.expect(PreviewMeasurement.describeMeasurement(settings).warmEditCount).toBe(24)
  Tests.expect(PreviewMeasurement.describeMeasurement(settings).warmStartIndex).toBe(8)
})

Tests.test('a cycle gives each render transition a distinct stable identity', () => {
  const settings = PreviewMeasurement.readPreviewMeasurement({ editCount: 8, frameCount: 2 })
  Tests.expect(PreviewMeasurement.createMeasurementScenarios(settings).map(scenario => scenario.name)).toEqual([
    'text-1',
    'local-expand-1',
    'local-shrink-1',
    'imported-mount-1',
    'imported-expand-1',
    'dependency-edit-1',
    'imported-shrink-1',
    'reset-1',
  ])
})

Tests.test('the performance project has 240 unique views in six groups of four modules', async () => {
  const fixture = PreviewMeasurement.createMeasurementFiles(
    await Tests.readFixture('ts/repo-analysis/performance-fixtures/Performance/Performance.tao'),
  )
  Tests.expect(fixture.extraFiles).toHaveLength(24)
  Tests.expect(fixture.entry).toContain('use ./LoadViews0 Load0')
  Tests.expect(fixture.entry).toContain('use ./LoadViews20 Load200')
  Tests.expect(fixture.entry).toContain('Text("Hello World")')
  Tests.expect(fixture.extraFiles[0]!.source).toContain('use ./LoadViews3 Load30')
  Tests.expect(fixture.extraFiles[20]!.source).toContain('use ./LoadViews23 Load230')
  Tests.expect(fixture.extraFiles[1]!.source).toContain('Text("Imported leaf 1")')
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
