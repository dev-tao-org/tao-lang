import { S, Try } from '@shared'
import { FileSystem, Path, Platform, Test } from '@shared/os'
import { checkSourceConformance, sourceConformanceIssues } from '../cli-kit/source-conformance'

Test.test('object functions use methods while references and function types remain valid', () => {
  const valid = S`
    const encrypt = async (value: string) => value
    const object = {
      encrypt,
      async decrypt(value: string) { return value },
      *values() { yield 1 },
      ['computed'](value: string) { return value },
    }
    type Shape = { encrypt: (value: string) => Promise<string> }
  `
  Test.expect(sourceConformanceIssues('fixture.ts', valid)).toEqual([])
  for (
    const initializer of [
      'async (plaintext, recipients) => plaintext',
      '(plaintext) => { return plaintext }',
      'function (plaintext) { return plaintext }',
      'async function (plaintext) { return plaintext }',
      '((plaintext) => plaintext)',
      '((plaintext) => plaintext) as Handler',
      '((plaintext) => plaintext) satisfies Handler',
      '((plaintext) => plaintext)!',
    ]
  ) {
    Test.expect(sourceConformanceIssues('fixture.ts', 'const cipher = { encrypt: ' + initializer + ' }'))
      .toEqual(['fixture.ts:1: function implementations in objects must use method syntax'])
  }
})

Test.test('source conformance > limits physical function body lines across declarations, methods, callbacks, and expressions', () => {
  const accepted = 'function boundary() {\n' + physicalBodyLines(45) + '\n}'
  Test.expect(sourceConformanceIssues('fixture.ts', accepted)).toEqual([])

  const rejected = [
    'function tooLong() {\n' + physicalBodyLines(46) + '\n}',
    'class Service {\n  run() {\n' + physicalBodyLines(46) + '\n  }\n}',
    'class Service {\n  constructor() {\n' + physicalBodyLines(46) + '\n  }\n}',
    'const callback = () => {\n' + physicalBodyLines(46) + '\n}',
    'const expression = () => (\n' + Array.from({ length: 44 }, () => '  value,').join('\n')
    + '\n  value\n)',
  ].join('\n')
  const issues = sourceConformanceIssues('fixture.ts', rejected)
  Test.expect(issues).toHaveLength(5)
  Test.expect(issues.every(issue => issue.includes('function bodies must contain at most 45 physical lines')))
    .toBe(true)
  Test.expect(issues[0]).toContain('found 46')
  Test.expect(issues[4]).toContain('found 47')
})

Test.test('source conformance > keeps runtime imports and platform globals inside the exact OS subtree', () => {
  for (
    const source of platformViolations()
  ) {
    Test.expect(sourceConformanceIssues('ts/feature.ts', source)).toHaveLength(1)
    Test.expect(sourceConformanceIssues('ts/shared/shared-src/os/Platform.ts', source)).toEqual([])
    Test.expect(sourceConformanceIssues('ts/shared/shared-src/os-other/Platform.ts', source)).toHaveLength(1)
  }
  Test.expect(sourceConformanceIssues('ts/feature.test.ts', "import { test } from 'bun:test'")).toHaveLength(1)
  Test.expect(sourceConformanceIssues('ts/knip.ts', "import { readFileSync } from 'node:fs'")).toHaveLength(1)
  Test.expect(sourceConformanceIssues('ts/feature.ts', "const text = 'process.env and bun:test'; // Bun.spawn\n"))
    .toEqual(
      [],
    )
  Test.expect(sourceConformanceIssues('ts/feature.ts', 'const value = { process: 1 }; value.process')).toEqual([])
  Test.expect(sourceConformanceIssues(
    'ts/feature.ts',
    S`
      type Shape = { process: string; Bun(): void }
      interface Other { Buffer: number; fetch(): void }
      class Value { process = 1; Bun() {} }
    `,
  )).toEqual([])
  Test.expect(sourceConformanceIssues(
    'ts/shared/shared-src/universal/Time.ts',
    S`
      const monotonic = performance.now()
      const clock = Date.now()
      const date = new Date()
      setTimeout(() => {}, 1)
    `,
  )).toEqual([])
  Test.expect(sourceConformanceIssues('ts/shared/shared-src/universal/Time.ts', 'const value = process.pid'))
    .toHaveLength(1)
  Test.expect(sourceConformanceIssues('ts/feature.ts', "const value = new Date('2026-10-17')")).toEqual([])
})

