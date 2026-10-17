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
  const decoder = new StringDecoder('utf8')
  let value = ''
  let pending = ''
  let pasting = false
  let receive: (chunk: Buffer) => void
  let ended: () => void
  let failed: (error: Error) => void
  return await Try(() =>
    new Promise<string>((resolve, reject) => {
      receive = chunk => {
        pending += decoder.write(chunk)
        while (pending) {
          const marker = pasting ? '\u001b[201~' : '\u001b[200~'
          if (pending.startsWith(marker)) {
            pending = pending.slice(marker.length)
            if (pasting) {
              resolve(value)
              return
            }
            pasting = true
            continue
          }
          if (marker.startsWith(pending)) {
            return
          }
          const character = [...pending][0]
          pending = pending.slice(character.length)
          if (pasting) {
            value += character
          } else if (character === '\u0003' || character === '\u0004') {
            reject(new Error('Secret entry cancelled.'))
            return
          } else if (character === '\r' || character === '\n') {
            resolve(value)
            return
          } else if (character === '\u007f' || character === '\b') {
            value = [...value].slice(0, -1).join('')
          } else if (character >= ' ' && character !== '\u001b') {
            value += character
          }
        }
      }
      ended = () => reject(new Error('Secret entry ended before a value was entered.'))
      failed = reject
      input.on('data', receive)
      input.once('end', ended)
      input.once('error', failed)
      input.setRawMode(true)
      input.resume()
      stderr.write(prompt + '\u001b[?2004h')
    }), {
    finally: () => {
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
