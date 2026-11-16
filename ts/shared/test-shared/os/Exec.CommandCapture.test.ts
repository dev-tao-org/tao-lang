import { Json } from '@shared'
import { Errors, Time, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import Exec from '@shared/os/exec'
import * as Process from '../../shared-src/os/Process'

type OptionalDescendantPid = number | undefined

Tests.test('a command deadline bounds inherited capture after its immediate child exits', async () => {
  const root = Artifacts.resolvePath('tmp', `command-capture-${Platform.randomUUID()}`)
  const receipt = Path.join(root, 'descendant.pid')
  await FS.mkdir(root)
  let descendantPid: OptionalDescendantPid
  const source = `await Bun.write(${
    Json.Print(receipt)
  }, String(process.pid)); process.stdout.write('partial output'); process.stderr.write('partial diagnostic'); setTimeout(() => process.exit(0), 3000)`
  const parentSource = `Bun.spawn([process.execPath, '-e', ${
    Json.Print(source)
  }], { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' }); process.exit(0)`
  const args = ['-e', parentSource]
  const observed = Exec.capture(Process.argv[0]!, args, { check: false, timeoutMs: 100 }).then(
    result => ({ result, error: undefined }),
    error => ({ result: undefined, error }),
  )
  await Try(async () => {
    descendantPid = await readOwnedDescendantPid(receipt)
    const outcome = await Promise.race([observed, Time.sleep(400).then(() => undefined)])
    Tests.expect(outcome).toBeDefined()
    Tests.expect(Errors.isCommandExecutionError(outcome!.error)).toBe(true)
    if (Errors.isCommandExecutionError(outcome!.error)) {
      Tests.expect(outcome!.error.result).toMatchObject({
        status: 0,
        signal: null,
        stdout: 'partial output',
        stderr: 'partial diagnostic',
      })
    }
  }, {
    async finally() {
      if (descendantPid !== undefined) {
        await Try(() => Process.kill(descendantPid!, 'SIGKILL'), { catch: () => undefined })
      }
      const drained = await Promise.race([observed, Time.sleep(3500).then(() => undefined)])
      await FS.rm(root, { recursive: true, force: true })
      Tests.expect(drained).toBeDefined()
    },
  })
}, 7000)

async function readOwnedDescendantPid(receipt: string): Promise<number> {
  const readinessDeadline = Time.nowMs() + 1500
  while (Time.nowMs() < readinessDeadline) {
    if (await FS.exists(receipt)) {
      const pid = Number(await FS.readFile(receipt, 'utf8'))
      // A newly created receipt can still be empty; zero would target the process group.
      if (Number.isSafeInteger(pid) && pid > 1) {
        return pid
      }
    }
    await Time.sleep(5)
  }
  return Errors.ThrowShouldNeverHappen('The owned descendant did not publish a valid process ID.')
}

Tests.test('command deadlines stop blocked input while preserving a live child signal', async () => {
  const source = 'process.stdout.write("ready"); setTimeout(() => process.exit(0), 3000)'
  const args = ['-e', source]
  const stdin = new Uint8Array(8 * 1024 * 1024)
  const result = await Exec.capture(Process.argv[0]!, args, { check: false, stdin, timeoutMs: 100 })
  Tests.expect(result.signal).toBe('SIGKILL')
  Tests.expect(result.stdout).toBe('ready')
})