Test.test('source conformance > requires text on the opening and closing JSDoc lines and two spaces after continuation stars', () => {
  for (
    const comment of [
      '/**\n *  value returns input. */',
      '/** value\n *  returns input. */',
      '/** value returns input.\n *  More details.\n */',
      '/** value returns input.\n More details. */',
      '/** value returns input.\n * More details. */',
      '/** value returns input.\n *   More details. */',
      '/** value returns input.\n *  More details.*/',
      '/** value returns input.\n  *  Misaligned details. */',
    ]
  ) {
    const issues = sourceConformanceIssues('fixture.ts', comment + '\nexport function value() {}')
    Test.expect(issues).toHaveLength(1)
    Test.expect(issues[0]).toContain('multiline JSDoc')
  }
})

Test.test('source conformance > accepts the required JSDoc layout, including indented public members and CRLF', () => {
  const source = S`
    /** value returns input.
     *  Additional details.
     *  Last details. */
    export function value() {}
    /** Client exposes the service. */
    export class Client {
      /** run invokes the service.
       *  Additional details. */
      run() {}
    }
  `
  Test.expect(sourceConformanceIssues('fixture.ts', source)).toEqual([])
  Test.expect(sourceConformanceIssues('fixture.ts', source.replaceAll('\n', '\r\n'))).toEqual([])
  Test.expect(sourceConformanceIssues('fixture.ts', "const example = '/**\\n * bad */'")).toEqual([])
})

Test.test('source conformance > requires S for physical multiline runtime literals while ignoring type literals and escapes', () => {
  for (
    const source of [
      'const value = `first\nsecond`',
      'const value = String.raw`first\nsecond`',
      'const value = "first\\\nsecond"',
    ]
  ) {
    Test.expect(sourceConformanceIssues('fixture.ts', source).join('\n')).toContain('multiline strings must use S')
  }
  Test.expect(sourceConformanceIssues('fixture.ts', 'type Pattern = `first\nsecond`')).toEqual([])
  Test.expect(sourceConformanceIssues('fixture.ts', "const value = 'first\\nsecond'")).toEqual([])
})

Test.test('source conformance > requires separate indented content lines and aligned S delimiters', () => {
  for (
    const source of [
      'const value = S`first\n  second\n`',
      'const value = S`\n  first\n  second`',
      'const value = S`\nfirst\n`',
      '  const value = S`\n    first\n`',
    ]
  ) {
    Test.expect(sourceConformanceIssues('fixture.ts', source).join('\n')).toContain(
      'S content must start on a new line',
    )
  }
  Test.expect(sourceConformanceIssues('fixture.ts', 'const value = S`\n  first\n    nested\n`')).toEqual([])
  Test.expect(sourceConformanceIssues('fixture.ts', 'const value = S`\n  ${\n    format(value)\n  }\n`')).toEqual([])
})

Test.test('source conformance > scans workspace declaration files while excluding dependencies and the legacy tree', async () => {
  const root = await FileSystem.mkdtemp(Path.join(Platform.tmpdir(), 'tao-source-conformance-'))
  await Try(async () => {
    await FileSystem.write(
      Path.join(root, 'ts/public.d.ts'),
      '/** publicValue stores a public number. */\nexport declare const publicValue: number\n',
    )
    await FileSystem.write(Path.join(root, 'ts/node_modules/ignored/index.ts'), 'export const missingDocs = 1')
    await FileSystem.write(Path.join(root, 'old-tao-v1/ignored.ts'), 'export const missingDocs = 1')
    await Test.expect(checkSourceConformance(root)).resolves.toBeUndefined()
    await FileSystem.write(Path.join(root, 'ts/public.d.ts'), 'export declare const publicValue: number\n')
    await Test.expect(checkSourceConformance(root)).rejects.toThrow(
      'ts/public.d.ts:1: exported API publicValue needs JSDoc',
    )
  }, {
    finally() {
      return FileSystem.rm(root, { recursive: true, force: true })
    },
  })
})

Test.test('source conformance > accepts documented declarations, overload groups, arrows, aliases, and defaults', () => {
  const issues = sourceConformanceIssues(
    'fixture.ts',
    S`
      /** greet returns a greeting. */
      export function greet(name: string): string
      export function greet(name: unknown): string { return String(name) }

      /** double returns twice the input. */
      export const double = (value: number) => value * 2

      /** localValue returns a local value. */
      function localValue() { return 1 }
      export { localValue as publicValue }

      /** defaultValue returns the default value. */
      const defaultValue = () => 1
      export default defaultValue
    `,
  )
  Test.expect(issues).toEqual([])
})

Test.test('source conformance > reports undocumented direct functions, function variables, aliases, and defaults', () => {
  const issues = sourceConformanceIssues(
    'fixture.ts',
    S`
      export function missing() {}
      export const arrow = () => 1
      function aliasTarget() {}
      export { aliasTarget }
      export default () => 1
    `,
  )
  Test.expect(issues).toHaveLength(4)
  Test.expect(issues[0]).toContain('exported API missing needs JSDoc')
  Test.expect(issues[1]).toContain('exported API arrow needs JSDoc')
  Test.expect(issues[2]).toContain('exported API aliasTarget needs JSDoc')
  Test.expect(issues[3]).toContain('exported API <default> needs JSDoc')
})

