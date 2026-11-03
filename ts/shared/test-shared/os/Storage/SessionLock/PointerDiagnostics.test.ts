import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import * as WebHost from '../../../../shared-src/os/bridges/Bridge_browser/Bridge_browser'
import * as Process from '../../../../shared-src/os/Process'
import * as Processes from '../../../../shared-src/os/Processes'

Tests.test('production session acquisition gives setup guidance for malformed and outdated pointers', async () => {
  const root = Artifacts.resolvePath('tmp', `lock-pointer-errors-${Platform.randomUUID()}`)
  await Try(async () => {
    await FS.mkdir(root)
    const artifactsUrl = new WebHost.URL('../../../../shared-src/os/Storage/Artifacts.ts', import.meta.url).href
    const lockUrl = new WebHost.URL('../../../../shared-src/os/Storage/SessionLock.ts', import.meta.url).href
    const script = S`
      import { mock } from 'bun:test';
      import { Try } from ${
      JSON.stringify(new WebHost.URL('../../../../shared-src/universal/universal.ts', import.meta.url).href)
    };
      const fs = await import('node:fs/promises');
      const artifacts = await import(${JSON.stringify(artifactsUrl)});
      const resolvePath = artifacts.resolvePath;
      mock.module(${JSON.stringify(artifactsUrl)}, () => ({ ...artifacts,
        resolvePath: (...parts) => parts[0] === 'cache/native-locks' ? ${JSON.stringify(root)} : resolvePath(...parts)
      }));
      const locks = await import(${JSON.stringify(lockUrl)});
      const failures = [];
      for (const contents of ['{', '{}', JSON.stringify({identity:'a'.repeat(64)}), JSON.stringify({identity:'a'.repeat(64),directory:'../outside'})]) {
        await fs.writeFile(${JSON.stringify(Path.join(root, 'current.json'))}, contents);
        await Try(() => locks.acquire(${JSON.stringify(Path.join(root, 'session.lock'))}), {
          catch: error => failures.push({name:error.name,message:error.message})
        });
      }
      process.stdout.write(JSON.stringify(failures));
    `
    const child = Processes.spawnPiped(Process.argv[0]!, { variadicArgs: ['-e', script] })
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      Processes.readText(child.stdout),
      Processes.readText(child.stderr),
    ])
    Tests.expect({ status, stderr }).toEqual({ status: 0, stderr: '' })
    const failures = JSON.parse(stdout) as Array<{ name: string; message: string }>
    Tests.expect(failures).toHaveLength(4)
    Tests.expect(
      failures.every(error => error.name === 'HostEnvironmentError' && error.message.includes('./agent setup')),
    ).toBe(true)
    Tests.expect(await FS.exists(Path.join(root, 'session.lock'))).toBe(false)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})
