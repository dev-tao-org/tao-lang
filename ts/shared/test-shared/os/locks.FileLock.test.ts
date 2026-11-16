import { Json } from '@shared'
import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import Exec from '@shared/os/exec'
import * as Process from '../../shared-src/os/Process'

const { join } = Path
const { mkdir, mkdtemp, readFile, rm, stat } = FS
import { tryAcquire } from '../../shared-src/os/locks/FileLock'

const OperatingSystemErrorRegx = /OS error/

Tests.test('file locks exclude another handle and retain their lock file after release', async () => {
  const root = await mkdtemp(join(Platform.temporaryDirectory(), 'tao-file-lock-'))
  const path = join(root, 'session.lock')
  await Try(async () => {
    const first = await tryAcquire(path)
    Tests.expect(first !== undefined).toBe(true)
    Tests.expect(await tryAcquire(path)).toBe(undefined)
    first?.release()
    Tests.expect((await stat(path)).isFile()).toBe(true)
    const next = await tryAcquire(path)
    Tests.expect(next !== undefined).toBe(true)
    next?.dispose()
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})

Tests.test('file locks support Unicode paths and report open failures separately from contention', async () => {
  const root = await mkdtemp(join(Platform.temporaryDirectory(), 'tao-file-lock-unicode-'))
  const directory = join(root, 'Tao 雪 ☃')
  const path = join(directory, 'session.lock')
  await Try(async () => {
    await mkdir(directory)
    const lock = await tryAcquire(path)
    Tests.expect(lock !== undefined).toBe(true)
    Tests.expect(await tryAcquire(path)).toBe(undefined)
    lock?.release()
    await Tests.rejects(tryAcquire(join(root, 'missing', 'session.lock')), error => {
      const native = error as Error & { code?: string; operation?: string; osCode?: number }
      Tests.expect(native.message).toMatch(OperatingSystemErrorRegx)
      Tests.expect(native.code).toBe('ERR_FILE_LOCK_OS')
      Tests.expect(native.operation).toBe('open')
      Tests.expect(typeof native.osCode).toBe('number')
      return true
    })
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})

Tests.test('file locks are released by the kernel when their owning process exits', async () => {
  const root = await mkdtemp(join(Platform.temporaryDirectory(), 'tao-file-lock-child-'))
  const path = join(root, 'session.lock')
  const output = Artifacts.resolvePath('cache/native-locks')
  const pointer = Json.Parse(await readFile(join(output, 'current.json'), 'utf8')) as {
    identity: string
    directory: string
  }
  const addon = join(output, pointer.directory, 'build/Release/tao_os_locks.node')
  await Try(async () => {
    const script = `const lock = require(${
      Json.Print(addon)
    }).acquire(process.argv[1]); if (!lock) process.exit(3); process.stdout.write('locked'); process.exit(0)`
    const child = Exec.spawn(Process.execPath, ['-e', script, path])
    const [status, stdout] = await Promise.all([child.exited, Exec.readText(child.stdout)])
    Tests.expect(status).toBe(0)
    Tests.expect(stdout).toBe('locked')
    const reclaimed = await tryAcquire(path)
    Tests.expect(reclaimed !== undefined).toBe(true)
    reclaimed?.release()
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})
