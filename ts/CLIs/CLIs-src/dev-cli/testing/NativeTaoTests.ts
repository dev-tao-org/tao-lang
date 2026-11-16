import { IO } from '@cli-kit'
import { Errors, Try } from '@shared'
import { Path, Process, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { Cancellation } from '@shared/web'
import type * as Workspace from '@workspace'
import { prepareParser } from '../../cli-checks/parser-build'
import { prepareRuntime } from '../../cli-checks/runtime-build'
import { verifyNativeLibrary } from './NativeLibraryTests'
import { createNativeTestTarget, type NativeTestPlatform } from './NativeTestDevice'
import { withNativeTestHost } from './NativeTestHost'
import { findTaoTestFiles } from './TaoTestDiscovery'
import * as TestWorkers from './TestWorkers'

/** runNativeTaoTests uses the standard authored discovery and an owned native test device. */
export async function runNativeTaoTests(
  platform: NativeTestPlatform,
  binary: string,
  target: string,
  yes?: boolean,
): Promise<void> {
  await Exec.requireHostProcessAccess('Run ./agent unsandboxed test for native journey host access.')
  const directory = Path.resolve(target)
  const onlyConsumer = directory === Repo.resolvePath('Apps/TS Lib App')
  const files = onlyConsumer ? [] : await findTaoTestFiles(directory)
  if (files.length === 0 && !onlyConsumer) {
    Errors.ThrowUserInput(`No Tao test suites found in ${target}.`)
  }
  await prepareParser()
  await prepareRuntime()
  const controller = Cancellation.createController()
  const stop = Process.onTermination(() => controller.abort())
  await Try(async () => {
    await TestWorkers.prepareTaoTestProjects(files, yes, controller.signal)
    await withNativeTestHost(platform, binary, async (driver, clearAppData) => {
      const testTarget = createNativeTestTarget(platform, driver, clearAppData)
      if (!onlyConsumer) {
        await verifyAuthoredJourneys(testTarget, platform, files, controller.signal)
      }
      if (onlyConsumer || directory === Repo.getWorkspaceRoot()) {
        await verifyNativeLibrary(testTarget, platform)
      }
    })
  }, { finally: stop })
}

async function verifyAuthoredJourneys(
  target: Workspace.AppTestTarget,
  platform: NativeTestPlatform,
  files: readonly string[],
  signal: AbortSignal,
): Promise<void> {
  const result = await TestWorkers.runTaoTestFiles(files, signal, target)
  IO.print(`Tao tests (${platform}): ${result.passed} passed, ${result.failed} failed.`)
  if (result.failed > 0 || signal.aborted) {
    Errors.ThrowUserInput(`Tao ${platform} app tests failed.`)
  }
}
