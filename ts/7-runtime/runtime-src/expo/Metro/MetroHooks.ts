import { Json } from '@shared'
import { Errors, Try } from '@shared'
import * as MetroPlatform from '@shared/os/metro'
import * as ExpoCli from '../../bridges/Bridge_expo-cli/Bridge_expo-cli'
import * as ExpoFileMap from '../../bridges/Bridge_expo-metro-file-map'
import * as ExpoMetro from '../../bridges/Bridge_expo-metro/Bridge_expo-metro'
import * as Metro from '../../bridges/Bridge_metro'
import type { GeneratedRevision } from '../PreviewProtocol'
import type { MetroAdmission } from './MetroAdmission'
import { type HmrSocket, limitHmrSocketQueue } from './MetroSocket'

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
type HmrPayload = { type: string; body?: unknown; tao?: unknown }
type HmrSocketServer = { prependListener(event: 'connection', listener: (socket: HmrSocket) => void): void }

function assertVersion(version: string, name: string, expected: string): void {
  if (version !== expected) {
    Errors.ThrowHostEnvironment(`Unsupported Metro dependency ${name}: expected ${expected}, got ${version}.`)
  }
}

const HmrTimerPatchRegx = /},\s*0,\s*\)/
const RefreshTimerPatchRegx = /Refresh\.performReactRefresh\(\);\s*}, 0\)/
function assertTimerPatches(directory: string, hmr: MetroPrototype): void {
  const registration = requireMethod(hmr, '_registerEntryPoint').toString()
  const requireSource = ExpoCli.readRequireSource(directory)
  const hmrPatched = HmrTimerPatchRegx.test(registration)
  const refreshPatched = RefreshTimerPatchRegx.test(requireSource)
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
  prototype[name] = function(...args) {
    return admission.read(async () => await original.apply(this, args))
  }
}

function wrapHttpRequests(prototype: MetroPrototype, options: MetroHookOptions): void {
  const original = requireMethod(prototype, '_processRequest')
  prototype._processRequest = function(...args) {
    const request = args[0] as MetroPlatform.NodeHttp.IncomingRequest
    const response = args[1] as MetroPlatform.NodeHttp.OutgoingResponse
    if (!consumesSource(request.url ?? '')) {
      return original.apply(this, args)
    }
    return options.admission.read(async () => {
      const revision = options.current()
      response.setHeader('x-tao-session', options.sessionId)
      response.setHeader('x-tao-revision', revision.revision)
      response.setHeader('x-tao-sequence', String(revision.sequence))
      return await original.apply(this, args)
    })
  }
}

function consumesSource(url: string): boolean {
  const path = url.split('?')[0]
  const decodedPath = path.split('/').map(segment => decodeURIComponent(segment)).join('/')
  return isMetroAssetPath(path) || path === '/symbolicate' || isMetroWorkspacePath(decodedPath)
}

const MetroAssetExtensionRegx = /\.(bundle|map|assets)$/
function isMetroAssetPath(path: string): boolean {
  return MetroAssetExtensionRegx.test(path)
}

function isMetroWorkspacePath(path: string): boolean {
  return path.startsWith('/[metro-project]/') || path.startsWith('/[metro-watchFolders]/')
}

function wrapRegistration(prototype: MetroPrototype, options: MetroHookOptions): void {
  const original = requireMethod(prototype, '_registerEntryPoint')
  const clients = new WeakSet<object>()
  prototype._registerEntryPoint = function(...args) {
    const client = args[0] as Client
    if (!clients.has(client)) {
      client.sendFn = wrapSend(client.sendFn, options)
      clients.add(client)
    }
    args[2] = wrapSend(args[2] as Send, options)
    return Try(() => options.admission.read(async () => await original.apply(this, args)), {
      catch(error) {
        options.reportError(String(error))
        client.sendFn(serializeInternalHmrError(error))
      },
    })
  }
}

function wrapHmrCompletion(prototype: MetroPrototype, options: MetroHookOptions): void {
  const original = requireMethod(prototype, '_handleFileChange')
  prototype._handleFileChange = function(...args) {
    return Try(() => options.admission.read(async () => await original.apply(this, args)), {
      catch(error) {
        options.reportFatal(String(error))
      },
    })
  }
}

function wrapSend(send: Send, options: MetroHookOptions): Send {
  return message => send(decorateHmrPayload(message, options))
}

function decorateHmrPayload(message: string, options: MetroHookOptions): string {
  const payload = Json.Parse(message) as HmrPayload
  const current = options.current()
  payload.tao = { sessionId: options.sessionId, revision: current.revision, sequence: current.sequence }
  if (payload.type === 'error') {
    options.reportError(Json.Print(payload.body))
  }
  return Json.Print(payload, { prettyPrint: false })
}

function serializeInternalHmrError(error: unknown): string {
  return Json.Print({ type: 'error', body: { type: 'InternalError', message: String(error) } }, { prettyPrint: false })
}

function wrapChangeListeners(prototype: MetroPrototype, options: MetroHookOptions): void {
  const original = requireMethod(prototype, 'listen')
  prototype.listen = function(...args) {
    const callback = args[1] as (event: unknown) => Promise<unknown>
    args[1] = (event: unknown) =>
      Try(() => options.admission.schedule(() => callback(event)), {
        catch(error) {
          options.reportError(String(error))
        },
      })
    return original.apply(this, args)
  }
}

function boundHmrSockets(directory: string): void {
  const module = ExpoMetro.loadSocketFactory<{ default(...args: unknown[]): HmrSocketServer }>(directory)
  const createServer = module.default
  if (typeof createServer !== 'function') {
    Errors.ThrowHostEnvironment('Unsupported Metro HMR socket factory.')
  }
  module.default = (...args) => {
    const server = createServer(...args)
    server.prependListener('connection', socket => limitHmrSocketQueue(socket))
    return server
  }
}
