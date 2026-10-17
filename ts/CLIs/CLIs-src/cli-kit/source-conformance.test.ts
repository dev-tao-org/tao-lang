import { S, Try } from '@shared'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkSourceConformance, sourceConformanceIssues } from './source-conformance'

Describe('source conformance', () => {
  Test('requires S for physical multiline runtime literals while ignoring type literals and escapes', () => {
    for (
      const source of [
        'const value = `first\nsecond`',
        'const value = String.raw`first\nsecond`',
        'const value = "first\\\nsecond"',
      ]
    ) {
      Expect(sourceConformanceIssues('fixture.ts', source).join('\n')).toContain('multiline strings must use S')
    }
    Expect(sourceConformanceIssues('fixture.ts', 'type Pattern = `first\nsecond`')).toEqual([])
    Expect(sourceConformanceIssues('fixture.ts', "const value = 'first\\nsecond'")).toEqual([])
  })

  Test('requires separate indented content lines and aligned S delimiters', () => {
    for (
      const source of [
        'const value = S`first\n  second\n`',
        'const value = S`\n  first\n  second`',
        'const value = S`\nfirst\n`',
        '  const value = S`\n    first\n`',
      ]
    ) {
      Expect(sourceConformanceIssues('fixture.ts', source).join('\n')).toContain('S content must start on a new line')
    }
    Expect(sourceConformanceIssues('fixture.ts', 'const value = S`\n  first\n    nested\n`')).toEqual([])
    Expect(sourceConformanceIssues('fixture.ts', 'const value = S`\n  ${\n    format(value)\n  }\n`')).toEqual([])
  })

  Test('scans workspace declaration files while excluding dependencies and the legacy tree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tao-source-conformance-'))
    await Try(async () => {
      await Bun.write(
        join(root, 'ts/public.d.ts'),
        '/** publicValue stores a public number. */\nexport declare const publicValue: number\n',
      )
      await Bun.write(join(root, 'ts/node_modules/ignored/index.ts'), 'export const missingDocs = 1')
      await Bun.write(join(root, 'old-tao-v1/ignored.ts'), 'export const missingDocs = 1')
      await Expect(checkSourceConformance(root)).resolves.toBeUndefined()
      await Bun.write(join(root, 'ts/public.d.ts'), 'export declare const publicValue: number\n')
      await Expect(checkSourceConformance(root)).rejects.toThrow(
        'ts/public.d.ts:1: exported API publicValue needs JSDoc',
      )
    }, { finally: () => rm(root, { recursive: true, force: true }) })
  })

  Test('accepts documented declarations, overload groups, arrows, aliases, and defaults', () => {
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
    Expect(issues).toEqual([])
  })

  Test('reports undocumented direct functions, function variables, aliases, and defaults', () => {
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
    Expect(issues).toHaveLength(4)
    Expect(issues[0]).toContain('exported API missing needs JSDoc')
    Expect(issues[1]).toContain('exported API arrow needs JSDoc')
    Expect(issues[2]).toContain('exported API aliasTarget needs JSDoc')
    Expect(issues[3]).toContain('exported API <default> needs JSDoc')
  })

  Test('requires a named function comment to begin with the function name', () => {
    const issues = sourceConformanceIssues(
      'fixture.ts',
      S`
        /** Returns a value. */
        export function value() { return 1 }
      `,
    )
    Expect(issues).toHaveLength(1)
    Expect(issues[0]).toContain('exported API value needs JSDoc beginning with its name')
  })

  Test('ignores strings, ordinary comments, and barrel re-exports', () => {
    const issues = sourceConformanceIssues(
      'fixture.ts',
      S`
        const example = 'export function hidden() {}'
        // export function alsoHidden() {}
        export { remote } from './remote'
      `,
    )
    Expect(issues).toEqual([])
  })

  Test('does not treat a file banner or export-list comment as declaration documentation', () => {
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
    Expect(issues).toHaveLength(3)
    Expect(issues[0]).toContain('exported API missing needs JSDoc')
    Expect(issues[1]).toContain('exported API localMissing needs JSDoc')
  })

  Test('accepts an exported overload comment and rejects private overload JSDoc', () => {
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
    Expect(issues).toHaveLength(1)
    Expect(issues[0]).toContain('private JSDoc')
  })

  Test('rejects a function name with no description', () => {
    const issues = sourceConformanceIssues(
      'fixture.ts',
      S`
        /** empty */
        export function empty() {}
      `,
    )
    Expect(issues).toHaveLength(1)
    Expect(issues[0]).toContain('needs JSDoc beginning with its name and a description')
  })

  Test('requires documentation on exported values, types, classes and factory defaults', () => {
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
    Expect(issues).toHaveLength(5)
  })

  Test('rejects JSDoc on private declarations and nested implementation details', () => {
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
    Expect(issues).toHaveLength(3)
    Expect(issues.every(issue => issue.includes('private JSDoc'))).toBe(true)
  })

  Test('rejects native try statements with a single exact primitive exception', () => {
    const source = 'function work() { try { work() } finally { cleanup() } }'
    Expect(sourceConformanceIssues('ts/work.ts', source).join('\n')).toContain('use Try')
    Expect(sourceConformanceIssues('ts/other/TryCatch.ts', source).join('\n')).toContain('use Try')
    Expect(sourceConformanceIssues('ts/shared/shared-src/universal/TryCatch.ts', source)).toEqual([])
  })

  Test('rejects ordinary block comments between tokens and trailing statements', () => {
    const issues = sourceConformanceIssues(
      'fixture.ts',
      S`
        /* header */
        const value = /* value */ 1 /* trailing */
        if /* condition */ (value) { value }
      `,
    )
    Expect(issues).toHaveLength(4)
    Expect(issues.every(issue => issue.includes('use //'))).toBe(true)
  })

  Test('ignores comment and try syntax inside strings, templates and regular expressions', () => {
    const source = [
      `const string = '/* text */ try {} catch {} /** text */'`,
      'const template = `/* head */ ${1} /* tail */ try {} catch {}`',
      String.raw`const pattern = /\/\*.*\*\//`,
      '// try {} catch {} /* example */',
    ].join('\n')
    Expect(sourceConformanceIssues('fixture.ts', source)).toEqual([])
  })

  Test('accepts documented API values, type aliases, namespaces, factories and public members', () => {
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
        export default registerCommand({ action: () => count })
      `,
    )
    Expect(issues).toEqual([])
  })

  Test('keeps implementation bodies, private members and private namespaces private', () => {
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
    Expect(issues).toHaveLength(5)
    Expect(issues.every(issue => issue.includes('private JSDoc'))).toBe(true)
  })

  Test('allows public signature member docs while keeping callable bodies private', () => {
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
    Expect(issues).toHaveLength(2)
    Expect(issues.every(issue => issue.includes('private JSDoc'))).toBe(true)
    Expect(issues[0]).toContain('fixture.ts:3:')
    Expect(issues[1]).toContain('fixture.ts:9:')
  })

  Test('checks every destructured export and local destructured export alias', () => {
    const invalid = sourceConformanceIssues(
      'fixture.ts',
      S`
        /** unrelated describes something else. */
        export const { first, nested: { second } } = source
        const [third] = source
        export { third }
      `,
    )
    Expect(invalid).toHaveLength(3)
    for (const name of ['first', 'second', 'third']) {
      Expect(invalid.some(issue => issue.includes('exported API ' + name + ' needs JSDoc'))).toBe(true)
    }
    Expect(sourceConformanceIssues(
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

  Test('checks implicit exports in public ambient namespaces, including nested namespaces', () => {
    for (const declaration of ['export declare namespace API', 'export namespace API']) {
      const filename = declaration.includes('declare') ? 'fixture.ts' : 'fixture.d.ts'
      Expect(sourceConformanceIssues(
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
})
