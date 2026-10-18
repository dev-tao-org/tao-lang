import { FileSystem, Repo, Tests } from '@shared/os'
import { applyScenario, helloWorldScenarios, previewScenarios } from '../perf-src/PreviewScenarios'

Tests.test('preview button cycle fits the isolated Preview app', async () => {
  const canonical = await FileSystem.readFile(Repo.resolvePath('Apps/Dev/Preview/Preview.tao'), 'utf8')
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

Tests.test('hello world preview cycle keeps the performance edits', async () => {
  const canonical = await Tests.readApp('Hello World')
  const text = applyScenario(helloWorldScenarios, 'text', canonical, canonical)
  const added = applyScenario(helloWorldScenarios, 'add-text', text, canonical)
  const row = applyScenario(helloWorldScenarios, 'row', added, canonical)
  Tests.expect(text).toContain('Text("Hello Tao")')
  Tests.expect(added).toContain('Text("Second view")')
  Tests.expect(row).toContain('render Row {')
  Tests.expect(helloWorldScenarios.map(scenario => scenario.name)).toEqual(['text', 'add-text', 'row', 'reset'])
  Tests.expect(applyScenario(helloWorldScenarios, 'reset', row, canonical)).toBe(canonical)
})
