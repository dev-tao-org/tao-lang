import * as Tests from '@shared-tests'
import { FS, Path } from '@shared/os'
import { projectDirectory } from '../stdlib-src/Stdlib'

Tests.test('stdlib uses the initialized source project directly', async () => {
  const live = await projectDirectory()
  Tests.expect(await FS.exists(Path.join(live, '.tao', 'store', 'project.json'))).toBe(true)
  Tests.expect(await FS.exists(Path.join(live, '@ui', 'Views.tao'))).toBe(true)
})
