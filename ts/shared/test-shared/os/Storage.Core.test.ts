import { Json } from '@shared'
import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import Exec from '@shared/os/exec'
import * as WebHost from '../../shared-src/os/bridges/Bridge_browser/Bridge_browser'
import * as Process from '../../shared-src/os/Process'

import { resolveStorage } from '../../shared-src/os/Storage'

const { join } = Path
const { mkdir, mkdirs, mkdtemp, readdir, readFile, rm, symlink, writeFile } = FS

Tests.test('resolveStorage uses native Tao cache and support locations per platform', () => {
  Tests.expect(resolveStorage('macos', '/Users/ro', {})).toEqual({
    cache: '/Users/ro/Library/Caches/Tao',
    support: '/Users/ro/Library/Application Support/Tao',
  })
  Tests.expect(resolveStorage('linux', '/home/ro', {})).toEqual({
    cache: '/home/ro/.cache/Tao',
    support: '/home/ro/.local/share/Tao',
  })
  Tests.expect(resolveStorage('windows', 'C:\\Users\\ro', { LOCALAPPDATA: 'C:\\Users\\ro\\AppData\\Local' })).toEqual({
    cache: 'C:\\Users\\ro\\AppData\\Local\\Tao\\Cache',
    support: 'C:\\Users\\ro\\AppData\\Local\\Tao\\Support',
  })
})

Tests.test('cleanSharedCache waits for local leases and removes only cache contents afterward', async () => {
  const root = await mkdtemp(join(Platform.temporaryDirectory(), 'tao-storage-'))
  const cache = join(root, 'cache')
  const support = join(root, 'support')
  const outside = join(root, 'outside')
  await Try(async () => {
    await mkdirs(cache, outside)
    await writeFile(join(cache, 'entry'), 'cache data')
    await writeFile(join(outside, 'keep'), 'durable data')
    await symlink(outside, join(cache, 'external-link'))
    const moduleUrl = new WebHost.URL('../../shared-src/os/Storage.ts', import.meta.url).href
    const script = `const storage = await import(${
      Json.Print(moduleUrl)
    }); const release = await storage.acquireCacheLease('fixture'); const first = await storage.cleanSharedCache(); await Promise.all([release(), release()]); const second = await storage.cleanSharedCache(); process.stdout.write(JSON.stringify([first, second]));`
    const environment = { TAO_CACHE_DIR: cache, TAO_SUPPORT_DIR: support }
    const child = Exec.spawn(Process.execPath, ['-e', script], { addEnv: environment })
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      Exec.readText(child.stdout),
      Exec.readText(child.stderr),
    ])
    Tests.expect({ status, stderr }).toEqual({ status: 0, stderr: '' })
    Tests.expect(Json.Parse(stdout)).toEqual([false, true])
    Tests.expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('durable data')
    Tests.expect(await readdir(cache)).toEqual([])
    Tests.expect(await readdir(join(support, 'leases'))).toEqual([])
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})

