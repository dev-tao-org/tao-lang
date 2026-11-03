import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as Tests from '@shared-tests'

import { FS } from '@shared/os'
import { prepareSidecarPipeline } from '../../workspace-src/SidecarPipeline'
import { createProgramFor, recordingExecutor, withFixture } from './SidecarPipeline.test-fixtures'

Tests.test('collects foreign views nested inside an owning view', async () =>
  await withFixture(async fixture => {
    const document = AST.transform(
      Grammar.createParser().parse(
        'app Calendar { root Wrapper } view Wrapper { render Text("wrapper") view FormattedDate(Value text) from ./FormattedDate.tsx }',
      ),
    )!
    const prepared = await prepareSidecarPipeline({
      ...fixture,
      program: createProgramFor(fixture.taoPath, document),
      executor: recordingExecutor(() => {}),
    })
    const snapshot = prepared.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')
    Tests.expect(await FS.readFile(snapshot, 'utf8')).toContain('FormattedDate')
  }))
