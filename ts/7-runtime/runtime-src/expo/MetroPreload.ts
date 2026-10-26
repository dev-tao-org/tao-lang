import { Errors, Try } from '@shared'
import * as Env from '../../../shared/shared-src/os/Env'
import * as FileSystem from '../../../shared/shared-src/os/FileSystem'
import * as MetroPlatform from '../../../shared/shared-src/os/MetroPlatform'
import { createMetroAdapter, type MetroServer } from './MetroAdapter'
import type { GeneratedRevision } from './PreviewProtocol'

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
        const text = await MetroPlatform.readRequestText(request, 32 * 1024 * 1024)
        const revision = JSON.parse(text) as GeneratedRevision
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

type Middleware = (
  request: MetroPlatform.IncomingRequest,
  response: MetroPlatform.OutgoingResponse,
  next: (error?: unknown) => void,
) => void

const sessionId = requireEnvironment('TAO_METRO_SESSION')
const token = requireEnvironment('TAO_METRO_TOKEN')
const initial = JSON.parse(FileSystem.readFileSync(requireEnvironment('TAO_METRO_SEED'), 'utf8')) as GeneratedRevision
const adapter = createMetroAdapter({ directory: MetroPlatform.currentDirectory(), sessionId, initial })

function requireEnvironment(name: string): string {
  return Env.get(name) ?? Errors.ThrowHostEnvironment(`Missing Metro preload setting: ${name}`)
}

function respond(response: MetroPlatform.OutgoingResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  response.end(JSON.stringify(value))
}
