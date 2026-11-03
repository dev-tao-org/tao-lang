import * as Tests from '@shared-tests'
import { FS, Repo } from '@shared/os'
import { applyScenario, performanceScenarios, previewScenarios } from '../../perf-src/Preview/PreviewScenarios'

Tests.test('preview button cycle fits the isolated Preview app', async () => {
  const canonical = await FS.readFile(Repo.resolvePath('Apps/Dev/Preview/Preview.tao'), 'utf8')
  const label = applyScenario(previewScenarios, 'label', canonical, canonical)
  const detail = applyScenario(previewScenarios, 'detail', label, canonical)
  const row = applyScenario(previewScenarios, 'row', detail, canonical)
  const reset = applyScenario(previewScenarios, 'reset', row, canonical)
  Tests.expect(label).toContain('Text("Editing")')
  Tests.expect(label.includes('Text("Detail")')).toBe(false)
  Tests.expect(detail).toContain('Text("Detail")')
  Tests.expect(detail).toContain('render Col {')
  Tests.expect(row).toContain('render Row {')
  Tests.expect(row).toContain('Text("Editing")')
  Tests.expect(reset).toBe(canonical)
})

Tests.test('minimal benchmark preview cycle keeps the performance edits', async () => {
  const canonical = await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao')
  const text = applyScenario(performanceScenarios, 'text', canonical, canonical)
  const added = applyScenario(performanceScenarios, 'add-text', text, canonical)
  const row = applyScenario(performanceScenarios, 'row', added, canonical)
  Tests.expect(text).toContain('Text("Hello Tao")')
  Tests.expect(added).toContain('Text("Second view")')
  Tests.expect(row).toContain('render Row {')
  Tests.expect(performanceScenarios.map(scenario => scenario.name)).toEqual(['text', 'add-text', 'row', 'reset'])
  Tests.expect(applyScenario(performanceScenarios, 'reset', row, canonical)).toBe(canonical)
})