Test.test('source conformance > requires a named function comment to begin with the function name', () => {
  const issues = sourceConformanceIssues(
    'fixture.ts',
    S`
      /** Returns a value. */
      export function value() { return 1 }
    `,
  )
  Test.expect(issues).toHaveLength(1)
  Test.expect(issues[0]).toContain('exported API value needs JSDoc beginning with its name')
})

Test.test('source conformance > ignores strings, ordinary comments, and barrel re-exports', () => {
  const issues = sourceConformanceIssues(
    'fixture.ts',
    S`
      const example = 'export function hidden() {}'
      // export function alsoHidden() {}
      export { remote } from '../cli-kit/remote'
    `,
  )
  Test.expect(issues).toEqual([])
})

Test.test('source conformance > does not treat a file banner or export-list comment as declaration documentation', () => {
  const issues = sourceConformanceIssues(
    'fixture.ts',
    S`
      /** File header. */
      const marker = 1
      export function missing() {}
      function localMissing() {}
      /** Export list header. */
      export { localMissing }
    `,
  )
  Test.expect(issues).toHaveLength(3)
  Test.expect(issues[0]).toContain('exported API missing needs JSDoc')
  Test.expect(issues[1]).toContain('exported API localMissing needs JSDoc')
})

Test.test('source conformance > accepts an exported overload comment and rejects private overload JSDoc', () => {
  const issues = sourceConformanceIssues(
    'fixture.ts',
    S`
      /** visible runs the public operation. */
      export function visible(value: string): string
      export function visible(value: unknown): string { return String(value) }
      /** private has a malformed description. */
      function privateHelper(value: string): string
      function privateHelper(value: unknown): string { return String(value) }
    `,
  )
  Test.expect(issues).toHaveLength(1)
  Test.expect(issues[0]).toContain('private JSDoc')
})

Test.test('source conformance > rejects a function name with no description', () => {
  const issues = sourceConformanceIssues(
    'fixture.ts',
    S`
      /** empty */
      export function empty() {}
    `,
  )
  Test.expect(issues).toHaveLength(1)
  Test.expect(issues[0]).toContain('needs JSDoc beginning with its name and a description')
})

Test.test('source conformance > requires documentation on exported values, types, classes and factory defaults', () => {
  const issues = sourceConformanceIssues(
    'fixture.ts',
    S`
      export const count = 1
      export type Item = { value: number }
      export interface Store { value: number }
      export class Client {}
      export default factory()
    `,
  )
  Test.expect(issues).toHaveLength(5)
})

Test.test('source conformance > rejects JSDoc on private declarations and nested implementation details', () => {
  const issues = sourceConformanceIssues(
    'fixture.ts',
    S`
      /** hidden returns a value. */
      function hidden() { return 1 }
      /** local stores a value. */
      const local = 1
      /** api returns a value. */
      export function api() {
        /** nested returns the value. */
        function nested() { return local }
        return nested()
      }
    `,
  )
  Test.expect(issues).toHaveLength(3)
  Test.expect(issues.every(issue => issue.includes('private JSDoc'))).toBe(true)
})

Test.test('source conformance > rejects native try statements with a single exact primitive exception', () => {
  const source = 'function work() { try { work() } finally { cleanup() } }'
  Test.expect(sourceConformanceIssues('ts/work.ts', source).join('\n')).toContain('use Try')
  Test.expect(sourceConformanceIssues('ts/other/TryCatch.ts', source).join('\n')).toContain('use Try')
  Test.expect(sourceConformanceIssues('ts/shared/shared-src/universal/TryCatch.ts', source)).toEqual([])
})

Test.test('source conformance > rejects ordinary block comments between tokens and trailing statements', () => {
  const issues = sourceConformanceIssues(
    'fixture.ts',
    S`
      /* header */
      const value = /* value */ 1 /* trailing */
      if /* condition */ (value) { value }
    `,
  )
  Test.expect(issues).toHaveLength(4)
  Test.expect(issues.every(issue => issue.includes('use //'))).toBe(true)
})

Test.test('source conformance > ignores comment and try syntax inside strings, templates and regular expressions', () => {
  const source = [
    `const string = '/* text */ try {} catch {} /** text */'`,
    'const template = `/* head */ ${1} /* tail */ try {} catch {}`',
    String.raw`const pattern = /\/\*.*\*\//`,
    '// try {} catch {} /* example */',
  ].join('\n')
  Test.expect(sourceConformanceIssues('fixture.ts', source)).toEqual([])
})

