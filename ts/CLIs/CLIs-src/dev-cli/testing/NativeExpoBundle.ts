import { IO } from '@cli-kit'
import { Errors, Json, Schema, Time } from '@shared'
import { Cancellation, Http } from '@shared/web'

/** warmIosExpoBundle completes the cold Metro request before Expo Go starts loading the app. */
export async function warmIosExpoBundle(origin: string): Promise<void> {
  IO.progress('Warming the iOS Metro bundle…')
  const controller = Cancellation.createController()
  // Keep the request budget inside the Appium session's 120-second command idle timeout.
  const stop = Time.schedule(90_000, () => {
    controller.abort(Errors.createHostEnvironmentError('iOS Metro bundle warmup exceeded 90 seconds.'))
  })
  await fetchIosExpoBundle(origin, controller.signal).finally(stop)
}

const ManifestSchema = Schema.object({ launchAsset: Schema.object({ url: Schema.string() }) })

async function fetchIosExpoBundle(origin: string, signal: AbortSignal): Promise<void> {
  const manifest = await Http.request(origin, {
    headers: { 'accept': 'application/expo+json', 'expo-platform': 'ios' },
    redirect: 'error',
    signal,
  })
  if (!manifest.ok) {
    Errors.ThrowHostEnvironment(`iOS Expo manifest returned HTTP ${manifest.status}.`)
  }
  const { launchAsset } = Json.Parse(await manifest.text(), { schema: ManifestSchema, sourceName: 'iOS Expo manifest' })
  const bundle = Http.url(launchAsset.url)
  if (bundle.origin !== origin) {
    Errors.ThrowHostEnvironment('iOS Expo manifest advertised a bundle outside the local Metro server.')
  }
  const response = await Http.request(bundle.href, { redirect: 'error', signal })
  if (!response.ok) {
    Errors.ThrowHostEnvironment(`iOS Metro bundle returned HTTP ${response.status}: ${await response.text()}`)
  }
  await response.arrayBuffer()
}
