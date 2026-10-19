import { S, Try } from '@shared'
import { Artifacts, Tests } from '@shared/os'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Platform from '../Platform'
import { resolveStorage } from '../Storage'

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
  const root = await mkdtemp(join(tmpdir(), 'tao-storage-'))
  const cache = join(root, 'cache')
  const support = join(root, 'support')
  const outside = join(root, 'outside')
  await Try(async () => {
    await mkdir(cache)
    await mkdir(outside)
    await writeFile(join(cache, 'entry'), 'cache data')
    await writeFile(join(outside, 'keep'), 'durable data')
    await symlink(outside, join(cache, 'external-link'))
    const moduleUrl = new URL('../Storage.ts', import.meta.url).href
    const script = `const storage = await import(${
      JSON.stringify(moduleUrl)
    }); const release = await storage.acquireCacheLease('fixture'); const first = await storage.cleanSharedCache(); await Promise.all([release(), release()]); const second = await storage.cleanSharedCache(); process.stdout.write(JSON.stringify([first, second]));`
    const child = Platform.spawn(process.execPath, {
      variadicArgs: ['-e', script],
      env: { ...process.env, TAO_CACHE_DIR: cache, TAO_SUPPORT_DIR: support },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      Platform.readText(child.stdout),
      Platform.readText(child.stderr),
    ])
    Tests.expect({ status, stderr }).toEqual({ status: 0, stderr: '' })
    Tests.expect(JSON.parse(stdout)).toEqual([false, true])
    Tests.expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('durable data')
    Tests.expect(await readdir(cache)).toEqual([])
    Tests.expect(await readdir(join(support, 'leases'))).toEqual([])
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})

Tests.test('cache leases reclaim crashed probes while protecting a live consumer in another process', async () => {
  const root = Artifacts.resolvePath('tmp', `lease-recovery-${Platform.randomUUID()}`)
  await Try(async () => {
    await mkdir(root, { recursive: true })
    await runStorageScript(root, `await storage.acquireCacheLease('crashed');`)
    Tests.expect((await readdir(join(root, 'support/leases'))).length).toBe(1)
    const moduleUrl = new URL('../Storage.ts', import.meta.url).href
    const childScript = S`
      const storage = await import(${JSON.stringify(moduleUrl)});
      process.stdout.write(JSON.stringify(await storage.cleanSharedCache()));
    `
    const probe = S`
      const release = await storage.acquireCacheLease('live');
      const child = Bun.spawn([process.execPath, '-e', ${
      JSON.stringify(childScript)
    }], { stdout: 'pipe', stderr: 'pipe' });
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

Tests.test('direct test invocations isolate Tao storage without a test-plan worker', async () => {
  const root = Artifacts.resolvePath('tmp', `direct-test-storage-${Platform.randomUUID()}`)
  await Try(async () => {
    await mkdir(root, { recursive: true })
    const path = join(root, 'StorageIsolation.test.ts')
    const testsUrl = new URL('../Tests.ts', import.meta.url).href
    const storageUrl = new URL('../Storage.ts', import.meta.url).href
    const result = join(root, 'roots.json')
    await writeFile(
      path,
      S`
        import * as Tests from ${JSON.stringify(testsUrl)};
        import * as Storage from ${JSON.stringify(storageUrl)};
        import { writeFile } from 'node:fs/promises';
        Tests.test('isolated roots', () => writeFile(${
        JSON.stringify(result)
      }, JSON.stringify([Storage.cacheDirectory(), Storage.supportDirectory()])));
      `,
    )
    const env = { ...process.env }
    delete env.TAO_CACHE_DIR
    delete env.TAO_SUPPORT_DIR
    const child = Platform.spawn(process.execPath, {
      variadicArgs: ['test', path],
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [status, , stderr] = await Promise.all([
      child.exited,
      Platform.readText(child.stdout),
      Platform.readText(child.stderr),
    ])
    Tests.expect({ status, failed: stderr.includes('(fail)') }).toEqual({ status: 0, failed: false })
    const roots = JSON.parse(await readFile(result, 'utf8')) as string[]
    Tests.expect(roots.length).toBe(2)
    Tests.expect(roots.every(path => path.startsWith(Artifacts.resolvePath('tmp/test-storage')))).toBe(true)
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})

async function runStorageScript(root: string, source: string): Promise<string> {
  const moduleUrl = new URL('../Storage.ts', import.meta.url).href
  const child = Platform.spawn(process.execPath, {
    variadicArgs: ['-e', `const storage = await import(${JSON.stringify(moduleUrl)}); ${source}`],
    env: { ...process.env, TAO_CACHE_DIR: join(root, 'cache'), TAO_SUPPORT_DIR: join(root, 'support') },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
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
