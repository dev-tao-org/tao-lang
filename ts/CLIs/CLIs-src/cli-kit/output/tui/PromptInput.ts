import { ControlCCharacter, Errors, Try, UserInput } from '@shared'
import type { Ink } from '../../bridges/Bridge_ink'
import type { OutputInputRequest } from '../Output'

/** PaneInput owns editable terminal input and its visible prompt without exposing hidden values. */
export type PaneInput = {
  read(request: OutputInputRequest): Promise<string>
  receive(text: string, key: Ink.Key): void
  paste(text: string): void
  message(): string | undefined
  dispose(): void
}

type PendingInput = {
  request: OutputInputRequest
  value: string
  resolve(value: string): void
  reject(error: Error): void
}

type OptionalPendingInput = PendingInput | undefined

/** createPaneInput owns one prompt's editable value without recording secret input. */
export function createPaneInput(redraw: () => void): PaneInput {
  let input: OptionalPendingInput
  return {
    read: readInput,
    receive: (text: string, key: Ink.Key) => receiveInput(input, text, key, redraw),
    paste(text: string): void {
      if (input?.request.secret) {
        input.resolve(input.value + text)
      } else if (input) {
        input.value += text
        redraw()
      }
    },
    message: () => inputMessage(input),
    dispose(): void {
      input?.reject(new Error('Terminal input ended.'))
    },
  }

  async function readInput(request: OutputInputRequest): Promise<string> {
    requireAvailableInput(input)
    UserInput.require(!request.signal?.aborted, 'Confirmation cancelled.')
    const result = Promise.withResolvers<string>()
    input = { request, value: '', resolve: result.resolve, reject: result.reject }
    const cancel = () => result.reject(new Error('Confirmation cancelled.'))
    request.signal?.addEventListener('abort', cancel, { once: true })
    redraw()
    return await Try(() => result.promise, {
      finally() {
        request.signal?.removeEventListener('abort', cancel)
        input = undefined
        redraw()
      },
    })
  }
}

function requireAvailableInput(input: OptionalPendingInput): void {
  if (input) {
    Errors.ThrowShouldNeverHappen('Another terminal prompt is active.')
  }
}

function receiveInput(input: OptionalPendingInput, text: string, key: Ink.Key, redraw: () => void): void {
  if (!input) {
    return
  }
  const cancelled = key.ctrl && (text === 'c' || text === 'd')
  const printable = !key.ctrl && !key.meta && text
  if (cancelled || text === ControlCCharacter) {
    input.reject(new Error('Terminal input cancelled.'))
  } else if (key.return) {
    input.resolve(input.value)
  } else if (key.backspace || key.delete) {
    input.value = [...input.value].slice(0, -1).join('')
  } else if (printable) {
    input.value += text
  } else {
    // Navigation and unsupported control keys do not change the input value.
  }
  redraw()
}

function inputMessage(input: OptionalPendingInput): string | undefined {
  if (!input) {
    return undefined
  }
  const value = input.request.secret ? '' : input.value
  return input.request.message + value
}
