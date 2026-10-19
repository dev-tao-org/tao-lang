import { Try } from '@shared'
import { Tests } from '@shared/os'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as Platform from '../Platform'

Tests.test('bootstrap imports independently and forwards setup output and flags', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tao-bootstrap-'))
  await Try(async () => {
    const result = await runBootstrap(root, 0)
    Tests.expect(result.status).toBe(0)
    Tests.expect(result.stdout).toContain('install-output')
    Tests.expect(result.stderr).toContain('install-error')
    Tests.expect(await readFile(join(root, 'calls'), 'utf8')).toBe(
      'install --no-save --verbose\nrun ./CLIs/CLIs-src/dev-cli/commands/_setup-complete.ts\n',
    )
    Tests.expect(await readFile(join(root, '.artifacts/logs/setup/bootstrap.log'), 'utf8')).toContain('[stdout]')
  }, {
    async finally() {
      await rm(root, { recursive: true, force: true })
    },
  })
})

async function runBootstrap(
  root: string,
  failureStatus: number,
): Promise<{ status: number; stdout: string; stderr: string }> {
  const ts = join(root, 'ts')
  const bin = join(root, 'bin')
  await mkdir(ts, { recursive: true })
  await mkdir(bin, { recursive: true })
  await copyFile(new URL('../Bootstrap.ts', import.meta.url), join(ts, 'Bootstrap.ts'))
  await writeStub(bin, failureStatus)
  const script = `process.argv=['bun','_setup.ts','--agent','--no-save','--verbose'];`
    + `const bootstrap=await import(${JSON.stringify(pathToFileURL(join(ts, 'Bootstrap.ts')).href)});`
    + `bootstrap.installWorkspace();`
  const child = Platform.spawn(process.execPath, {
    variadicArgs: ['-e', script],
    cwd: ts,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      TAO_BOOTSTRAP_CALLS: join(root, 'calls'),
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  return { status, stdout, stderr }
}

async function writeStub(bin: string, failureStatus: number): Promise<void> {
  const script =
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "$TAO_BOOTSTRAP_CALLS"\necho install-output\necho install-error >&2\nexit ${failureStatus}\n`
  const path = join(bin, 'bun')
  await writeFile(path, script)
  await chmod(path, 0o755)
}
