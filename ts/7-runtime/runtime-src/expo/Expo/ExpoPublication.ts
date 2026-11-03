import { Errors } from '@shared'
import { Env, FS, Path, Platform } from '@shared/os'
import { serializeGeneratedRevision, snapshotRevision } from '../GeneratedRevision'
import type { GeneratedRevision } from '../PreviewProtocol'
import { createPublicationTransport, type PublicationTransport } from './ExpoPublicationTransport'

type ExpoEnvironment = Record<string, string>

/** ExpoPublication carries preload environment and one session-scoped publication transport. */
export type ExpoPublication = PublicationTransport & { sessionId: string; environment: ExpoEnvironment }
/** prepareExpoPublication seeds the generated preload and creates its bounded parent transport. */
export async function prepareExpoPublication(
  application: { directory: string; metroPreloadPath?: string },
  generated?: ExpoGeneratedOptions,
): Promise<ExpoPublication> {
  const sessionId = Platform.randomUUID()
  const token = Platform.randomUUID()
  const initial = generated ? snapshotRevision(generated.initial) : undefined
  const transport = createPublicationTransport(sessionId, token, initial?.revision ?? '')
  if (!generated || !initial) {
    return { ...transport, sessionId, environment: {} }
  }
  const preloadPath = generated.preloadPath ?? application.metroPreloadPath
  if (preloadPath === undefined || preloadPath === null) {
    Errors.ThrowHostEnvironment('Metro preload resources are missing. Rebuild the Tao runtime.')
  }
  if (!FS.existsSync(preloadPath)) {
    Errors.ThrowHostEnvironment(`Metro preload is missing: ${preloadPath}`)
  }
  const seed = Path.join(application.directory, '.tao-metro-seed.json')
  await FS.writeFile(seed, serializeGeneratedRevision(initial), { mode: 0o600 })
  return {
    ...transport,
    sessionId,
    environment: {
      NODE_OPTIONS: `--require ${JSON.stringify(preloadPath)} ${Env.get('NODE_OPTIONS') ?? ''}`.trim(),
      TAO_METRO_PRELOAD: preloadPath,
      TAO_METRO_SESSION: sessionId,
      TAO_METRO_TOKEN: token,
      TAO_METRO_SEED: seed,
      CI: 'true',
    },
  }
}

/** ExpoGeneratedOptions seeds the complete generated source namespace before Metro imports readers. */
export type ExpoGeneratedOptions = { initial: GeneratedRevision; preloadPath?: string }
