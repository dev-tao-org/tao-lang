import { Json } from '@shared'
import * as Tests from '@shared-tests'
import { Http } from '@shared/web'
import { createPublicationTransport } from '../../runtime-src/expo/Expo/ExpoPublicationTransport'

Tests.test('a publication deadline faults its session even when the request ignores cancellation', async () => {
  let requests = 0
  const request: typeof Http.request = async () => {
    requests++
    return await new Promise(() => {})
  }
  const transport = createPublicationTransport('session', 'token', 'A', request, 5)
  const first = await transport.publish('http://unused', { revision: 'B', sequence: 1, files: {} })
  Tests.expect(first).toMatchObject({ status: 'poisoned', publishedRevision: 'A' })
  Tests.expect(first.message).toContain('timed out')
  Tests.expect(await transport.publish('http://unused', { revision: 'C', sequence: 2, files: {} }))
    .toMatchObject({ status: 'poisoned' })
  Tests.expect(requests).toBe(1)
})

Tests.test('disposing an Expo session settles an outstanding publication independently of fetch cancellation', async () => {
  const transport = createPublicationTransport('session', 'token', 'A', async () => await new Promise(() => {}))
  const pending = transport.publish('http://unused', { revision: 'B', sequence: 1, files: {} })
  transport.dispose()
  Tests.expect(await pending).toMatchObject({ status: 'poisoned', publishedRevision: 'A' })
})

Tests.test('older publication responses cannot regress a newer served identity', async () => {
  const responses = new Map<string, (response: Http.HttpResponse) => void>()
  const request: typeof Http.request = async (_url, init) => {
    const revision = Json.Parse(String(init?.body)) as { revision: string }
    return await new Promise(resolve => responses.set(revision.revision, resolve))
  }
  const transport = createPublicationTransport('session', 'token', 'A', request)
  const earlier = transport.publish('http://unused', { revision: 'B', sequence: 1, files: {} })
  const later = transport.publish('http://unused', { revision: 'C', sequence: 2, files: {} })
  responses.get('C')!(
    Http.jsonResponse({
      sessionId: 'session',
      revision: 'C',
      sequence: 2,
      status: 'published',
      publishedRevision: 'C',
    }),
  )
  await later
  responses.get('B')!(
    Http.jsonResponse({
      sessionId: 'session',
      revision: 'B',
      sequence: 1,
      status: 'published',
      publishedRevision: 'B',
    }),
  )
  await earlier
  const pending = transport.publish('http://unused', { revision: 'D', sequence: 3, files: {} })
  transport.dispose()
  Tests.expect(await pending).toMatchObject({ status: 'poisoned', publishedRevision: 'C' })
})
