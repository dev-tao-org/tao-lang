import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import { Json } from '@shared'
import { Errors, Try } from '@shared'
import { FS, Platform, Process } from '@shared/os'
import { Cancellation } from '@shared/web'
import type { TaoWorkerReport } from './TestPlan'
import { runTaoTestFiles } from './TestWorkers'

if (Platform.isMain(import.meta)) {
  await CLIKit.configureCLIOutput('agent')
  await Try(async () => {
    const { reportPath, paths } = workerArguments(Process.argv.slice(2))
    const controller = Cancellation.createController()
    const report: TaoWorkerReport = { passed: 0, failed: 0 }
    const unregisterTermination = Process.onTermination(() => controller.abort())
    await Try(async () => {
      await Try(async () => Object.assign(report, await runTaoTestFiles(paths, controller.signal)), {
        catch(error) {
          report.error = String(error)
        },
      })
    }, {
      async finally() {
        unregisterTermination()
        await FS.writeFile(reportPath, encodeTaoWorkerReport(report))
      },
    })
  }, {
    finally: (_thrown, error) => error ? undefined : IO.finish(),
  })
}

function encodeTaoWorkerReport(report: TaoWorkerReport): string {
  return Json.Print(report)
}

function workerArguments(args: readonly string[]): { reportPath: string; paths: string[] } {
  const separator = args.indexOf('--')
  const options = separator < 0 ? args : args.slice(0, separator)
  const paths = separator < 0 ? [] : args.slice(separator + 1)
  const reportIndex = options.indexOf('--report')
  const reportPath = reportIndex < 0 ? undefined : options[reportIndex + 1]
  if (!reportPath || paths.length === 0) {
    Errors.ThrowUserInput('Tao test worker requires --report <path> and at least one test file.')
  }
  return { reportPath: reportPath ?? Errors.ThrowUserInput('Tao test worker requires a report path.'), paths }
}
