import { Errors, Try } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path } from '@shared/os'
import { withConsumerProject } from '../workspace-src/ConsumerProject'
import { cleanProject } from '../workspace-src/projects/Clean'
import { acquireSession } from '../workspace-src/projects/Sessions'
import { createStandaloneLibraryFixture } from './Workspace.test-utils'

Tests.test('consumer sessions publish independent libraries and resolve their own output', async () => {
  const root = await createStandaloneLibraryFixture()
  const packageDirectory = Path.join(root, 'src/ts')
  const entry = Path.join(root, 'src/tao/Library.tao')
  await Try(async () => {
    await withConsumerProject(packageDirectory, 'first', async firstHost => {
      const firstOutput = Path.join(firstHost, '../libraries/Demo')
      const module = 'ts/packages/src/tao/Library.views.tsx'
      const accepted = await FS.readFile(Path.join(firstOutput, module), 'utf8')
      const source = await FS.readFile(entry, 'utf8')
      await FS.writeFile(entry, source.replace('Nested private Tao helper', 'Second session helper'))
      await withConsumerProject(packageDirectory, 'second', async secondHost => {
        const secondOutput = Path.join(secondHost, '../libraries/Demo')
        Tests.expect(await FS.readFile(Path.join(secondOutput, module), 'utf8')).toContain('Second session helper')
        Tests.expect(await FS.readFile(Path.join(firstOutput, module), 'utf8')).toBe(accepted)
        Tests.expect(await FS.readFile(Path.join(firstHost, 'tao-consumer.json'), 'utf8')).toContain(
          '/first/libraries/Demo',
        )
        Tests.expect(await FS.readFile(Path.join(secondHost, 'tao-consumer.json'), 'utf8')).toContain(
          '/second/libraries/Demo',
        )
      })
    })
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('managed consumer host borrows authored dependencies and protects active state until failure releases its session', async () => {
  const root = await createStandaloneLibraryFixture()
  const packageDirectory = Path.join(root, 'src/ts')
  const host = Path.join(root, '.tao/cache/sessions/ownership/expo')
  await Tests.expect(withConsumerProject(packageDirectory, 'ownership', async directory => {
    Tests.expect(directory).toBe(host)
    Tests.expect(FS.realpathSync(Path.join(host, 'node_modules'))).toBe(
      FS.realpathSync(Path.join(packageDirectory, 'node_modules')),
    )
    Tests.expect(FS.existsSync(Path.join(host, 'Application.ts'))).toBe(true)
    Tests.expect(FS.existsSync(Path.join(host, 'metro.config.js'))).toBe(true)
    Tests.expect(FS.existsSync(Path.join(root, 'package.json'))).toBe(false)
    const protectedState = await cleanProject(root)
    Tests.expect(protectedState.skippedActive).toEqual(['ownership'])
    Tests.expect(protectedState.sharedProtected).toBe(true)
    Errors.ThrowUserInput('Recorded host process failure')
  })).rejects.toThrow('Recorded host process failure')
  const session = await acquireSession(root, { id: 'ownership' })
  session.release()
  await cleanProject(root)
  Tests.expect(FS.existsSync(host)).toBe(false)
  Tests.expect(FS.existsSync(Path.join(packageDirectory, 'node_modules/expo'))).toBe(true)
  Tests.expect(FS.existsSync(Path.join(root, '.tao/store/project.json'))).toBe(true)
})
