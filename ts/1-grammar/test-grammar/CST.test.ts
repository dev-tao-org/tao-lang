import * as CST from '@cst'
import { S } from '@shared'
import * as Tests from '@shared-tests'

import { createParser } from '../grammar-src/parser'

Tests.test('CST helpers > distinguish grammar extras, comments, and required fields', () => {
  const root = createParser().parse(S`
    // heading
    view Main { render Text("Hi") }
  `).rootNode
  const declaration = root.namedChildren.find(node => node.type === 'ViewDeclaration')!
  Tests.expect(root.namedChildren.filter(CST.IsSemanticNode).map(node => node.type)).toEqual(['ViewDeclaration'])
  Tests.expect(root.namedChildren.filter(CST.IsComment).map(node => node.text)).toEqual(['// heading'])
  Tests.expect(CST.IsSemanticNode({ isExtra: true })).toBe(false)
  Tests.expect(CST.IsComment({ type: 'OtherExtra' })).toBe(false)
  Tests.expect(CST.RequiredField(declaration, 'name').text).toBe('Main')
  Tests.expect(() => CST.RequiredField(declaration, 'missing')).toThrow('Missing CST field missing')
})
