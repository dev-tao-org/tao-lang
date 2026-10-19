import { Try } from '@shared'
import { Tests } from '@shared/os'
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
    }); const release = await storage.acquireCacheLease('fixture'); const first = await storage.cleanSharedCache(); release(); const second = await storage.cleanSharedCache(); process.stdout.write(JSON.stringify([first, second]));`
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
    Tests.expect((await readdir(join(support, 'leases'))).length).toBe(1)
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})

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