Tests.test('cache leases reclaim crashed probes while protecting a live consumer in another process', async () => {
  const root = Artifacts.resolvePath('tmp', `lease-recovery-${Platform.randomUUID()}`)
  await Try(async () => {
    await mkdir(root)
    await runStorageScript(root, `await storage.acquireCacheLease('crashed');`)
    Tests.expect((await readdir(join(root, 'support/leases'))).length).toBe(1)
    const moduleUrl = new WebHost.URL('../../shared-src/os/Storage.ts', import.meta.url).href
    const childScript = S`
      const storage = await import(${Json.Print(moduleUrl)});
      process.stdout.write(JSON.stringify(await storage.cleanSharedCache()));
    `
    const probe = S`
      const release = await storage.acquireCacheLease('live');
      const child = Bun.spawn([process.execPath, '-e', ${Json.Print(childScript)}], { stdout: 'pipe', stderr: 'pipe' });
      const status = await child.exited;
      const clean = await new Response(child.stdout).text();
      await release();
      process.stdout.write(JSON.stringify({ status, clean }));
    `
    Tests.expect(await runStorageScript(root, probe)).toBe('{"status":0,"clean":"false"}')
    Tests.expect(await readdir(join(root, 'support/leases'))).toEqual([])
    Tests.expect(
      await runStorageScript(root, `const release = await storage.acquireCacheLease('live'); await release();`),
    ).toBe('')
    Tests.expect(await readdir(join(root, 'support/leases'))).toEqual([])
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})

Tests.test('direct test invocations scope Tao storage without changing the real process environment', async () => {
  const root = Artifacts.resolvePath('tmp', `direct-test-storage-${Platform.randomUUID()}`)
  await Try(async () => {
    await mkdir(root)
    const path = join(root, 'StorageIsolation.test.ts')
    const testsUrl = new WebHost.URL('../Shared.test-utils.ts', import.meta.url).href
    const storageUrl = new WebHost.URL('../../shared-src/os/Storage.ts', import.meta.url).href
    const result = join(root, 'roots.json')
    await writeFile(
      path,
      S`
        import * as Tests from ${Json.Print(testsUrl)};
        import * as Storage from ${Json.Print(storageUrl)};
        import { writeFile } from 'node:fs/promises';
        Tests.test('isolated roots', () => {
          Tests.expect(process.env.TAO_CACHE_DIR).toBeUndefined();
          Tests.expect(process.env.TAO_SUPPORT_DIR).toBeUndefined();
          return writeFile(${
        Json.Print(result)
      }, JSON.stringify([Storage.resolveCacheDirectory(), Storage.resolveSupportDirectory()]));
        });
      `,
    )
    const child = Exec.spawn('bun', ['test', path], {
      addEnv: { TAO_CACHE_DIR: undefined, TAO_SUPPORT_DIR: undefined },
    })
    const [status, , stderr] = await Promise.all([
      child.exited,
      Exec.readText(child.stdout),
      Exec.readText(child.stderr),
    ])
    Tests.expect({ status, failed: stderr.includes('(fail)') }).toEqual({ status: 0, failed: false })
    const roots = Json.Parse(await readFile(result, 'utf8')) as string[]
    Tests.expect(roots.length).toBe(2)
    Tests.expect(roots.every(path => Path.isWithin(Artifacts.resolvePath('tmp/test-storage'), path))).toBe(true)
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})

async function runStorageScript(root: string, source: string): Promise<string> {
  const moduleUrl = new WebHost.URL('../../shared-src/os/Storage.ts', import.meta.url).href
  const environment = { TAO_CACHE_DIR: join(root, 'cache'), TAO_SUPPORT_DIR: join(root, 'support') }
  const child = Exec.spawn(Process.execPath, [
    '-e',
    `const storage = await import(${Json.Print(moduleUrl)}); ${source}`,
  ], { addEnv: environment })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Exec.readText(child.stdout),
    Exec.readText(child.stderr),
  ])
  Tests.expect({ status, stderr }).toEqual({ status: 0, stderr: '' })
  return stdout
}

Tests.test('resolveStorage honors XDG roots and explicit sandbox overrides', () => {
  Tests.expect(resolveStorage('linux', '/home/ro', {
    XDG_CACHE_HOME: '/sandbox/cache',
    XDG_DATA_HOME: '/sandbox/data',
  })).toEqual({ cache: '/sandbox/cache/Tao', support: '/sandbox/data/Tao' })
  Tests.expect(resolveStorage('linux', '/home/ro', {
    XDG_CACHE_HOME: '/sandbox/cache',
    XDG_DATA_HOME: '/sandbox/data',
    TAO_CACHE_DIR: '/app/cache',
    TAO_SUPPORT_DIR: '/app/support',
  })).toEqual({ cache: '/app/cache', support: '/app/support' })
})
