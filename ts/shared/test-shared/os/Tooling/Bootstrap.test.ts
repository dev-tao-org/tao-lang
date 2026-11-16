import { Json } from '@shared'
import { S, Try } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, Env, FS, Path, Platform } from '@shared/os'
import Exec from '@shared/os/exec'
import * as WebHost from '../../../shared-src/os/bridges/Bridge_browser/Bridge_browser'
import * as Process from '../../../shared-src/os/Process'

const { chmod, copyFile, mkdirs, mkdtemp, readFile, rm, writeFile } = FS
const { delimiter, join } = Path

type FailureStage = 'install' | 'run'

Tests.test('bootstrap imports independently and installs frozen dependencies without caller flags', async () => {
  const root = await mkdtemp(join(Platform.temporaryDirectory(), 'tao-bootstrap-'))
  await Try(async () => {
    const sourceDirectory = Path.pathToFileURL(join(root, 'source checkout #%') + Path.sep)
    await copyBootstrapSources(
      new WebHost.URL('../../../shared-src/os/', import.meta.url),
      Path.fileURLToPath(sourceDirectory),
    )
    const result = await runBootstrap(root, 0, 'install', sourceDirectory)
    Tests.expect(result.status).toBe(0)
    Tests.expect(result.stdout).toContain('install-output')
    Tests.expect(result.stderr).toContain('install-error')
    Tests.expect(result.stderr).toContain('Installing workspace dependencies…')
    Tests.expect(await readFile(join(root, 'calls'), 'utf8')).toBe(
      'install --frozen-lockfile\nrun ./CLIs/CLIs-src/dev-cli/commands/_setup-complete.ts\n',
    )
    Tests.expect(await readFile(join(root, '.artifacts/logs/setup/bootstrap.log'), 'utf8')).toContain('[stdout]')
  }, {
    async finally() {
      await rm(root, { recursive: true, force: true })
    },
  })
})

Tests.test('bootstrap propagates install and completion failure statuses with retained diagnostics', async () => {
  for (const stage of ['install', 'run'] as const) {
    const root = Artifacts.resolvePath('tmp', `bootstrap-failure-${Platform.randomUUID()}`)
    await Try(async () => {
      const result = await runBootstrap(root, 7, stage)
      Tests.expect(result.status).toBe(7)
      Tests.expect(result.stderr).toContain(
        stage === 'install' ? 'Workspace installation failed' : 'Workspace setup completion failed',
      )
      const calls = await readFile(join(root, 'calls'), 'utf8')
      Tests.expect(calls.includes('run ./CLIs/CLIs-src/dev-cli/commands/_setup-complete.ts')).toBe(stage === 'run')
      const log = await readFile(join(root, '.artifacts/logs/setup/bootstrap.log'), 'utf8')
      Tests.expect(log).toContain('install-output')
      Tests.expect(log).toContain('install-error')
    }, { finally: () => rm(root, { recursive: true, force: true }) })
  }
})

Tests.test('bootstrap rejects caller flags before installing or changing dependencies', async () => {
  const root = Artifacts.resolvePath('tmp', `bootstrap-arguments-${Platform.randomUUID()}`)
  await Try(async () => {
    const result = await runBootstrap(root, 0, 'install', undefined, ['--no-frozen-lockfile'])
    Tests.expect(result.status).toBe(1)
    Tests.expect(result.stderr).toContain('Setup takes no arguments')
    Tests.expect(FS.existsSync(join(root, 'calls'))).toBe(false)
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})

type BootstrapResult = { status: number; stdout: string; stderr: string }
async function runBootstrap(
  root: string,
  failureStatus: number,
  failureStage: FailureStage = 'install',
  sourceDirectory = new WebHost.URL('../../../shared-src/os/', import.meta.url),
  setupArgs: readonly string[] = [],
): Promise<BootstrapResult> {
  const ts = join(root, 'ts')
  const bin = join(root, 'bin')
  await mkdirs(ts, bin)
  await copyBootstrapSources(sourceDirectory, ts)
  await writeStub(bin, failureStatus, failureStage)
  const script = `process.argv=['bun','_setup.ts','--agent'];`
    + `const bootstrap=await import(${Json.Print(Path.pathToFileURL(join(ts, 'Tooling/Bootstrap.ts')).href)});`
    + `await bootstrap.installWorkspace('./CLIs/CLIs-src/dev-cli/commands/_setup-complete.ts', ${
      Json.Print(setupArgs)
    });`
  const environment = {
    PATH: `${bin}${delimiter}${Env.get('PATH') ?? ''}`,
    TAO_BOOTSTRAP_CALLS: join(root, 'calls'),
  }
  // Keep the running interpreter distinct from the fake installer selected by the child PATH.
  const child = Exec.spawn(Process.argv[0], ['-e', script], { cwd: ts, addEnv: environment })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Exec.readText(child.stdout),
    Exec.readText(child.stderr),
  ])
  return { status, stdout, stderr }
}

async function copyBootstrapSources(sourceDirectory: WebHost.URL, target: string): Promise<void> {
  await FS.mkdirs(target, join(target, 'Tooling'), join(target, 'Process'))
  const universal = join(target, '../universal')
  await FS.mkdir(universal)
  await copyFile(
    new WebHost.URL('../../../shared-src/universal/Characters.ts', import.meta.url),
    join(universal, 'Characters.ts'),
  )
  await copyFile(new WebHost.URL('Tooling/Bootstrap.ts', sourceDirectory), join(target, 'Tooling/Bootstrap.ts'))
  await FS.cp(new WebHost.URL('Tooling/Bootstrap', sourceDirectory), join(target, 'Tooling/Bootstrap'), {
    recursive: true,
  })
  await copyFile(
    new WebHost.URL('Process/Process-Current.ts', sourceDirectory),
    join(target, 'Process/Process-Current.ts'),
  )
  await FS.cp(new WebHost.URL('bridges/Bridge_node', sourceDirectory), join(target, 'bridges/Bridge_node'), {
    recursive: true,
  })
}

async function writeStub(bin: string, failureStatus: number, failureStage: FailureStage): Promise<void> {
  const script = Shared.joinTextLines(
    S`
      #!/bin/sh
      printf '%s\\n' "$*" >> "$TAO_BOOTSTRAP_CALLS"
      echo install-output
      echo install-error >&2
      if [ "$1" = '${failureStage}' ]; then exit ${failureStatus}; fi
      exit 0
    `,
    '',
  )
  const path = join(bin, 'bun')
  await writeFile(path, script)
  await chmod(path, 0o755)
}
