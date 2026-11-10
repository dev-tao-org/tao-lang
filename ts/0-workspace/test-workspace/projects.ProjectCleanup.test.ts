import { Errors, S, Try } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { withDependencySession } from '../workspace-src/ModuleDependencies'
import { prepareProject } from '../workspace-src/ProjectPreparation'
import { cleanProject } from '../workspace-src/projects/Clean'
import { initializeProject } from '../workspace-src/projects/Projects'

const ControlledInstallerFailureRegx = /controlled installer failure/
const EntrySource = Shared.joinTextLines(
  S`
    view Root { render Text("ok") }
    app Main { root Root }
  `,
  '',
)

Tests.test('project clean reports malformed module ownership while cleaning safe cache and retaining authored files', async () => {
  const root = Artifacts.resolvePath('tmp', `project-clean-marker-${Platform.randomUUID()}`)
  await Try(async () => {
    await initializeProject(root)
    const module = Path.join(root, '@widgets')
    const marker = Path.join(module, '.tao-managed-module.json')
    const generated = Path.join(root, '.tao/cache/generated')
    await FS.mkdirs(module, generated)
    await FS.writeFile(Path.join(generated, 'temporary'), 'disposable')
    await FS.writeFile(marker, '{')
    await FS.writeFile(Path.join(module, 'package.json'), 'authored package contents')
    const result = await cleanProject(root)
    Tests.expect(result.warnings.some(warning => warning.includes(marker) && warning.includes('repair'))).toBe(true)
    Tests.expect(result.sharedProtected).toBe(false)
    Tests.expect(await FS.exists(generated)).toBe(false)
    Tests.expect(await FS.readFile(marker, 'utf8')).toBe('{')
    Tests.expect(await FS.readFile(Path.join(module, 'package.json'), 'utf8')).toBe('authored package contents')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('project clean protects runtime cache while automatic setup is active and releases after failure', async () => {
  const root = Artifacts.resolvePath('tmp', `project-clean-preparation-${Platform.randomUUID()}`)
  const entry = Path.join(root, 'Main.tao')
  let acknowledgeInstallStarted!: () => void
  let releaseInstall!: () => void
  const installStarted = new Promise<void>(resolve => {
    acknowledgeInstallStarted = resolve
  })
  const installGate = new Promise<void>(resolve => {
    releaseInstall = resolve
  })
  await Try(async () => {
    await initializeProject(root)
    await FS.writeFile(entry, EntrySource)
    const prepare = () =>
      prepareProject(entry, {
        runtimeInstaller: {
          async install() {
            acknowledgeInstallStarted()
            await installGate
            Errors.ThrowHostEnvironment('controlled installer failure')
          },
        },
      })
    const preparing = Tests.rejects(prepare(), ControlledInstallerFailureRegx)
    await installStarted
    const protectedClean = await cleanProject(root)
    Tests.expect(protectedClean.sharedProtected).toBe(true)
    releaseInstall()
    await preparing
    const cleaned = await cleanProject(root)
    Tests.expect(cleaned.sharedProtected).toBe(false)
    Tests.expect(cleaned.removed).toContain('runtime-toolchains')
    await Tests.rejects(withDependencySession(root, 'setup', prepare), ControlledInstallerFailureRegx)
  }, {
    async finally() {
      releaseInstall()
      await FS.rm(root, { recursive: true, force: true })
    },
  })
})
