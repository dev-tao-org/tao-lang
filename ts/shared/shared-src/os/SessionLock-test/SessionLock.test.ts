import { Try } from '@shared'
import { Tests } from '@shared/os'
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Artifacts from '../Artifacts'
import * as Platform from '../Platform'
import { acquire } from '../SessionLock'

Tests.test('session locks exclude another handle and retain their lock file after release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tao-session-lock-'))
  const path = join(root, 'session.lock')
  await Try(async () => {
    const first = await acquire(path)
    Tests.expect(first !== undefined).toBe(true)
    Tests.expect(await acquire(path)).toBe(undefined)
    first?.release()
    Tests.expect((await stat(path)).isFile()).toBe(true)
    const next = await acquire(path)
    Tests.expect(next !== undefined).toBe(true)
    next?.dispose()
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})

Tests.test('session locks support Unicode paths and report open failures separately from contention', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tao-session-lock-unicode-'))
  const directory = join(root, 'Tao 雪 ☃')
  const path = join(directory, 'session.lock')
  await Try(async () => {
    await mkdir(directory)
    const lock = await acquire(path)
    Tests.expect(lock !== undefined).toBe(true)
    Tests.expect(await acquire(path)).toBe(undefined)
    lock?.release()
    await Tests.rejects(acquire(join(root, 'missing', 'session.lock')), /OS error/)
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})

Tests.test('session locks are released by the kernel when their owning process exits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tao-session-lock-child-'))
  const path = join(root, 'session.lock')
  const output = Artifacts.resolvePath('cache/native-locks')
  const pointer = JSON.parse(await readFile(join(output, 'current.json'), 'utf8')) as { identity: string }
  const addon = join(output, pointer.identity, 'build/Release/tao_os_locks.node')
  await Try(async () => {
    const script = `const lock = require(${
      JSON.stringify(addon)
    }).acquire(process.argv[1]); if (!lock) process.exit(3); process.stdout.write('locked'); process.exit(0)`
    const child = Platform.spawn(process.execPath, {
      variadicArgs: ['-e', script, path],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [status, stdout] = await Promise.all([child.exited, Platform.readText(child.stdout)])
    Tests.expect(status).toBe(0)
    Tests.expect(stdout).toBe('locked')
    const reclaimed = await acquire(path)
    Tests.expect(reclaimed !== undefined).toBe(true)
    reclaimed?.release()
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})
