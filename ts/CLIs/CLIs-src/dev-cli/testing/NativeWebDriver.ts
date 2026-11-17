import { Errors, Json, Schema, Time } from '@shared'
import { Cancellation, Http } from '@shared/web'

/** NativeWebDriver issues W3C WebDriver and Appium commands to one local session. */
export type NativeWebDriver = {
  execute(script: string, ...args: readonly unknown[]): Promise<unknown>
  find(xpath: string): Promise<readonly string[]>
  attribute(element: string, name: string): Promise<unknown>
  isDisplayed(element: string): Promise<boolean>
  isKeyboardShown(): Promise<boolean>
  snapshot(): Promise<string>
  tap(element: string): Promise<void>
  enterText(element: string, text: string): Promise<void>
  close(): Promise<void>
}

type NativeCapabilityValue = string | boolean | number
type NativeCapabilities = Record<string, NativeCapabilityValue>
const StartupMs = 240_000
const CommandMs = 20_000
const IosAppLaunchMs = 90_000
/** openNativeWebDriver creates a session using the requested device capabilities. */
export async function openNativeWebDriver(url: string, alwaysMatch: NativeCapabilities): Promise<NativeWebDriver> {
  const result = await requestAppium(url + '/session', 'POST', { capabilities: { alwaysMatch } }, StartupMs)
  const { sessionId } = SessionSchema.parse(result)
  const sessionUrl = url + '/session/' + sessionId
  const command = (
    path: string,
    method: WebDriverMethod,
    body?: unknown,
    tolerateStale = false,
    timeoutMs = CommandMs,
  ) => requestAppium(sessionUrl + path, method, body, timeoutMs, tolerateStale)
  return {
    execute(script, ...args) {
      // An iOS deep link can cold-launch Expo Go before returning from the command.
      const timeoutMs = script === 'mobile: deepLink' && alwaysMatch.platformName === 'iOS' ? IosAppLaunchMs : CommandMs
      return command('/execute/sync', 'POST', { script, args }, false, timeoutMs)
    },
    async find(xpath) {
      const result = await command('/elements', 'POST', { using: 'xpath', value: xpath })
      return ElementsSchema.parse(result).map(element => element[ElementKey])
    },
    attribute: (element, name) => command(elementPath(element, '/attribute/' + name), 'GET', undefined, true),
    isDisplayed: async element => await command(elementPath(element, '/displayed'), 'GET', undefined, true) === true,
    isKeyboardShown: async () => Schema.boolean().parse(await command('/appium/device/is_keyboard_shown', 'GET')),
    snapshot: async () => Schema.string().parse(await command('/source', 'GET')),
    async tap(element) {
      const rect = RectSchema.parse(await command(elementPath(element, '/rect'), 'GET'))
      await command('/actions', 'POST', tapAtCenter(rect))
    },
    async enterText(element, text) {
      await command(elementPath(element, '/clear'), 'POST', {})
      await command(elementPath(element, '/value'), 'POST', { text })
    },
    async close() {
      await command('', 'DELETE')
    },
  }
}

/** waitForNativeObservation polls UI state while propagating driver and transport failures. */
export async function waitForNativeObservation<Value>(
  description: string,
  observe: () => Promise<Value | undefined>,
  timeoutMs = 20_000,
): Promise<Value> {
  const deadline = Time.nowMs() + timeoutMs
  while (Time.nowMs() < deadline) {
    const result = await observe()
    if (result !== undefined) {
      return result
    }
    await Time.sleep(200)
  }
  return Errors.ThrowHostEnvironment(`Native UI did not show ${description}.`)
}

type WebDriverMethod = 'GET' | 'POST' | 'DELETE'
const ElementKey = 'element-6066-11e4-a52e-4f735466cecf'
const ElementsSchema = Schema.array(Schema.object({ [ElementKey]: Schema.string() }))
const SessionSchema = Schema.object({ sessionId: Schema.string() })
const ResponseSchema = Schema.object({ value: Schema.unknown() })
const ErrorSchema = Schema.object({ error: Schema.string() })
const RectSchema = Schema.object({
  x: Schema.number(),
  y: Schema.number(),
  width: Schema.number(),
  height: Schema.number(),
})

async function requestAppium(
  url: string,
  method: WebDriverMethod,
  body: unknown,
  timeoutMs: number,
  tolerateStale = false,
): Promise<unknown> {
  const controller = Cancellation.createController()
  const stop = Time.schedule(timeoutMs, () => controller.abort())
  return await requestAppiumBeforeTimeout(url, method, body, controller.signal, tolerateStale).finally(stop)
}

async function requestAppiumBeforeTimeout(
  url: string,
  method: WebDriverMethod,
  body: unknown,
  signal: AbortSignal,
  tolerateStale: boolean,
): Promise<unknown> {
  const response = await Http.request(url, {
    method,
    signal,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : Json.Print(body),
  })
  const value = parseAppiumResponse(await response.text())
  if (!response.ok) {
    if (tolerateStale && isStaleElementError(value)) {
      return undefined
    }
    Errors.ThrowHostEnvironment(`Appium ${method} ${url} returned ${response.status}: ${Json.Print(value)}`)
  }
  return value
}

function isStaleElementError(value: unknown): boolean {
  const parsed = ErrorSchema.safeParse(value)
  return parsed.success && parsed.data.error === 'stale element reference'
}

function parseAppiumResponse(text: string): unknown {
  return ResponseSchema.parse(Json.Parse(text)).value
}

function elementPath(element: string, suffix: string): string {
  return '/element/' + element + suffix
}

type ElementRect = Schema.infer<typeof RectSchema>
function tapAtCenter(rect: ElementRect) {
  const x = Math.round(rect.x + rect.width / 2)
  const y = Math.round(rect.y + rect.height / 2)
  if (rect.width <= 0 || rect.height <= 0) {
    Errors.ThrowHostEnvironment('Cannot tap a native element with empty bounds.')
  }
  return {
    actions: [{
      type: 'pointer',
      id: 'finger',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x, y, origin: 'viewport' },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 60 },
        { type: 'pointerUp', button: 0 },
      ],
    }],
  }
}