Test.test('source conformance > accepts documented API values, type aliases, namespaces, factories and public members', () => {
  const issues = sourceConformanceIssues(
    'fixture.ts',
    S`
      /** count stores the current count. */
      const count = 1
      /** Model describes one model. */
      type Model = { value: number }
      export { count, Model as PublicModel }
      /** API exposes operations. */
      export namespace API {
        /** run invokes the operation. */
        export function run() {}
      }
      /** Client exposes the service. */
      export class Client {
        /** run invokes the service. */
        run() { return 1 }
      }
      /** command registers the public command. */
      export default registerCommand({ action() { return count } })
    `,
  )
  Test.expect(issues).toEqual([])
})

Test.test('source conformance > keeps implementation bodies, private members and private namespaces private', () => {
  const issues = sourceConformanceIssues(
    'fixture.ts',
    S`
      namespace Hidden {
        /** work performs private work. */
        export function work() {}
      }
      /** Client exposes the service. */
      export class Client {
        /** secret hides a value. */
        private secret = 1
        /** internal hides a value. */
        #internal = 2
        /** initialize seeds internal state. */
        static { seed() }
        run() {
          /** helper performs private work. */
          function helper() {}
        }
      }
    `,
  )
  Test.expect(issues).toHaveLength(5)
  Test.expect(issues.every(issue => issue.includes('private JSDoc'))).toBe(true)
})

Test.test('source conformance > allows public signature member docs while keeping callable bodies private', () => {
  const issues = sourceConformanceIssues(
    'fixture.ts',
    S`
      /** api accepts options. */
      export function api(options: { /** value carries input. */ value: number }): { /** result carries output. */ result: number } {
        /** local stores internal state. */
        const local = options.value
        return { result: local }
      }
      /** arrow accepts options. */
      export const arrow = (options: { /** value carries input. */ value: number }) => {
        /** local stores internal state. */
        const local = options.value
        return local
      }
      /** expression accepts options. */
      export const expression = function(options: { /** value carries input. */ value: number }) { return options.value }
    `,
  )
  Test.expect(issues).toHaveLength(2)
  Test.expect(issues.every(issue => issue.includes('private JSDoc'))).toBe(true)
  Test.expect(issues[0]).toContain('fixture.ts:3:')
  Test.expect(issues[1]).toContain('fixture.ts:9:')
})

Test.test('source conformance > checks every destructured export and local destructured export alias', () => {
  const invalid = sourceConformanceIssues(
    'fixture.ts',
    S`
      /** unrelated describes something else. */
      export const { first, nested: { second } } = source
      const [third] = source
      export { third }
    `,
  )
  Test.expect(invalid).toHaveLength(3)
  for (const name of ['first', 'second', 'third']) {
    Test.expect(invalid.some(issue => issue.includes('exported API ' + name + ' needs JSDoc'))).toBe(true)
  }
  Test.expect(sourceConformanceIssues(
    'fixture.ts',
    S`
      /** first stores the first value. */
      /** second stores the second value. */
      export const { first, nested: { second } } = source
      /** third stores the third value. */
      const [third] = source
      export { third }
    `,
  )).toEqual([])
})

Test.test('source conformance > checks implicit exports in public ambient namespaces, including nested namespaces', () => {
  for (const declaration of ['export declare namespace API', 'export namespace API']) {
    const filename = declaration.includes('declare') ? 'fixture.ts' : 'fixture.d.ts'
    Test.expect(sourceConformanceIssues(
      filename,
      S`
        /** API exposes operations. */
        ${declaration} {
          function missing(): void
          /** Nested exposes nested operations. */
          namespace Nested {
            /** run invokes the operation. */
            function run(): void
          }
        }
      `,
    )).toEqual([`${filename}:3: exported API missing needs JSDoc beginning with its name and a description`])
  }
})

function physicalBodyLines(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => index % 9 === 0 ? '  // retained body line' : index % 11 === 0 ? '' : '  value()',
  ).join('\n')
}

function platformViolations(): string[] {
  return [
    "import { readFile } from 'node:fs/promises'",
    "import { readFile } from 'fs/promises'",
    "export { test } from 'bun:test'",
    "const runtime = await import('bun')",
    "const runtime = require('node:path')",
    "type Runtime = typeof import('node:process')",
    'const value = process.env.VALUE',
    'const runtime = Bun',
    "const value = Buffer.from('text')",
    'const value = performance.now()',
    'const value = Date.now()',
    'const value = new Date()',
    "const value = Date['now']()",
    'const value = Date()',
    'const value = globalThis.Date.now()',
    'const value = new globalThis.Date()',
    'type Stream = ReadableStream<Uint8Array>',
    "const value = globalThis['process'].pid",
    'const value = globalThis.Bun.argv',
  ]
}
