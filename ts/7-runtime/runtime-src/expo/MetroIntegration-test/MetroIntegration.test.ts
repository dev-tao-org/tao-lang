import { Errors, S, Time, Try } from '@shared'
import { Artifacts, Env, FileSystem, Http, MetroPlatform, Path, Platform, Repo, Tests } from '@shared/os'
import * as Runtime from '../../Runtime'
import type { ExpoSession } from '../Expo'
import type { GeneratedRevision } from '../PreviewProtocol'
import { delayPreload } from './DelayPreload'
import { verifyMetroBurst } from './MetroStress'

type MetroRevisionNotice = { revision: string }

type MetroSocketMessage = { type: string; tao?: MetroRevisionNotice; body?: unknown }

type MetroReadStatus = {
  held: boolean
  before: string
  after: string
  publicationRequests: number
  sourceRequests: number
}

Tests.test(
  'Metro freezes delayed initial reads through HMR attachment and repairs coupled generated-file failures',
  async () => {
    const directory = Artifacts.resolvePath('tmp/metro-admission', Platform.randomUUID())
    const application = await Runtime.create({
      directory,
      dependencyDirectory: Repo.resolvePath('ts/7-runtime/node_modules'),
    })
    const preload = Path.join(directory, 'delay-preload.cjs')
    const publishBeforeAdmission = Env.get('TAO_METRO_EARLY_PUBLICATION_PROBE') === '1'
    await FileSystem.writeFile(preload, delayPreload(application.metroPreloadPath!, publishBeforeAdmission))
    const configuration = Path.join(directory, 'metro.config.js')
    const source = await FileSystem.readFile(configuration, 'utf8')
    await FileSystem.writeFile(configuration, `${source}\nmodule.exports.watcher.unstable_lazySha1 = false;\n`)
    application.metroPreloadPath = preload
    application.generated = createRevision('A', 0)
    const session = await Runtime.start(application)
    await Try(() => verifyOverlapAndRepair(session, publishBeforeAdmission), {
      async finally() {
        await session.dispose()
        await FileSystem.rm(directory, { recursive: true, force: true })
      },
    })
  },
  60_000,
)

async function verifyOverlapAndRepair(session: ExpoSession, publishBeforeAdmission: boolean): Promise<void> {
  const bundleUrl = `${session.url}/Application.bundle?platform=web&dev=true&minify=false&lazy=false`
  await Http.request(`${session.url}/__tao_test/arm`)
  const initial = Http.request(bundleUrl).then(response => response.text())
  await waitFor(async () => (await readStatus(session.url)).held === true)
  const socket = MetroPlatform.openWebSocket(`${session.url.replace('http:', 'ws:')}/hot`)
  const messages: MetroSocketMessage[] = []
  socket.addEventListener('message', event => messages.push(JSON.parse(String(event.data))))
  await waitFor(async () => socket.readyState === 1)
  socket.send(JSON.stringify({ type: 'register-entrypoints', entryPoints: [bundleUrl] }))
  let published = false
  const pending = session.publish(createRevision('B', 1)).then(outcome => {
    published = true
    return outcome
  })
  if (publishBeforeAdmission) {
    await waitFor(async () => published)
  } else {
    await waitFor(async () => (await readStatus(session.url)).publicationRequests === 1)
  }
  const advancedWhileReaderHeld = published
  await Http.request(`${session.url}/__tao_test/release`)
  const firstBundle = await initial
  const publication = await pending
  Tests.expect(advancedWhileReaderHeld).toBe(false)
  Tests.expect(firstBundle).toContain('APP_A')
  Tests.expect(firstBundle).toContain('HELPER_A')
  Tests.expect(firstBundle).not.toContain('HELPER_B')
  Tests.expect(publication).toMatchObject({ status: 'published', publishedRevision: 'B' })
  await waitFor(async () => messages.some(message => message.type === 'bundle-registered'))
  await waitFor(async () => messages.some(message => message.type === 'update' && message.tao?.revision === 'B'))
  const delayed = await readStatus(session.url)
  Tests.expect(delayed.before).toBe("export const helper = 'HELPER_A';")
  Tests.expect(delayed.after).toBe(delayed.before)
  await verifyMultipleGroups(session, bundleUrl, messages)
  await verifyGeneratedFailures(session, messages)
  await verifyMetroBurst(session, createRevision)
  await verifyPoisonedSession(session)
  socket.close()
}

