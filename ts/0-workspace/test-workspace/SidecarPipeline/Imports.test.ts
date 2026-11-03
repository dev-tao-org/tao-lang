import { S } from '@shared'
import * as Tests from '@shared-tests'

import { collectModuleSpecifiers } from '../../workspace-src/SidecarPipeline/Imports'

Tests.test('sidecar import closure includes TypeScript module forms and ignores non-code text', () => {
  const source = S`
    import {
      type Foo,
      bar,
    } from '../sidecar-pipeline/helper'
    export * from '../sidecar-pipeline/re-export'
    const lazy = import('../sidecar-pipeline/lazy')
    const common = require('./common')
    const ordinary = "import value from '../sidecar-pipeline/string-false-positive'"
    const template = \`import('../sidecar-pipeline/template-false-positive')\`
    // import real from '../sidecar-pipeline/comment-false-positive'
  `
  Tests.expect(collectModuleSpecifiers(source)).toEqual([
    './helper',
    './re-export',
    './lazy',
    './common',
  ])
})
