import * as ExternalErrors from '../../universal/Errors/external'
import { Errors, Time, Try } from '../../universal/universal'
import * as WebHost from '../bridges/Bridge_browser/Bridge_browser'
import type { CaptureOptions, CommandInvocation, CommandResult, PipedChildProcess } from './Exec'

type CommandInputMode = 'pipe' | 'ignore'
type CapturedChild = PipedChildProcess<CommandInputMode>
type CommandCapture = { finished: Promise<void>; stop(): void; read(): string }
type CommandCaptures = { stdout: CommandCapture; stderr: CommandCapture }
type CommandDeadline = { finished: Promise<void>; cancel(): void; expired: boolean; childHadExited: boolean }

/** collectCommand bounds owned input and capture by the command deadline and preserves partial failure output. */
export async function collectCommand(
  child: CapturedChild,
  invocation: CommandInvocation,
  options: CaptureOptions,
): Promise<CommandResult<number>> {
  const captures = { stdout: captureStream(child.stdout), stderr: captureStream(child.stderr) }
  const deadline = startCommandDeadline(child, options.timeoutMs)
  return await Try(async () => {
    const complete = Promise.all([
      child.exited,
      captures.stdout.finished,
      captures.stderr.finished,
      writeInput(child, options.stdin),
    ])
    await Promise.race([complete, deadline.finished])
    if (deadline.expired) {
      stopCommandIo(child, captures)
    }
    const result = await readCommandResult(child, invocation, captures)
    requireCompleteCapture(deadline, result)
    return result
  }, {
    catch: error => failCommandIo(child, invocation, captures, error),
    finally: deadline.cancel,
  })
}

function requireCompleteCapture(deadline: CommandDeadline, result: CommandResult<number>): void {
  if (!deadline.expired) {
    return
  }
  const killedForDeadline = !deadline.childHadExited && result.signal === 'SIGKILL'
  if (!killedForDeadline) {
    Errors.ThrowHostEnvironment('Command input or output did not finish before its deadline.')
  }
}

function captureStream(stream: WebHost.ReadableStream<Uint8Array>): CommandCapture {
  const reader = stream.getReader()
  const decoder = new WebHost.TextDecoder()
  let contents = ''
  let stopped = false
  let decoded = false
  const finishDecoding = () => {
    if (!decoded) {
      decoded = true
      contents += decoder.decode()
    }
  }
  const finished = Try(async () => {
    while (!stopped) {
      const chunk = await reader.read()
      if (chunk.done || stopped) {
        break
      }
      contents += decoder.decode(chunk.value, { stream: true })
    }
  }, {
    finally() {
      finishDecoding()
      reader.releaseLock()
    },
  })
  return {
    finished,
    stop() {
      stopped = true
      finishDecoding()
      void Try(() => reader.cancel(), { catch: () => undefined })
    },
    read: () => contents,
  }
}

type CommandTimeout = number | undefined

function startCommandDeadline(
  child: CapturedChild,
  timeoutMs: CommandTimeout,
): CommandDeadline {
  let cancel: () => void = () => undefined
  const deadline: CommandDeadline = {
    finished: new Promise<void>(resolve => {
      if (timeoutMs !== undefined) {
        cancel = Time.schedule(timeoutMs, () => {
          deadline.expired = true
          deadline.childHadExited = child.exitCode !== null
          resolve()
        })
      }
    }),
    cancel: () => cancel(),
    expired: false,
    childHadExited: false,
  }
  return deadline
}

async function writeInput(child: CapturedChild, input: CaptureOptions['stdin']): Promise<void> {
  if (input !== undefined && child.stdin) {
    await child.stdin.write(input)
    await child.stdin.end()
  }
}

function stopCommandIo(child: CapturedChild, captures: CommandCaptures): void {
  captures.stdout.stop()
  captures.stderr.stop()
  if (child.stdin) {
    child.stdin.unref()
    void Try(() => child.stdin!.end(new Error('Command input collection stopped.')), { catch: () => undefined })
  }
  child.kill('SIGKILL')
}

async function readCommandResult(
  child: CapturedChild,
  invocation: CommandInvocation,
  captures: CommandCaptures,
): Promise<CommandResult<number>> {
  const status = await child.exited
  return {
    ...invocation,
    status,
    signal: child.signalCode,
    stdout: captures.stdout.read(),
    stderr: captures.stderr.read(),
  }
}

async function failCommandIo(
  child: CapturedChild,
  invocation: CommandInvocation,
  captures: CommandCaptures,
  error: unknown,
): Promise<never> {
  stopCommandIo(child, captures)
  const result = await readCommandResult(child, invocation, captures)
  const cause = Errors.isNativeError(error) ? error : ExternalErrors.fromUnknown(error)
  return Errors.ThrowCommandExecution({ ...result, error: cause })
}
