import { ControlCCharacter, Errors, Try } from '../universal/universal'
import { createInterface, emitKeypressEvents, type Readable, type ReadLineOptions, StringDecoder } from './NodeBuiltins'

/** stdout exposes the developer output stream. */
export const stdout = process.stdout

/** stderr exposes the diagnostic output stream. */
export const stderr = process.stderr

/** isInteractive reports whether stdin and stdout are attached to a terminal. */
export function isInteractive(): boolean {
  return stdout.isTTY === true && process.stdin.isTTY === true
}

/** writeLine writes human-readable text plus a newline to stdout. */
export function writeLine(message = ''): void {
  stdout.write(`${message}\n`)
}

/** listenForKeys reads immediate terminal keys and returns an idempotent input-state cleanup. */
export function listenForKeys(receive: (key: string) => void, input: KeyInput = process.stdin): () => void {
  if (!input.isTTY) {
    return () => {}
  }
  const wasRaw = input.isRaw === true
  const wasPaused = input.isPaused()
  let listening = true
  const readKey = (_text: string | undefined, key: { sequence: string }) => receive(key.sequence)
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
    if (wasPaused) {
      input.pause()
    }
  }
}

/** askConfirm prompts for a yes/no response and closes its reader when the caller cancels. */
export async function askConfirm(
  options: ConfirmationOptions,
  terminal: ConfirmationTerminal = confirmationTerminal,
): Promise<boolean> {
  if (options.signal?.aborted) {
    Errors.ThrowUserInput('Confirmation cancelled.')
  }
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
      terminal.write('Answer yes or no.\n')
    }
  }, {
    catch(error) {
      if (options.signal?.aborted) {
        Errors.ThrowUserInput('Confirmation cancelled.')
      }
      return Errors.Throw(error)
    },
    finally() {
      readline.close()
    },
  })
}

/** askSecret reads hidden input, submitting bracketed pastes as one value including embedded newlines. */
export async function askSecret(prompt: string): Promise<string> {
  const input = process.stdin
  if (!input.isTTY) {
    Errors.ThrowUserInput('Secret entry requires an interactive terminal.')
  }
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
    stderr.write(prompt + '\u001b[?2004h')
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
      stderr.write('\u001b[?2004l\n')
    },
  })
}

type ConfirmationOptions = { defaultValue?: boolean; message: string; signal?: AbortSignal }

type SecretInput = { decoder: StringDecoder; value: string; pending: string; pasting: boolean }
type KeyInput = Readable & { isTTY?: boolean; isRaw?: boolean; setRawMode(raw: boolean): void }
type ResolveSecret = (value: string) => void
type RejectSecret = (error: Error) => void

type ConfirmationTerminal = {
  isInteractive(): boolean
  open(): { question(message: string, options: { signal?: AbortSignal }): Promise<string>; close(): void }
  write(message: string): void
}

const confirmationTerminal: ConfirmationTerminal = {
  isInteractive,
  open: () => createInterface(confirmReadlineOptions()),
  write(message) {
    stderr.write(message)
  },
}

function confirmReadlineOptions(): ReadLineOptions {
  return {
    input: process.stdin,
    output: stderr,
  }
}

function secretReader(resolve: ResolveSecret, reject: RejectSecret): (chunk: Buffer) => void {
  const state: SecretInput = { decoder: new StringDecoder('utf8'), value: '', pending: '', pasting: false }
  return chunk => readSecretChunk(state, chunk, resolve, reject)
}

function readSecretChunk(state: SecretInput, chunk: Buffer, resolve: ResolveSecret, reject: RejectSecret): void {
  state.pending += state.decoder.write(chunk)
  while (state.pending) {
    const marker = state.pasting ? '\u001b[201~' : '\u001b[200~'
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
    } else if (character === ControlCCharacter || character === '\u0004') {
      reject(new Error('Secret entry cancelled.'))
      return
    } else if (character === '\r' || character === '\n') {
      resolve(state.value)
      return
    } else if (character === '\u007f' || character === '\b') {
      state.value = [...state.value].slice(0, -1).join('')
    } else if (character >= ' ' && character !== '\u001b') {
      state.value += character
    } else {
      // Ignore unsupported control characters instead of adding them to the secret.
    }
  }
}
