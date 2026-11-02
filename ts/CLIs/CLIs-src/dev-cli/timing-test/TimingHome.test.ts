import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { initializeTimingHome } from '../timing/TimingHome'

Tests.test('timing home previews without mutation and imports evidence idempotently without overwriting conflicts', async () => {
  const directory = Artifacts.resolvePath('tmp/timing-home', Platform.randomUUID())
  Artifacts.trackTemporary(directory)
  const home = Path.join(directory, '.tao-dev')
  const source = Path.join(directory, 'collected-reports')
  const printed: string[] = []
  const print = (message: string) => printed.push(message)
  await initializeTimingHome({ dryRun: true, importReports: source }, home, print)
  Tests.expect(await FileSystem.exists(home)).toBe(false)
  Tests.expect(printed.join('\n')).toContain('/.tao-dev/timing/checkouts')
  await FileSystem.mkdir(source)
  const original = Path.join(source, 'fixture.json')
  await FileSystem.writeFile(original, '{"evidence":"original"}\n')
  await initializeTimingHome({ importReports: source }, home, print)
  Tests.expect(printed.join('\n')).toContain('Imported 1 report(s)')
  const destination = Path.join(home, 'timing/reports/fixture.json')
  Tests.expect(await FileSystem.readFile(destination, 'utf8')).toBe('{"evidence":"original"}\n')
  await initializeTimingHome({ importReports: source }, home, print)
  Tests.expect(printed.join('\n')).toContain('Imported 0 report(s)')
  await FileSystem.writeFile(original, '{"evidence":"different"}\n')
  await Tests.expect(initializeTimingHome({ importReports: source }, home, print)).rejects.toThrow('different report')
  Tests.expect(await FileSystem.readFile(destination, 'utf8')).toBe('{"evidence":"original"}\n')
  Tests.expect(await FileSystem.readFile(original, 'utf8')).toBe('{"evidence":"different"}\n')
})
