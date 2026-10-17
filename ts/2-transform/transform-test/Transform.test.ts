import { Timings } from '@shared'
import { Tests } from '@shared/os'
import { createParser } from '../../1-grammar/grammar-src/parser'
import { transform } from '../transform-src/Transform'

Tests.test('an app becomes semantic declarations and names with source origins', async () => {
  const source = (await Tests.readApp('Hello World')).split('\n\n')[0]!
  const timings = new Timings('transform-test')
  const { tree } = createParser().parse(source)
  const result = transform(tree, timings)
  Tests.expect(result?.root).toEqual({
    kind: 'File',
    declarations: [{
      kind: 'AppDeclaration',
      name: { kind: 'Name', value: 'HelloWorld' },
      root: { kind: 'Name', value: 'RootView' },
    }],
  })
  const { root, origins } = result!
  const app = root.declarations[0]!
  Tests.expect(origins.size).toBe(4)
  Tests.expect(origins.get(root)).toEqual({ start: 0, end: 34 })
  Tests.expect(origins.get(app)).toEqual({ start: 0, end: 34 })
  Tests.expect(origins.get(app.name)).toEqual({ start: 4, end: 14 })
  Tests.expect(origins.get(app.root)).toEqual({ start: 24, end: 32 })
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

Tests.test('next: Hello World also transforms its generic view render', async () => {
  const { tree } = createParser().parse(await Tests.readApp('Hello World'))
  const result = transform(tree)
  Tests.expect<unknown>(result?.root.declarations[1]).toEqual({
    kind: 'ViewDeclaration',
    name: { kind: 'Name', value: 'RootView' },
    render: {
      kind: 'ViewRender',
      target: { kind: 'Name', value: 'Col' },
      arguments: [],
      children: [{
        kind: 'ViewRender',
        target: { kind: 'Name', value: 'Text' },
        arguments: [{ kind: 'TextLiteral', value: 'Hello World' }],
        children: [],
      }],
    },
  })
})
