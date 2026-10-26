import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { FileSystem, Tests } from '@shared/os'
import { prepareSidecarPipeline } from '../SidecarPipeline'
import { createProgramFor, recordingExecutor, withFixture } from './SidecarPipelineFixtures'

Tests.test('collects foreign views nested inside an owning view', async () =>
  await withFixture(async fixture => {
    const document = transform(
      createParser().parse(
        'app Calendar { root Wrapper } view Wrapper { render Text("wrapper") view FormattedDate(Value text) from ./FormattedDate.tsx }',
      ),
    )!
    const prepared = await prepareSidecarPipeline({
      ...fixture,
      program: createProgramFor(fixture.taoPath, document),
      executor: recordingExecutor(() => {}),
    })
    const snapshot = prepared.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')
    Tests.expect(await FileSystem.readFile(snapshot, 'utf8')).toContain('FormattedDate')
  }))
