import { Errors, Time, Try } from '../universal/universal'
import { dirname, mkdirSync, readFileSync, rmSync, writeFileSync } from './NodeBuiltins'

/** withBuildLock serializes preparation of shared generated output across processes.
 *  Unreleased locks retain their owner identity for explicit recovery after a bounded wait. */
export async function withBuildLock<Value>(path: string, operation: () => Promise<Value>): Promise<Value> {
  mkdirSync(dirname(path), { recursive: true })
  const owner = `${process.pid}:${crypto.randomUUID()}`
  const deadline = Time.nowMs() + 120_000
  while (!acquire(path, owner)) {
    if (Time.nowMs() >= deadline) {
      Errors.ThrowHostEnvironment(`Build lock is still held: ${path}. Inspect its owner before removing it.`)
    }
    await Time.sleep(25)
  }
  return await Try(operation, {
    finally() {
      if (readOwner(path) === owner) {
        rmSync(path, { force: true })
      }
    },
  })
}

function acquire(path: string, owner: string): boolean {
  return Try(() => {
    writeFileSync(path, owner, { flag: 'wx', mode: 0o600 })
    return true
  }, {
    catch(error) {
      if (errorCode(error) !== 'EEXIST') {
        Errors.ThrowHostEnvironment(`Cannot acquire build lock: ${path}`, { cause: error })
      }
      return false
    },
  })
}

function readOwner(path: string): string | undefined {
  return Try(() => readFileSync(path, 'utf8'), {
    catch(error) {
      if (errorCode(error) !== 'ENOENT') {
        Errors.ThrowHostEnvironment(`Cannot read build lock: ${path}`, { cause: error })
      }
      return undefined
    },
  })
}

function errorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
}
