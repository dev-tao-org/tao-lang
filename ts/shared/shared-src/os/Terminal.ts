import * as Characters from '../universal/Characters'
import { ControlCCharacter, Errors, Try } from '../universal/universal'
import * as UserInput from '../universal/UserInput'
import * as WebHost from './bridges/Bridge_browser/Bridge_browser'
import { Buffer as NodeBuffer } from './bridges/Bridge_node/Bridge_node'
import * as Node from './bridges/Bridge_node/Bridge_node'
import { emitKeypressEvents, type Readable, StringDecoder } from './bridges/Bridge_node/Bridge_node'
import * as Process from './Process'

/** stdout exposes the developer output stream. */
export const stdout = Process.stdout

/** stderr exposes the diagnostic output stream. */
export const stderr = Process.stderr

/** isInteractive reports whether stdin and stdout are attached to a terminal. */
export function isInteractive(): boolean {
  return stdout.isTTY === true && Process.stdin.isTTY === true
}

/** writeLine writes human-readable text plus a newline to stdout. */
export function writeLine(message = ''): void {
  stdout.write(`${message}${Characters.NewlineCharacter}`)
}

type KeyInput = Readable & { isTTY?: boolean; isRaw?: boolean; setRawMode(raw: boolean): void }
/** listenForKeys reads immediate terminal keys and returns an idempotent input-state cleanup. */
export function listenForKeys(receive: (key: string) => void, input: KeyInput = Process.stdin): () => void {
  if (!input.isTTY) {
    return () => {}
  }
  const wasRaw = input.isRaw === true
  const wasFlowing = input.readableFlowing === true
  let listening = true
  const readKey = (_text: KeypressText, key: { sequence: string }) => receive(key.sequence)
  emitKeypressEvents(input)
  input.on('keypress', readKey)
  input.setRawMode(true)
  input.resume()
  return () => {
    if (!listening) {
      return
    }
    listening = false
    input.off('keypress', readKey)
    input.setRawMode(wasRaw)
    if (!wasFlowing) {
      input.pause()
    }
  }
}

type ConfirmationOptions = { defaultValue?: boolean; message: string; signal?: AbortSignal }
/** askConfirm prompts for a yes/no response and closes its reader when the caller cancels. */
export async function askConfirm(
  options: ConfirmationOptions,
  terminal: ConfirmationTerminal = confirmationTerminal,
): Promise<boolean> {
  UserInput.require(!options.signal?.aborted, 'Confirmation cancelled.')
  if (!terminal.isInteractive()) {
    return options.defaultValue ?? false
  }
  const suffix = options.defaultValue ? '[Y/n]' : '[y/N]'
  const readline = terminal.open()
  return await Try(async () => {
    while (true) {
      const answer = (await readline.question(`${options.message} ${suffix} `, { signal: options.signal }))
        .trim().toLowerCase()
      if (answer === '' && options.defaultValue !== undefined) {
        return options.defaultValue
      }
      if (answer === 'y' || answer === 'yes') {
        return true
      }
      if (answer === 'n' || answer === 'no') {
        return false
      }
      terminal.write('Answer yes or no.' + Characters.NewlineCharacter)
    }
  }, {
    catch(error) {
      UserInput.require(!options.signal?.aborted, 'Confirmation cancelled.')
      return Errors.Throw(error)
    },
    finally() {
      readline.close()
    },
  })
}

/** askSecret reads hidden input, submitting bracketed pastes as one value including embedded newlines. */
export async function askSecret(prompt: string): Promise<string> {
  const input = Process.stdin
  UserInput.require(!!input.isTTY, 'Secret entry requires an interactive terminal.')
  const wasRaw = input.isRaw
  const wasPaused = input.isPaused()
  const result = Promise.withResolvers<string>()
  const receive = secretReader(result.resolve, result.reject)
  const ended = () => result.reject(new Error('Secret entry ended before a value was entered.'))
  const failed = result.reject
  return await Try(() => {
    input.on('data', receive)
    input.once('end', ended)
    input.once('error', failed)
    input.setRawMode(true)
    input.resume()
    stderr.write(prompt + (Characters.EscapeCharacter + '[?2004h'))
    return result.promise
  }, {
    finally() {
      input.off('data', receive)
      input.off('end', ended)
      input.off('error', failed)
      input.setRawMode(wasRaw)
      if (wasPaused) {
        input.pause()
      }
      stderr.write(Characters.EscapeCharacter + '[?2004l' + Characters.NewlineCharacter)
    },
  })
}

type KeypressText = string | undefined

type SecretInput = { decoder: StringDecoder; value: string; pending: string; pasting: boolean }

type ResolveSecret = (value: string) => void
type RejectSecret = (error: Error) => void

type ConfirmationTerminal = {
  isInteractive(): boolean
  open(): { question(message: string, options: { signal?: WebHost.AbortSignal }): Promise<string>; close(): void }
  write(message: string): void
}

const confirmationTerminal: ConfirmationTerminal = {
  isInteractive,
  open: () => Node.createInterface(confirmReadlineOptions()),
  write(message) {
    stderr.write(message)
  },
}

function confirmReadlineOptions(): Node.ReadLineOptions {
  return {
    input: Process.stdin,
    output: stderr,
  }
}

function secretReader(resolve: ResolveSecret, reject: RejectSecret): (chunk: NodeBuffer) => void {
  const state: SecretInput = { decoder: new Node.StringDecoder('utf8'), value: '', pending: '', pasting: false }
  return chunk => readSecretChunk(state, chunk, resolve, reject)
}

function readSecretChunk(state: SecretInput, chunk: NodeBuffer, resolve: ResolveSecret, reject: RejectSecret): void {
  state.pending += state.decoder.write(chunk)
  while (state.pending) {
    const marker = state.pasting ? (Characters.EscapeCharacter + '[201~') : (Characters.EscapeCharacter + '[200~')
    if (state.pending.startsWith(marker)) {
      state.pending = state.pending.slice(marker.length)
      if (state.pasting) {
        resolve(state.value)
        return
      }
      state.pasting = true
      continue
    }
    if (marker.startsWith(state.pending)) {
      return
    }
    const character = [...state.pending][0]
    state.pending = state.pending.slice(character.length)
    if (state.pasting) {
      state.value += character
    } else if (character === ControlCCharacter || character === Characters.ControlDCharacter) {
      reject(new Error('Secret entry cancelled.'))
      return
    } else if (character === Characters.CarriageReturnCharacter || character === Characters.NewlineCharacter) {
      resolve(state.value)
      return
    } else if (character === Characters.DeleteCharacter || character === Characters.BackspaceCharacter) {
      state.value = [...state.value].slice(0, -1).join('')
    } else if (character >= ' ' && character !== Characters.EscapeCharacter) {
      state.value += character
    } else {
      // Ignore unsupported control characters instead of adding them to the secret.
    }
  }
}
