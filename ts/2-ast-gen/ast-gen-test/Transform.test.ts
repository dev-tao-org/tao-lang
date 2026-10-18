import * as AST from '@ast-gen/AST'
import { Errors, Timings } from '@shared'
import { Tests } from '@shared/os'
import { createParser } from '../../1-grammar/grammar-src/parser'
import { transform } from '../ast-gen-src/Transform'

Tests.test('an app becomes semantic declarations and names with source origins', async () => {
  const source = (await Tests.readApp('Hello World')).split('\n\n')[0]!
  const timings = new Timings('transform-test')
  const { tree } = createParser().parse(source)
  const result = transform(tree, timings)
  Tests.expect(result?.root).toEqual({
    kind: 'File',
    start: 0,
    end: 34,
    declarations: [{
      kind: 'AppDeclaration',
      start: 0,
      end: 34,
      name: { kind: 'Name', start: 4, end: 14, value: 'HelloWorld' },
      root: { kind: 'Name', start: 24, end: 32, value: 'RootView' },
    }],
  })
  const { root } = result!
  const app = root.declarations[0]!
  if (!AST.IsAppDeclaration(app)) {
    Errors.ThrowUnexpected('Expected app')
  }
  const second = transform(tree)
  Tests.expect(second?.root).not.toBe(root)
  Tests.expect(second?.root.declarations[0]?.start).toBe(app.start)
  Tests.expect(timings.samples.map(sample => [sample.name, sample.status])).toEqual([
    ['transformer.transform', 'succeeded'],
  ])
})

Tests.test('an unfinished app produces no AST', async () => {
  const source = (await Tests.readApp('Hello World')).split('\n\n')[0]!
  const { tree } = createParser().parse(source.slice(0, -1))
  Tests.expect(tree.rootNode.hasError).toBe(true)
  Tests.expect(transform(tree)).toBeUndefined()
})

Tests.test('Hello World transforms generic renders and native injections', async () => {
  const source = await Tests.readApp('Hello World')
  const { tree } = createParser().parse(source)
  const result = transform(tree)
  Tests.expect<unknown>(result?.root.declarations[1]).toEqual({
    kind: 'ViewDeclaration',
    start: 36,
    end: 96,
    name: { kind: 'Name', start: 41, end: 49, value: 'RootView' },
    parameters: [],
    definitions: [],
    render: {
      kind: 'ViewRender',
      start: 61,
      end: 94,
      target: { kind: 'Name', start: 61, end: 64, value: source.slice(61, 64) },
      arguments: [],
      children: [{
        kind: 'ViewRender',
        start: 71,
        end: 90,
        target: { kind: 'Name', start: 71, end: 75, value: 'Text' },
        arguments: [{ kind: 'TextLiteral', start: 76, end: 89, value: 'Hello World' }],
        children: [],
      }],
    },
  })
})
