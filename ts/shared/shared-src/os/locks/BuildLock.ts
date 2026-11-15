import { Errors, Time, Try } from '../../universal/universal'
import * as WebHost from '../bridges/Bridge_browser/Bridge_browser'
import * as Process from '../Process'

import { dirname, mkdirSync, readFileSync, rmSync, writeFileSync } from '../bridges/Bridge_node/Bridge_node'

/** withBuildLock serializes preparation of shared generated output across processes.
 *  Unreleased locks retain their owner identity for explicit recovery after a bounded wait. */
export async function withBuildLock<Value>(path: string, operation: () => Promise<Value>): Promise<Value> {
  mkdirSync(dirname(path), { recursive: true })
  const owner = `${Process.pid}:${WebHost.crypto.randomUUID()}`
  const acquired = acquire(path, owner)
    || await Time.waitFor(success => acquire(path, owner) ? success(true) : undefined, { timeout: 120_000 })
  if (acquired === undefined) {
    Errors.ThrowHostEnvironment(`Build lock is still held: ${path}. Inspect its owner before removing it.`)
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
  return isErrorWithCode(error) ? error.code : undefined
}

function isErrorWithCode(error: unknown): error is { code: unknown } {
  return typeof error === 'object' && error !== null && 'code' in error
}
