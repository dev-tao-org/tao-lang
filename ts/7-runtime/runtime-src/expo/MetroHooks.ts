import { Errors, Try } from '@shared'
import * as MetroPlatform from '../../../shared/shared-src/os/MetroPlatform'
import * as ExpoCli from '../bridges/Bridge_expo-cli/Bridge_expo-cli'
import * as ExpoFileMap from '../bridges/Bridge_expo-metro-file-map'
import * as ExpoMetro from '../bridges/Bridge_expo-metro/Bridge_expo-metro'
import * as Metro from '../bridges/Bridge_metro'
import type { MetroAdmission } from './MetroAdmission'
import { type HmrSocket, limitHmrSocketQueue } from './MetroSocket'
import type { GeneratedRevision } from './PreviewProtocol'

/** installMetroHooks admits all supported source-consuming Metro operations before graph reads.
 *  Pin guards deliberately reject unknown private surfaces. Delta listeners reserve before debounce;
 *  HMR leases include complete payload serialization and every synchronous websocket send. */
export function installMetroHooks(options: MetroHookOptions): void {
  assertVersion(ExpoMetro.readVersion(options.directory), 'Expo Metro', '56.0.2')
  assertVersion(ExpoCli.readVersion(options.directory), 'Expo CLI', '57.0.31')
  assertVersion(ExpoFileMap.readVersion(options.directory), 'Expo file map', '57.0.4')
  const metroVersion = Metro.readVersion(options.directory)
  if (metroVersion !== '0.84.5') {
    Errors.ThrowHostEnvironment(`Unsupported underlying Metro version: ${metroVersion}.`)
  }
  const server = ExpoMetro.loadPrototype('Server', options.directory)
  const hmr = ExpoMetro.loadPrototype('HmrServer', options.directory)
  assertTimerPatches(options.directory, hmr)
  const delta = ExpoMetro.loadPrototype('DeltaBundler', options.directory)
  for (const name of ['build', 'getRamBundleInfo', 'getAssets', 'getOrderedDependencyPaths']) {
    admitMethod(server, name, options.admission)
  }
  wrapHttpRequests(server, options)
  wrapRegistration(hmr, options)
  wrapHmrCompletion(hmr, options)
  wrapChangeListeners(delta, options)
  boundHmrSockets(options.directory)
}

/** MetroHookOptions connects private Metro lifecycle boundaries to the publication owner. */
export type MetroHookOptions = {
  directory: string
  sessionId: string
  admission: MetroAdmission
  current(): GeneratedRevision
  reportError(message: string): void
  reportFatal(message: string): void
}

type MetroMethod = ExpoMetro.MetroMethod
type MetroPrototype = ExpoMetro.MetroPrototype
type Send = (message: string) => void
type Client = { sendFn: Send }
type HmrSocketServer = { prependListener(event: 'connection', listener: (socket: HmrSocket) => void): void }

function assertVersion(version: string, name: string, expected: string): void {
  if (version !== expected) {
    Errors.ThrowHostEnvironment(`Unsupported Metro dependency ${name}: expected ${expected}, got ${version}.`)
  }
}

function assertTimerPatches(directory: string, hmr: MetroPrototype): void {
  const registration = requireMethod(hmr, '_registerEntryPoint').toString()
  const requireSource = ExpoCli.readRequireSource(directory)
  const hmrPatched = /},\s*0,\s*\)/.test(registration)
  const refreshPatched = /Refresh\.performReactRefresh\(\);\s*}, 0\)/.test(requireSource)
  if (!hmrPatched || !refreshPatched) {
    Errors.ThrowHostEnvironment('Metro requires the pinned asynchronous HMR and Refresh timer patches.')
  }
}

function requireMethod(prototype: MetroPrototype, name: string): MetroMethod {
  if (typeof prototype[name] !== 'function') {
    Errors.ThrowHostEnvironment(`Unsupported Metro surface: ${name}. Restart with the pinned runtime.`)
  }
  return prototype[name]
}

