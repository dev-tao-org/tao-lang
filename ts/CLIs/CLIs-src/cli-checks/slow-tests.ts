import { Errors, Regxs, Time, Try, UserInput } from '@shared'
import { Artifacts, Path, Platform, Process, Repo } from '@shared/os'
import { IO } from '../cli-kit/cli-kit'

type OptionalReportPath = string | undefined
/** TestFileTiming records wall time for one complete file suite in Bun's JUnit output. */
export type TestFileTiming = { file: string; durationMs: number }

/** withTestTimings reports slow cases and returns per-file wall times from successful runs. */
export async function withTestTimings(
  run: (reportPath: OptionalReportPath) => Promise<void>,
  slowSeconds = 0.075,
  output: Pick<typeof IO, 'warn'> = IO,
): Promise<TestFileTiming[]> {
  const reportPath = await prepareTestReport()
  let files: TestFileTiming[] = []
  await Try(() => run(reportPath), {
    async finally() {
      if (!reportPath) {
        return
      }
      await Try(async () => {
        const report = await Artifacts.file(reportPath).text()
        if (!report.trim()) {
          Errors.ThrowHostEnvironment('Test runner did not write timing data.')
        }
        const warning = slowTestSummary(report, reportPath, slowSeconds)
        if (warning) {
          output.warn(warning)
        }
        files = readTestFileTimings(report)
      }, {
        catch: (error) => IO.warn('Unable to read test timings:', error),
      })
    },
  })
  return files
}

function readTestFileTimings(report: string): TestFileTiming[] {
  if (!report.trimEnd().endsWith('</testsuites>')) {
    return []
  }
  const files: TestFileTiming[] = []
  let depth = 0
  for (const [token] of report.matchAll(Regxs.XmlToken)) {
    const tag = token.match(Regxs.TestReportTag)
    if (tag?.[2] !== 'testsuite') {
      continue
    }
    if (tag[1] === '/') {
      depth--
      continue
    }
    if (depth === 0) {
      const attributes = xmlAttributes(token)
      const seconds = attributes.time?.trim() ? Number(attributes.time) : NaN
      if (attributes.file && Number.isFinite(seconds) && seconds >= 0) {
        files.push({ file: attributes.file, durationMs: Math.max(1, seconds * 1000) })
      }
    }
    if (!token.endsWith('/>')) {
      depth++
    }
  }
  return files
}

/** parseSlowTestSeconds validates a per-run warning threshold without changing test selection or outcomes. */
export function parseSlowTestSeconds(value = '0.075'): number {
  const seconds = Number(value)
  UserInput.Require(
    !(!value.trim() || !Number.isFinite(seconds) || seconds < 0),
    '--slow requires a finite, non-negative duration in seconds.',
  )
  return seconds
}

type OptionalTimedTest = TimedTest | undefined
type XmlAttributes = Record<string, string>
type XmlEntities = Record<string, string>

function slowTestSummary(report: string, reportPath: string, slowSeconds: number): string | undefined {
  const slow = readTestCases(report).filter(test => isSlowTest(test, slowSeconds))
    .sort((left, right) => right.seconds - left.seconds)
  if (slow.length === 0) {
    return undefined
  }
  const slowest = slow[0]!
  const duration = (slowest.seconds * 1000).toFixed(2)
  const path = Path.relative(Repo.getWorkspaceRoot(), reportPath)
  const noun = slow.length === 1 ? 'test' : 'tests'
  return `${slow.length} ${noun} exceeded ${slowSeconds * 1000} ms; slowest ${duration} ms. Full timings: ${path}`
}

async function prepareTestReport(): Promise<string | undefined> {
  return Try(async () => {
    const path = Artifacts.resolvePath('logs', 'test', `${Time.now()}-${Process.pid}-${Platform.randomUUID()}.xml`)
    await Artifacts.mkdir(Path.dirname(path))
    Artifacts.trackTemporary(path)
    await Artifacts.write(path, '')
    return path
  }, {
    catch(error) {
      IO.warn('Test timing report unavailable:', error)
      return undefined
    },
  })
}

type TimedTest = { seconds: number; skipped: boolean }

function readTestCases(report: string): TimedTest[] {
  const cases: TimedTest[] = []
  let current: OptionalTimedTest
  // Match whole XML tokens, including quoted > characters; diagnostic CDATA and comments stay opaque.
  const tokens = report.matchAll(Regxs.XmlToken)
  for (const [token] of tokens) {
    const tag = token.match(Regxs.TestReportTag)
    if (!tag) {
      continue
    }
    const closing = tag[1] === '/'
    if (tag[2] === 'testcase') {
      if (closing) {
        if (current) {
          cases.push(current)
          current = undefined
        }
        continue
      }
      current = { seconds: Number(xmlAttributes(token).time), skipped: false }
      if (token.endsWith('/>')) {
        cases.push(current)
        current = undefined
      }
    } else if (tag[2] === 'skipped' && current && !closing) {
      current.skipped = true
    } else {
      // Closing skipped tags and skipped tags outside a test case add no timing information.
    }
  }
  return cases
}

function isSlowTest(test: { seconds: number; skipped: boolean }, threshold: number): boolean {
  return !test.skipped && Number.isFinite(test.seconds) && test.seconds > threshold
}

function xmlAttributes(token: string): XmlAttributes {
  const attributes: XmlAttributes = {}
  for (const match of token.matchAll(Regxs.XmlAttribute)) {
    attributes[match[1]] = decodeXml(match[2] ?? match[3])
  }
  return attributes
}

const MaximumUnicodeCodePoint = 0x10FFFF

function decodeXml(text: string): string {
  const entities: XmlEntities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
  return text.replace(Regxs.XmlEntity, (entity, name: string) => {
    if (name.startsWith('#')) {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
      return code <= MaximumUnicodeCodePoint ? String.fromCodePoint(code) : entity
    }
    return entities[name] ?? entity
  })
}
