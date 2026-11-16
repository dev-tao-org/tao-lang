import { Json } from '@shared'
import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import Exec from '@shared/os/exec'
import * as WebHost from '../../shared-src/os/bridges/Bridge_browser/Bridge_browser'
import * as Process from '../../shared-src/os/Process'

Tests.test('production session acquisition gives setup guidance for malformed and outdated pointers', async () => {
  const root = Artifacts.resolvePath('tmp', `lock-pointer-errors-${Platform.randomUUID()}`)
  await Try(async () => {
    await FS.mkdir(root)
    const artifactsUrl = new WebHost.URL('../../shared-src/os/Storage/Artifacts.ts', import.meta.url).href
    const lockUrl = new WebHost.URL('../../shared-src/os/locks/FileLock.ts', import.meta.url).href
    const script = S`
      import { mock } from 'bun:test';
      import { Try } from ${
      Json.Print(new WebHost.URL('../../shared-src/universal/universal.ts', import.meta.url).href)
    };
      const fs = await import('node:fs/promises');
      const artifacts = await import(${Json.Print(artifactsUrl)});
      const resolvePath = artifacts.resolvePath;
      mock.module(${Json.Print(artifactsUrl)}, () => ({ ...artifacts,
        resolvePath: (...parts) => parts[0] === 'cache/native-locks' ? ${Json.Print(root)} : resolvePath(...parts)
      }));
      const locks = await import(${Json.Print(lockUrl)});
      const failures = [];
      for (const contents of ['{', '{}', JSON.stringify({identity:'a'.repeat(64)}), JSON.stringify({identity:'a'.repeat(64),directory:'../outside'})]) {
        await fs.writeFile(${Json.Print(Path.join(root, 'current.json'))}, contents);
        await Try(() => locks.tryAcquire(${Json.Print(Path.join(root, 'session.lock'))}), {
          catch: error => failures.push({name:error.name,message:error.message})
        });
      }
      process.stdout.write(JSON.stringify(failures));
    `
    const child = Exec.spawn(Process.argv[0]!, ['-e', script])
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      Exec.readText(child.stdout),
      Exec.readText(child.stderr),
    ])
    Tests.expect({ status, stderr }).toEqual({ status: 0, stderr: '' })
    const failures = Json.Parse(stdout) as Array<{ name: string; message: string }>
    Tests.expect(failures).toHaveLength(4)
    Tests.expect(
      failures.every(error =>
        error.name === 'HostEnvironmentError' && error.message.includes('./agent unsandboxed setup')
      ),
    ).toBe(true)
    Tests.expect(await FS.exists(Path.join(root, 'session.lock'))).toBe(false)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})
