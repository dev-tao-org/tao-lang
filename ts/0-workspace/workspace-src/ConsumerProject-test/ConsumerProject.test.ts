import { Errors } from '@shared'
import { FileSystem, Path, Tests } from '@shared/os'
import { createStandaloneLibraryFixture } from '../../workspace-test/StandaloneLibrary'
import { withConsumerProject } from '../ConsumerProject'
import { cleanProject } from '../projects/Clean'
import { acquireSession } from '../projects/Sessions'

Tests.test('managed consumer host borrows authored dependencies and protects active state until failure releases its session', async () => {
  const root = await createStandaloneLibraryFixture()
  const packageDirectory = Path.join(root, 'src/ts')
  const host = Path.join(root, '.tao/cache/sessions/ownership/expo')
  await Tests.expect(withConsumerProject(packageDirectory, 'ownership', async directory => {
    Tests.expect(directory).toBe(host)
    Tests.expect(FileSystem.realpathSync(Path.join(host, 'node_modules'))).toBe(
      FileSystem.realpathSync(Path.join(packageDirectory, 'node_modules')),
    )
    Tests.expect(FileSystem.existsSync(Path.join(host, 'Application.ts'))).toBe(true)
    Tests.expect(FileSystem.existsSync(Path.join(host, 'metro.config.js'))).toBe(true)
    Tests.expect(FileSystem.existsSync(Path.join(root, 'package.json'))).toBe(false)
    const protectedState = await cleanProject(root)
    Tests.expect(protectedState.skippedActive).toEqual(['ownership'])
    Tests.expect(protectedState.sharedProtected).toBe(true)
    Errors.ThrowUserInput('Recorded host process failure')
  })).rejects.toThrow('Recorded host process failure')
  const session = await acquireSession(root, { id: 'ownership' })
  session.release()
  await cleanProject(root)
  Tests.expect(FileSystem.existsSync(host)).toBe(false)
  Tests.expect(FileSystem.existsSync(Path.join(packageDirectory, 'node_modules/expo'))).toBe(true)
  Tests.expect(FileSystem.existsSync(Path.join(root, '.tao/store/project.json'))).toBe(true)
})
