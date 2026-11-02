import { IO } from '@cli-kit'
import { Errors, NewlineCharacter } from '@shared'
import { DevelopmentStorage, FileSystem, Path, Platform } from '@shared/os'

/** TimingHome selects an explicit report import or a side-effect-free storage preview. */
export type TimingHome = { importReports?: string; dryRun?: boolean }

/** initializeTimingHome creates shared development storage and imports reports without replacing existing evidence. */
export async function initializeTimingHome(
  options: TimingHome,
  directory = DevelopmentStorage.resolveDirectory(),
  print: (message: string) => void = IO.summary,
): Promise<void> {
  const directories = TimingDirectories.map(name => Path.join(directory, name))
  if (options.dryRun) {
    print('Would create missing development directories:' + NewlineCharacter + directories.join(NewlineCharacter))
    if (options.importReports) {
      print(`Would import reports from ${options.importReports}; original evidence is retained.`)
    }
    return
  }
  for (const path of directories) {
    await FileSystem.mkdirPrivate(path)
  }
  const reports = Path.join(directory, 'timing', 'reports')
  if (options.importReports) {
    const count = await importTimingReports(options.importReports, reports)
    print(`Imported ${count} report(s); original evidence retained at ${options.importReports}.`)
  }
  print(`Timing development home: ${directory}${NewlineCharacter}Shared reports: ${reports}`)
}

const TimingDirectories = ['timing/checkouts', 'timing/reports', 'timing/transfers', 'locks', 'ssh']
const ReportExtension = '.json'

async function importTimingReports(source: string, destination: string): Promise<number> {
  let count = 0
  for (const name of await FileSystem.readdir(source)) {
    if (!name.endsWith(ReportExtension)) {
      continue
    }
    const from = Path.join(source, name)
    if (!(await FileSystem.lstat(from)).isFile()) {
      Errors.ThrowUserInput(`Import only regular report files: ${from}`)
    }
    const to = Path.join(destination, name)
    if (await FileSystem.exists(to)) {
      await requireMatchingReport(from, to)
    } else {
      await FileSystem.copyFile(from, to, FileSystem.constants.COPYFILE_EXCL)
      count++
    }
  }
  return count
}

const ReportDigestAlgorithm = 'sha256'
async function requireMatchingReport(source: string, destination: string): Promise<void> {
  const sourceHash = Platform.hashBytes(await FileSystem.readFile(source), ReportDigestAlgorithm)
  const destinationHash = Platform.hashBytes(await FileSystem.readFile(destination), ReportDigestAlgorithm)
  if (sourceHash !== destinationHash) {
    Errors.ThrowUserInput(`A different report already exists at ${destination}; resolve the conflict before importing.`)
  }
}
