import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import { exportedFunctionCommentIssues } from './export-comments'

Describe('exported function comments', () => {
  Test('accepts documented declarations, overload groups, arrows, aliases, and defaults', () => {
    const issues = exportedFunctionCommentIssues(
      'fixture.ts',
      `
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
    const issues = exportedFunctionCommentIssues(
      'fixture.ts',
      `
export function missing() {}
export const arrow = () => 1
function aliasTarget() {}
export { aliasTarget }
export default () => 1
`,
    )
    Expect(issues).toHaveLength(4)
    Expect(issues[0]).toContain('exported function missing needs JSDoc')
    Expect(issues[1]).toContain('exported function arrow needs JSDoc')
    Expect(issues[2]).toContain('exported function aliasTarget needs JSDoc')
    Expect(issues[3]).toContain('default exported function needs JSDoc')
  })

  Test('requires a named function comment to begin with the function name', () => {
    const issues = exportedFunctionCommentIssues(
      'fixture.ts',
      `
/** Returns a value. */
export function value() { return 1 }
`,
    )
    Expect(issues).toHaveLength(1)
    Expect(issues[0]).toContain('exported function value needs JSDoc beginning with its name')
  })

  Test('ignores strings, ordinary comments, and barrel re-exports', () => {
    const issues = exportedFunctionCommentIssues(
      'fixture.ts',
      `
const example = 'export function hidden() {}'
// export function alsoHidden() {}
export { remote } from './remote'
`,
    )
    Expect(issues).toEqual([])
  })

  Test('does not treat a file banner or export-list comment as declaration documentation', () => {
    const issues = exportedFunctionCommentIssues(
      'fixture.ts',
      `
/** File header. */
const marker = 1
export function missing() {}
function localMissing() {}
/** Export list header. */
export { localMissing }
`,
    )
    Expect(issues).toHaveLength(2)
    Expect(issues[0]).toContain('exported function missing needs JSDoc')
    Expect(issues[1]).toContain('exported function localMissing needs JSDoc')
  })

  Test('accepts an exported overload comment and ignores undocumented private overloads', () => {
    const issues = exportedFunctionCommentIssues(
      'fixture.ts',
      `
/** visible runs the public operation. */
export function visible(value: string): string
export function visible(value: unknown): string { return String(value) }
/** private has a malformed description. */
function privateHelper(value: string): string
function privateHelper(value: unknown): string { return String(value) }
`,
    )
    Expect(issues).toEqual([])
  })

  Test('rejects a function name with no description', () => {
    const issues = exportedFunctionCommentIssues(
      'fixture.ts',
      `
/** empty */
export function empty() {}
`,
    )
    Expect(issues).toHaveLength(1)
    Expect(issues[0]).toContain('needs JSDoc beginning with its name and a description')
  })
})
