import { Errors, Try } from '@shared'
import { Clock, FileSystem, Platform } from '@shared/os'
import { mkdir } from '@shared/os/FileSystem'
import { dirname } from '@shared/os/Path'
import { IO, repositoryRoot } from './cli-kit'

/** withTestTimings prints slow-test warnings after a run while preserving its failure. */
export async function withTestTimings(run: (reportPath: string | undefined) => Promise<void>): Promise<void> {
  const reportPath = await prepareTestReport()
  await Try(() => run(reportPath), {
    finally: async () => {
      if (!reportPath) {
        return
      }
      await Try(async () => {
        const report = await FileSystem.file(reportPath).text()
        if (!report.trim()) {
          Errors.ThrowHostEnvironment('Test runner did not write timing data.')
        }
        for (const warning of slowTestWarnings(report)) {
          IO.warn(warning)
        }
      }, { catch: error => IO.warn('Unable to read test timings:', error) })
    },
  })
}

async function prepareTestReport(): Promise<string | undefined> {
  return Try(async () => {
    const path =
      `${repositoryRoot}/.artifacts/logs/test/${Clock.epochMs()}-${Platform.pid}-${Platform.randomUUID()}.xml`
    await mkdir(dirname(path), { recursive: true })
    await FileSystem.write(path, '')
    return path
  }, {
    catch: error => {
      IO.warn('Test timing report unavailable:', error)
      return undefined
    },
  })
}

/** slowTestWarnings formats yellow warnings for executed Bun JUnit cases taking more than 75 milliseconds. */
export function slowTestWarnings(report: string): string[] {
  const suites: Record<string, string>[] = []
  const cases: { name: string; suite?: string; file?: string; seconds: number; skipped: boolean }[] = []
  let current: (typeof cases)[number] | undefined
  // Match whole XML tokens, including quoted > characters; diagnostic CDATA and comments stay opaque.
  const tokens = report.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(?:"[^"]*"|'[^']*'|[^'">])*>/g)
  for (const [token] of tokens) {
    const tag = token.match(/^<(\/?)(testsuite|testcase|skipped)\b/)
    if (!tag) {
      continue
    }
    const closing = tag[1] === '/'
    if (tag[2] === 'testsuite') {
      if (closing) {
        suites.pop()
      } else if (!token.endsWith('/>')) {
        suites.push(xmlAttributes(token))
      }
    } else if (tag[2] === 'testcase') {
      if (closing) {
        if (current) {
          cases.push(current)
          current = undefined
        }
        continue
      }
      const attributes = xmlAttributes(token)
      const suite = suites[suites.length - 1]
      current = {
        name: attributes.name ?? '<unnamed>',
        suite: attributes.classname || suite?.name,
        file: attributes.file || suite?.file,
        seconds: Number(attributes.time),
        skipped: false,
      }
      if (token.endsWith('/>')) {
        cases.push(current)
        current = undefined
      }
    } else if (current && !closing) {
      current.skipped = true
    }
  }
  const slow = cases.filter(isSlowTest).sort((left, right) => right.seconds - left.seconds)
  if (slow.length === 0) {
    return []
  }
  return [
    yellow('Slow tests (>75 ms):'),
    ...slow.map(test =>
      yellow(
        `  ${(test.seconds * 1000).toFixed(2)} ms  ${test.suite ? test.suite + ' > ' : ''}${test.name}${
          test.file ? ' (' + test.file + ')' : ''
        }`,
      )
    ),
  ]
}

function isSlowTest(test: { seconds: number; skipped: boolean }): boolean {
  return !test.skipped && Number.isFinite(test.seconds) && test.seconds > 0.075
}

function yellow(text: string): string {
  return '\u001b[33m' + text + '\u001b[0m'
}

function xmlAttributes(token: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const match of token.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attributes[match[1]] = decodeXml(match[2] ?? match[3])
  }
  return attributes
}

function decodeXml(text: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, name: string) => {
    if (name.startsWith('#')) {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
      return code <= 0x10FFFF ? String.fromCodePoint(code) : entity
    }
    return entities[name] ?? entity
  })
}
