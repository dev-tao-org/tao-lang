import { joinTextLines, Json, S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import * as WebHost from '../bridges/Bridge_browser/Bridge_browser'

Tests.test('read-only metadata handles concurrent creators without accepting conflicting contents', async () => {
  const root = Artifacts.resolvePath('tmp', `metadata-race-${Platform.randomUUID()}`)
  await Try(async () => {
    await FileSystem.mkdir(root)
    Tests.expect(await raceCreator(Path.join(root, 'same'), 'expected')).toBe('ok')
    Tests.expect(await raceCreator(Path.join(root, 'different'), 'other')).toContain('created concurrently')
    Tests.expect(await FileSystem.readFile(Path.join(root, 'different'), 'utf8')).toBe('other')
    Tests.expect(FileSystem.statSync(Path.join(root, 'same')).mode & 0o222).toBe(0)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('writable files serialize canonical aliases and restore their original mode', async () => {
  const root = Artifacts.resolvePath('tmp', `writable-queue-${Platform.randomUUID()}`)
  await Try(async () => {
    await FileSystem.mkdir(root)
    const canonical = await FileSystem.realpath(root)
    const paths = {
      target: Path.join(canonical, 'target'),
      alias: Path.join(canonical, 'alias'),
      fence: Path.join(canonical, 'fence'),
    }
    await FileSystem.writeFile(paths.target, '', { mode: 0o400 })
    await FileSystem.writeFile(paths.fence, '')
    await FileSystem.symlink(paths.target, paths.alias)
    const originalMode = FileSystem.statSync(paths.target).mode & 0o777
    const script = joinTextLines(createSerializationBoundaryScript(paths), createSerializationProofScript())
    const result = await Platform.run([Platform.argv[0]!, '-e', script], { timeoutMs: 2000 })
    Tests.expect(result.stdout).toBe('1')
    Tests.expect(await FileSystem.readFile(paths.alias, 'utf8')).toBe('second')
    Tests.expect(FileSystem.statSync(paths.target).mode & 0o777).toBe(originalMode)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

type SerializationPaths = { target: string; alias: string; fence: string }

function createSerializationBoundaryScript(paths: SerializationPaths): string {
  return S`
    import { mock } from 'bun:test';
    const fs = await import('node:fs/promises');
    const resolveRealpath = fs.realpath;
    const readStat = fs.stat;
    const paths = ${Json.Print(paths)};
    const lookups = new Map();
    let acknowledgeLookups, acknowledgeFence;
    const lookupsReady = new Promise(resolve => acknowledgeLookups = resolve);
    const fenceEntered = new Promise(resolve => acknowledgeFence = resolve);
    let targetStatEntries = 0;
    mock.module('node:fs/promises', () => ({ ...fs,
      async realpath(path, ...args) {
        const canonical = await resolveRealpath(path, ...args);
        if (path !== paths.alias && path !== paths.fence) return canonical;
        return await new Promise(resolve => {
          lookups.set(path, () => resolve(canonical));
          if (lookups.size === 2) acknowledgeLookups();
        });
      },
      stat(path, ...args) {
        if (path === paths.target) targetStatEntries++;
        if (path === paths.fence) acknowledgeFence();
        return readStat(path, ...args);
      }
    }));
  `
}

function createSerializationProofScript(): string {
  const filesUrl = new WebHost.URL('../Files.ts', import.meta.url).href
  return S`
    const { withWritableFile } = await import(${Json.Print(filesUrl)});
    let acknowledgeFirst, finishFirst;
    const firstReady = new Promise(resolve => acknowledgeFirst = resolve);
    const firstRelease = new Promise(resolve => finishFirst = resolve);
    const first = withWritableFile(paths.target, async file => {
      await file.write('first');
      acknowledgeFirst();
      await firstRelease;
    });
    await firstReady;
    const second = withWritableFile(paths.alias, file => file.write('second'));
    const fence = withWritableFile(paths.fence, async () => {});
    await lookupsReady;
    // Both lookups traverse the same canonicalization chain before the independent stat enters.
    lookups.get(paths.alias)();
    lookups.get(paths.fence)();
    await fenceEntered;
    process.stdout.write(String(targetStatEntries));
    finishFirst();
    await Promise.all([first, second, fence]);
  `
}

async function raceCreator(path: string, winningContent: string): Promise<string> {
  const filesUrl = new WebHost.URL('../Files.ts', import.meta.url).href
  const tryUrl = new WebHost.URL('../../universal/universal.ts', import.meta.url).href
  const script = S`
    import { mock } from 'bun:test';
    import { Try } from ${Json.Print(tryUrl)};
    const fs = await import('node:fs/promises');
    const write = fs.writeFile;
    mock.module('node:fs/promises', () => ({ ...fs,
      async writeFile(path, contents, options) {
        if (options?.flag === 'wx') await write(path, ${Json.Print(winningContent)}, options);
        return write(path, contents, options);
      }
    }));
    const { writeReadOnly } = await import(${Json.Print(filesUrl)});
    const result = await Try(async () => {
      await writeReadOnly(${Json.Print(path)}, 'expected');
      return 'ok';
    }, { catch: error => error.message });
    process.stdout.write(result);
  `
  const child = Platform.spawnPiped(Platform.argv[0]!, { variadicArgs: ['-e', script] })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  Tests.expect({ status, stderr }).toEqual({ status: 0, stderr: '' })
  return stdout
}
