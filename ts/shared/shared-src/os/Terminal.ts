import { StringDecoder } from 'node:string_decoder'
import { Errors, Try } from '../universal/universal'

/** stdout exposes the developer output stream. */
export const stdout = process.stdout

/** stderr exposes the diagnostic output stream. */
export const stderr = process.stderr

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

type SecretInput = { decoder: StringDecoder; value: string; pending: string; pasting: boolean }
type ResolveSecret = (value: string) => void
type RejectSecret = (error: Error) => void

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
    } else if (character === '\u0003' || character === '\u0004') {
      reject(new Error('Secret entry cancelled.'))
      return
    } else if (character === '\r' || character === '\n') {
      resolve(state.value)
      return
    } else if (character === '\u007f' || character === '\b') {
      state.value = [...state.value].slice(0, -1).join('')
    } else if (character >= ' ' && character !== '\u001b') {
      state.value += character
    }
  }
}
