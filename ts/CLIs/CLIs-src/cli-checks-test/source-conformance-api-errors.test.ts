import { S } from '@shared'
import { Tests } from '@shared/os'
import { sourceConformanceIssues } from '../cli-checks/source-conformance'

const invalidApiFixture = S`
  export function missing() {}
  export const arrow = () => 1
  function aliasTarget() {}
  export { aliasTarget }
  export default () => 1
  export const count = 1
  export type Item = { value: number }
  export interface Store { value: number }
  export class UndocumentedClient {}
  export default factory()
  /** Returns a value. */
  export function value() {}
  /** empty */
  export function empty() {}
  /** File header. */
  const marker = 1
  export function bannerMissing() {}
  function localMissing() {}
  /** Export list header. */
  export { localMissing }
  /** unrelated describes something else. */
  export const { first, nested: { second } } = source
  const [third] = source
  export { third }
  /** hidden returns a value. */
  function hidden() { return 1 }
  /** local stores a value. */
  const local = 1
  /** api returns a value. */
  export function api(options: { /** value carries input. */ value: number }) {
    /** nested returns the value. */
    function nested() { return options.value }
    return nested()
  }
  /** documentedArrow accepts input. */
  export const documentedArrow = (options: { /** value carries input. */ value: number }) => {
    /** local stores internal state. */
    return options.value
  }
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
  /** visible runs the public operation. */
  export function visible(value: string): string
  export function visible(value: unknown): string { return String(value) }
  /** private runs a private operation. */
  function privateHelper(value: string): string
  function privateHelper(value: unknown): string { return String(value) }
`

const invalidJSDocLayouts = [
  '/**\n *  value0 returns input. */',
  '/** value1\n *  returns input. */',
  '/** value2 returns input.\n *  More details.\n */',
  '/** value3 returns input.\n More details. */',
  '/** value4 returns input.\n * More details. */',
  '/** value5 returns input.\n *   More details. */',
  '/** value6 returns input.\n *  More details.*/',
  '/** value7 returns input.\n  *  Misaligned details. */',
]

Tests.test('source conformance > reports exact API, alias, destructuring, privacy, and JSDoc errors together', () => {
  const actual = messages(sourceConformanceIssues('fixture.ts', invalidApiFixture)).toSorted()
  const missingDocs = [
    'missing',
    'arrow',
    'aliasTarget',
    'count',
    'Item',
    'Store',
    'UndocumentedClient',
    '<default>',
    '<default>',
    'bannerMissing',
    'localMissing',
    'first',
    'second',
    'third',
  ].map(name => `exported API ${name} needs JSDoc beginning with its name and a description`)
  const expected = [
    ...missingDocs,
    'exported API value needs JSDoc beginning with its name and a description',
    'exported API empty needs JSDoc beginning with its name and a description',
    ...Array(11).fill('private JSDoc is not allowed; use // lines'),
  ].toSorted()
  Tests.expect(actual).toEqual(expected)
})

Tests.test('source conformance > reports all malformed JSDoc layouts in one multi-export fixture', () => {
  const fixture = invalidJSDocLayouts.map((comment, index) => {
    return `${comment}\nexport function value${index}() {}`
  }).join('\n')
  const actual = messages(sourceConformanceIssues('fixture.ts', fixture)).toSorted()
  Tests.expect(actual).toEqual(
    Array(8).fill(
      'multiline JSDoc needs opening-line text, aligned *  continuation lines, and */ after the last text',
    ),
  )
})

function messages(issues: string[]): string[] {
  return issues.map(issue => issue.replace(/^.*?:\d+: /u, ''))
}
