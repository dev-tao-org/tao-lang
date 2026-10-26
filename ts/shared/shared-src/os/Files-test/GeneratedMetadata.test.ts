import { S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'

Tests.test('read-only metadata handles concurrent creators without accepting conflicting contents', async () => {
  const root = Artifacts.resolvePath('tmp', `metadata-race-${Platform.randomUUID()}`)
  await Try(async () => {
    await FileSystem.mkdir(root, { recursive: true })
    Tests.expect(await raceCreator(Path.join(root, 'same'), 'expected')).toBe('ok')
    Tests.expect(await raceCreator(Path.join(root, 'different'), 'other')).toContain('created concurrently')
    Tests.expect(await FileSystem.readFile(Path.join(root, 'different'), 'utf8')).toBe('other')
    Tests.expect(FileSystem.statSync(Path.join(root, 'same')).mode & 0o222).toBe(0)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

async function raceCreator(path: string, winningContent: string): Promise<string> {
  const filesUrl = new URL('../Files.ts', import.meta.url).href
  const tryUrl = new URL('../../universal/universal.ts', import.meta.url).href
  const script = S`
    import { mock } from 'bun:test';
    import { Try } from ${JSON.stringify(tryUrl)};
    const fs = await import('node:fs/promises');
    const write = fs.writeFile;
    mock.module('node:fs/promises', () => ({ ...fs,
      async writeFile(path, contents, options) {
        if (options?.flag === 'wx') await write(path, ${JSON.stringify(winningContent)}, options);
        return write(path, contents, options);
      }
    }));
    const { writeReadOnly } = await import(${JSON.stringify(filesUrl)});
    const result = await Try(async () => {
      await writeReadOnly(${JSON.stringify(path)}, 'expected');
      return 'ok';
    }, { catch: error => error.message });
    process.stdout.write(result);
  `
  const child = Platform.spawn(Platform.argv[0]!, { variadicArgs: ['-e', script], stdout: 'pipe', stderr: 'pipe' })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  Tests.expect({ status, stderr }).toEqual({ status: 0, stderr: '' })
  return stdout
}
