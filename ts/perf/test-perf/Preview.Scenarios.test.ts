import * as Tests from '@shared-tests'
import { FS, Repo } from '@shared/os'
import { applyScenario, previewScenarios } from '../perf-src/Preview/PreviewScenarios'

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
