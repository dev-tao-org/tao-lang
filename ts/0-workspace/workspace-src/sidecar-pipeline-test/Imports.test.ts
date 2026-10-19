import { S } from '@shared'
import { Tests } from '@shared/os'
import { moduleSpecifiers } from '../sidecar-pipeline/Imports'

Tests.test('sidecar import closure includes TypeScript module forms and ignores non-code text', () => {
  const source = S`
    import {
      type Foo,
      bar,
    } from './helper'
    export * from './re-export'
    const lazy = import('./lazy')
    const common = require('./common')
    const ordinary = "import value from './string-false-positive'"
    const template = \`import('./template-false-positive')\`
    // import real from './comment-false-positive'
  `
  Tests.expect(moduleSpecifiers(source)).toEqual([
    './helper',
    './re-export',
    './lazy',
    './common',
  ])
})
