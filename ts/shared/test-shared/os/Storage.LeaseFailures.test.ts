import { Json } from '@shared'
import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import Exec from '@shared/os/exec'
import * as WebHost from '../../shared-src/os/bridges/Bridge_browser/Bridge_browser'

Tests.test('failed cache-mutation acquisition releases lease ownership and retains its probe for later cleanup', async () => {
  await withFailureFixture(async root => {
    const script = S`
      let failMutation = false;
      const acquire = locks.tryAcquire;
      mock.module(${Json.Print(lockUrl)}, () => ({ ...locks, async tryAcquire(path) {
        if (failMutation && path.endsWith('cache-mutation.lock')) throw new Error('mutation unavailable');
        return acquire(path);
      } }));
      const storage = await import(${Json.Print(storageUrl)});
      const release = await storage.acquireCacheLease('fixture');
      failMutation = true;
      const failure = await Try(release, { catch: error => error.message });
      failMutation = false;
      const leaseDirectory = storage.resolveSupportDirectory('leases');
      const files = await fs.readdir(leaseDirectory);
      const probe = await acquire(${Json.Print(root)} + '/support/leases/' + files[0]);
      const released = probe !== undefined;
      probe?.release();
      const cleaned = await storage.cleanSharedCache();
      process.stdout.write(JSON.stringify({ failure, released, probes: files.length, cleaned }));
    `
    const result = Json.Parse(await runFailureScript(root, script)) as Record<string, unknown>
    Tests.expect(result).toEqual({ failure: 'Something went wrong.', released: true, probes: 1, cleaned: true })
  })
})

Tests.test('blocked lease probes protect the cache without preventing acquisition of an unrelated lease', async () => {
  for (
    const [stage, failure] of [['delete', 'EPERM'], ['delete', 'EBUSY'], ['open', 'EACCES'], ['open', 'EBUSY'], [
      'directory',
      'EACCES',
    ]]
  ) {
    await withFailureFixture(async root => {
      const script = S`
        let blocked = true;
        ${blockedProbeAdapters(stage!, failure!)}
        const storage = await import(${Json.Print(storageUrl)});
        await fs.mkdir(storage.resolveSupportDirectory('leases'), { recursive: true });
        await fs.writeFile(storage.resolveSupportDirectory('leases', 'blocked.lock'), '');
        await fs.mkdir(storage.resolveCacheDirectory(), { recursive: true });
        await fs.writeFile(storage.resolveCacheDirectory('keep'), 'cached data');
        const release = await storage.acquireCacheLease('unrelated');
        await release();
        const reasons = [];
        const protectedCache = !(await storage.cleanSharedCache(reason => reasons.push(reason)));
        const named = reasons.some(reason => reason.includes('leases') && reason.includes(${Json.Print(failure)}));
        const retained = await fs.readFile(storage.resolveCacheDirectory('keep'), 'utf8');
        blocked = false;
        const reclaimed = await storage.cleanSharedCache();
        process.stdout.write(JSON.stringify({ protectedCache, retained, reclaimed, named }));
      `
      Tests.expect(Json.Parse(await runFailureScript(root, script)))
        .toEqual({ protectedCache: true, retained: 'cached data', reclaimed: true, named: true })
    })
  }
})

function blockedProbeAdapters(stage: string, failure: string): string {
  return S`
        const remove = fs.rm;
        const readDirectory = fs.readdir;
        const acquire = locks.tryAcquire;
        mock.module(${Json.Print(lockUrl)}, () => ({ ...locks, async tryAcquire(path) {
          if (blocked && ${
    Json.Print(stage)
  } === 'open' && path.endsWith('blocked.lock')) throw Object.assign(new Error('blocked probe'), { code: ${
    Json.Print(failure)
  } });
          return acquire(path);
        } }));
        mock.module('node:fs/promises', () => ({ ...fs,
          async readdir(path, ...args) {
            if (blocked && ${
    Json.Print(stage)
  } === 'directory' && path.endsWith('leases')) throw Object.assign(new Error('blocked directory'), { code: ${
    Json.Print(failure)
  } });
            return readDirectory(path, ...args);
          }, async rm(path, options) {
          if (blocked && ${
    Json.Print(stage)
  } === 'delete' && path.endsWith('blocked.lock')) throw Object.assign(new Error('blocked probe'), { code: ${
    Json.Print(failure)
  } });
          return remove(path, options);
        } }));
  `
}

async function withFailureFixture(operation: (root: string) => Promise<void>): Promise<void> {
  const root = Artifacts.resolvePath('tmp', `lease-failure-${Platform.randomUUID()}`)
  await Try(() => operation(root), { finally: () => FS.rm(root, { recursive: true, force: true }) })
}

async function runFailureScript(root: string, body: string): Promise<string> {
  const script = S`
    import { mock } from 'bun:test';
    import { Try } from ${Json.Print(new WebHost.URL('../../shared-src/universal/universal.ts', import.meta.url).href)};
    const fs = await import('node:fs/promises');
    const locks = await import(${Json.Print(lockUrl)});
    ${body}
  `
  const environment = {
    TAO_CACHE_DIR: Path.join(root, 'cache'),
    TAO_SUPPORT_DIR: Path.join(root, 'support'),
  }
  const child = Exec.spawn('bun', ['-e', script], { addEnv: environment })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Exec.readText(child.stdout),
    Exec.readText(child.stderr),
  ])
  Tests.expect({ status, stderr }).toEqual({ status: 0, stderr: '' })
  return stdout
}

const lockUrl = new WebHost.URL('../../shared-src/os/locks/FileLock.ts', import.meta.url).href
const storageUrl = new WebHost.URL('../../shared-src/os/Storage.ts', import.meta.url).href