async function verifyGeneratedFailures(
  session: ExpoSession,
  messages: MetroSocketMessage[],
): Promise<void> {
  const added = createRevision('C', 4, true)
  await Http.request(`${session.url}/__tao_test/fail`)
  Tests.expect(await session.publish(added)).toMatchObject({ status: 'error', publishedRevision: 'B_PENDING' })
  Tests.expect((await (await Http.request(`${session.url}/__tao/session`)).json() as { revision: string }).revision)
    .toBe('B_PENDING')
  Tests.expect(await session.publish({ ...added, revision: 'C2', sequence: 5 })).toMatchObject({ status: 'published' })
  const removed = { ...added, revision: 'D', sequence: 6, files: { ...added.files } }
  delete removed.files['extra.ts']
  Tests.expect(await session.publish(removed)).toMatchObject({ status: 'error', publishedRevision: 'D' })
  Tests.expect(messages.some(message => message.type === 'error' && message.tao?.revision === 'D')).toBe(true)
  Tests.expect(await session.publish({ ...added, revision: 'E', sequence: 7 })).toMatchObject({ status: 'published' })
  Tests.expect(await session.publish({ ...added, revision: 'F', sequence: 8 })).toMatchObject({
    status: 'noop',
    publishedRevision: 'E',
  })
}

async function verifyMultipleGroups(
  session: ExpoSession,
  originalBundleUrl: string,
  primary: MetroSocketMessage[],
): Promise<void> {
  const bundleUrl = originalBundleUrl.replace('dev=true', 'dev=false')
  Tests.expect((await Http.request(bundleUrl)).ok).toBe(true)
  const socket = MetroPlatform.openWebSocket(`${session.url.replace('http:', 'ws:')}/hot`)
  const secondary: typeof primary = []
  socket.addEventListener('message', event => secondary.push(JSON.parse(String(event.data))))
  await waitFor(async () => socket.readyState === 1)
  socket.send(JSON.stringify({ type: 'register-entrypoints', entryPoints: [bundleUrl] }))
  await waitFor(async () => secondary.some(message => message.type === 'bundle-registered'))
  await Http.request(`${session.url}/__tao_test/arm`)
  let firstDone = false
  const first = session.publish(createRevision('B_GROUPS', 2)).then(result => {
    firstDone = true
    return result
  })
  await waitFor(async () => (await readStatus(session.url)).held)
  let sourceCompleted = false
  const source = Http.request(`${session.url}/%5Bmetro-project%5D/src/App.tsx`).then(response => {
    sourceCompleted = true
    return response
  })
  let pendingCompleted = false
  const pending = session.publish(createRevision('B_PENDING', 3)).then(result => {
    pendingCompleted = true
    return result
  })
  await waitFor(async () => {
    const status = await readStatus(session.url)
    return status.publicationRequests === 2 && status.sourceRequests >= 1
  })
  const completedTooSoon = firstDone
  const sourceCompletedTooSoon = sourceCompleted
  const pendingCompletedTooSoon = pendingCompleted
  await Http.request(`${session.url}/__tao_test/release`)
  Tests.expect(await first).toMatchObject({ status: 'published' })
  Tests.expect(await pending).toMatchObject({ status: 'published' })
  Tests.expect(completedTooSoon).toBe(false)
  Tests.expect(sourceCompletedTooSoon).toBe(false)
  Tests.expect(pendingCompletedTooSoon).toBe(false)
  const sourceResponse = await source
  Tests.expect(sourceResponse.headers.get('x-tao-revision')).toBe('B_GROUPS')
  Tests.expect(await sourceResponse.text()).toContain('APP_B_GROUPS')
  for (const messages of [primary, secondary]) {
    for (const revision of ['B_GROUPS', 'B_PENDING']) {
      const update = messages.find(message => message.type === 'update' && message.tao?.revision === revision)
      Tests.expect(JSON.stringify(update)).toContain(`APP_${revision}`)
      Tests.expect(JSON.stringify(update)).toContain(`HELPER_${revision}`)
    }
  }
  socket.close()
}

async function verifyPoisonedSession(session: ExpoSession): Promise<void> {
  await Http.request(`${session.url}/__tao_test/poison`)
  Tests.expect(await session.publish(createRevision('POISON', 200))).toMatchObject({ status: 'poisoned' })
  Tests.expect(await session.publish(createRevision('AFTER_POISON', 201))).toMatchObject({ status: 'poisoned' })
}

function createRevision(revision: string, sequence: number, extra = false): GeneratedRevision {
  return {
    revision,
    sequence,
    files: {
      'App.tsx': S`
        import React from '@runtime/client/Bridge-React';
        import ReactNative from '@runtime/client/Bridge-ReactNative';
        import { helper } from './helper';
        ${extra ? "import { extra } from './extra';" : ''}
        export default function App() { return React.createElement(ReactNative.Text, null, 'APP_${revision}' + helper ${
        extra ? '+ extra' : ''
      }); }
      `,
      'helper.ts': `export const helper = 'HELPER_${revision}';`,
      ...(extra ? { 'extra.ts': "export const extra = 'ADDED_MODULE';" } : {}),
    },
  }
}

async function readStatus(url: string): Promise<MetroReadStatus> {
  return await (await Http.request(`${url}/__tao_test/status`)).json() as MetroReadStatus
}

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = Time.nowMs() + 20_000
  while (!await predicate()) {
    if (Time.nowMs() >= deadline) {
      Errors.ThrowHostEnvironment('Metro admission fixture did not reach its expected stage.')
    }
    await Time.sleep(5)
  }
}
