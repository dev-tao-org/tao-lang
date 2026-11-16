import { Json } from '@shared'
import { Try } from '@shared'
import * as MetroPlatform from '@shared/os/metro'

import { parseGeneratedRevision } from '../GeneratedRevision'
import type { GeneratedRevision } from '../PreviewProtocol'
import { createMetroAdapter, type MetroServer } from './MetroAdapter'

type Middleware = (
  request: MetroPlatform.NodeHttp.IncomingRequest,
  response: MetroPlatform.NodeHttp.OutgoingResponse,
  next: (error?: unknown) => void,
) => void
const PublicationLimitBytes = 32 * 1024 * 1024
/** enhanceMiddleware binds the preloaded memory owner to Expo's existing Metro HTTP server. */
export function enhanceMiddleware(middleware: Middleware, metro: MetroServer): Middleware {
  adapter.attach(metro)
  return (request, response, next) => {
    if (request.url === '/__tao/session' && request.method === 'GET') {
      const current = adapter.owner.current()
      respond(response, 200, { sessionId, revision: current.revision, sequence: current.sequence })
    } else if (request.url === '/__tao/publish' && request.method === 'POST') {
      if (request.headers.authorization !== `Bearer ${token}`) {
        respond(response, 403, { message: 'Publication is restricted to this Tao session.' })
        return
      }
      void Try(async () => {
        const text = await MetroPlatform.NodeHttp.readRequestText(
          request,
          PublicationLimitBytes,
          'Generated publication exceeds its supported size.',
        )
        const revision = parseGeneratedRevision(text) as GeneratedRevision
        respond(response, 200, await adapter.owner.publish(revision))
      }, {
        catch(error) {
          respond(response, 400, { message: String(error) })
        },
      })
    } else {
      middleware(request, response, next)
    }
  }
}

const sessionId = MetroPlatform.Env.require('TAO_METRO_SESSION')
const token = MetroPlatform.Env.require('TAO_METRO_TOKEN')
const initial = parseGeneratedRevision(
  MetroPlatform.FS.readFileSync(MetroPlatform.Env.require('TAO_METRO_SEED'), 'utf8'),
) as GeneratedRevision
const adapter = createMetroAdapter({ directory: MetroPlatform.currentDirectory(), sessionId, initial })

function respond(response: MetroPlatform.NodeHttp.OutgoingResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  response.end(Json.Print(value, { prettyPrint: false }))
}