function admitMethod(prototype: MetroPrototype, name: string, admission: MetroAdmission): void {
  const original = requireMethod(prototype, name)
  prototype[name] = function(...arguments_) {
    return admission.read(async () => await original.apply(this, arguments_))
  }
}

function wrapHttpRequests(prototype: MetroPrototype, options: MetroHookOptions): void {
  const original = requireMethod(prototype, '_processRequest')
  prototype._processRequest = function(...arguments_) {
    const request = arguments_[0] as MetroPlatform.IncomingRequest
    const response = arguments_[1] as MetroPlatform.OutgoingResponse
    if (!consumesSource(request.url ?? '')) {
      return original.apply(this, arguments_)
    }
    return options.admission.read(async () => {
      const revision = options.current()
      response.setHeader('x-tao-session', options.sessionId)
      response.setHeader('x-tao-revision', revision.revision)
      response.setHeader('x-tao-sequence', String(revision.sequence))
      return await original.apply(this, arguments_)
    })
  }
}

function consumesSource(url: string): boolean {
  const path = url.split('?')[0]
  const decodedPath = path.split('/').map(segment => decodeURIComponent(segment)).join('/')
  return /\.(bundle|map|assets)$/.test(path) || path === '/symbolicate'
    || decodedPath.startsWith('/[metro-project]/') || decodedPath.startsWith('/[metro-watchFolders]/')
}

function wrapRegistration(prototype: MetroPrototype, options: MetroHookOptions): void {
  const original = requireMethod(prototype, '_registerEntryPoint')
  const clients = new WeakSet<object>()
  prototype._registerEntryPoint = function(...arguments_) {
    const client = arguments_[0] as Client
    if (!clients.has(client)) {
      client.sendFn = wrapSend(client.sendFn, options)
      clients.add(client)
    }
    arguments_[2] = wrapSend(arguments_[2] as Send, options)
    return Try(() => options.admission.read(async () => await original.apply(this, arguments_)), {
      catch(error) {
        options.reportError(String(error))
        client.sendFn(JSON.stringify({ type: 'error', body: { type: 'InternalError', message: String(error) } }))
      },
    })
  }
}

function wrapHmrCompletion(prototype: MetroPrototype, options: MetroHookOptions): void {
  const original = requireMethod(prototype, '_handleFileChange')
  prototype._handleFileChange = function(...arguments_) {
    return Try(() => options.admission.read(async () => await original.apply(this, arguments_)), {
      catch(error) {
        options.reportFatal(String(error))
      },
    })
  }
}

function wrapSend(send: Send, options: MetroHookOptions): Send {
  return message => {
    const payload = JSON.parse(message) as { type: string; body?: unknown; tao?: unknown }
    const current = options.current()
    payload.tao = { sessionId: options.sessionId, revision: current.revision, sequence: current.sequence }
    if (payload.type === 'error') {
      options.reportError(JSON.stringify(payload.body))
    }
    send(JSON.stringify(payload))
  }
}

function wrapChangeListeners(prototype: MetroPrototype, options: MetroHookOptions): void {
  const original = requireMethod(prototype, 'listen')
  prototype.listen = function(...arguments_) {
    const callback = arguments_[1] as (event: unknown) => Promise<unknown>
    arguments_[1] = (event: unknown) =>
      Try(() => options.admission.schedule(() => callback(event)), {
        catch(error) {
          options.reportError(String(error))
        },
      })
    return original.apply(this, arguments_)
  }
}

function boundHmrSockets(directory: string): void {
  const module = ExpoMetro.loadSocketFactory<{
    default(...arguments_: unknown[]): HmrSocketServer
  }>(directory)
  const createServer = module.default
  if (typeof createServer !== 'function') {
    Errors.ThrowHostEnvironment('Unsupported Metro HMR socket factory.')
  }
  module.default = (...arguments_) => {
    const server = createServer(...arguments_)
    server.prependListener('connection', socket => limitHmrSocketQueue(socket))
    return server
  }
}
