import { Json } from '@shared'
import { NewlineCharacter, Time } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { Http } from '@shared/web'
import type { ExpoSession } from '../../runtime-src/expo/Expo/Expo'
import type { GeneratedRevision } from '../../runtime-src/expo/PreviewProtocol'

type MetroUpdate = { type: string; tao?: { revision: string } }
/** verifyCoupledUpdates checks every HMR group received each complete app/helper revision. */
export function verifyCoupledUpdates(groups: readonly (readonly MetroUpdate[])[], revisions: readonly string[]): void {
  for (const messages of groups) {
    for (const revision of revisions) {
      const update = messages.find(message => message.type === 'update' && message.tao?.revision === revision)
      Tests.expect(Json.Print(update)).toContain(`APP_${revision}`)
      Tests.expect(Json.Print(update)).toContain(`HELPER_${revision}`)
    }
  }
}

/** verifyMetroBurst exercises a larger complete namespace through one real server without a timing claim. */
export async function verifyMetroBurst(
  session: ExpoSession,
  createRevision: (revision: string, sequence: number) => GeneratedRevision,
): Promise<void> {
  const before = await readMemoryUsage(session.url)
  const extraFiles = createLargerNamespace()
  const startedAt = Time.nowMs()
  const requests = Array.from({ length: 100 }, (_, index) => {
    const revision = createRevision(`BURST_${index}`, index + 10)
    const app = `${revision.files['App.tsx']}${NewlineCharacter}export { large } from './large';${NewlineCharacter}`
    return session.publish({ ...revision, files: { ...revision.files, ...extraFiles, 'App.tsx': app } })
  })
  const outcomes = await Promise.all(requests)
  const publicationBurstMs = Time.nowMs() - startedAt
  Tests.expect(outcomes.every(outcome => outcome.status === 'published' || outcome.status === 'superseded')).toBe(true)
  Tests.expect(outcomes.some(outcome => outcome.status === 'superseded')).toBe(true)
  Tests.expect(outcomes[99]).toMatchObject({ status: 'published', publishedRevision: 'BURST_99' })
  const response = await Http.request(`${session.url}/Application.bundle?platform=web&dev=true&minify=false&lazy=false`)
  const bundle = await response.text()
  Tests.expect(bundle).toContain('APP_BURST_99')
  Tests.expect(bundle).toContain('HELPER_BURST_99')
  Tests.expect(bundle).not.toContain('APP_BURST_98')
  const after = await readMemoryUsage(session.url)
  Tests.expect(bundle).toContain('LARGE_GRAPH_63')
  const report = {
    before,
    after,
    generatedFiles: 67,
    requests: 100,
    publicationBurstMs,
    outcomes,
    boundary: 'RSS observations only; no GC baseline or soak claim.',
  }
  const path = Artifacts.resolvePath('notes/radical-preview', `metro-burst-${Platform.randomUUID()}.json`)
  await FS.mkdir(Path.dirname(path))
  await FS.writeFile(path, Json.Print(report))
}

function createLargerNamespace(): Record<string, string> {
  const names = Array.from({ length: 64 }, (_, index) => index)
  const files = Object.fromEntries(names.map(index => [
    `large/part${index}.ts`,
    `export const value${index} = ${Json.Print(`LARGE_GRAPH_${index}:${'x'.repeat(1024)}`)};`,
  ]))
  const imports = names.map(index => `import { value${index} } from './large/part${index}';`).join(NewlineCharacter)
  const values = names.map(index => `value${index}`).join(', ')
  return {
    ...files,
    'large.ts': `${imports}${NewlineCharacter}export const large = [${values}].join('');${NewlineCharacter}`,
  }
}

async function readMemoryUsage(url: string): Promise<number> {
  return (await (await Http.request(`${url}/__tao_test/status`)).json() as { rss: number }).rss
}
