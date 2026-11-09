/** argv exposes the current process argv. */
export const argv = process.argv

/** pid exposes the current process pid. */
export const pid = process.pid

/** stdin exposes the current process stdin. */
export const stdin = process.stdin

/** stdout exposes the current process stdout. */
export const stdout = process.stdout

/** stderr exposes the current process stderr. */
export const stderr = process.stderr

/** execPath exposes the current process execPath. */
export const execPath = process.execPath

/** environment exposes live values to the Env API. */
export const environment: Readonly<EnvironmentValues> = process.env

type EnvironmentValue = string | undefined
type EnvironmentValues = Record<string, EnvironmentValue>

/** cwd delegates to the current process with its receiver preserved. */
export const cwd = process.cwd.bind(process)

/** on delegates to the current process with its receiver preserved. */
export const on = process.on.bind(process)

/** off delegates to the current process with its receiver preserved. */
export const off = process.off.bind(process)

/** once delegates to the current process with its receiver preserved. */
export const once = process.once.bind(process)

/** exit delegates to the current process with its receiver preserved. */
export const exit: (code?: number) => never = process.exit.bind(process)

/** kill delegates to the current process with its receiver preserved. */
export const kill = process.kill.bind(process)

/** onUncaughtException installs a process-wide exception listener. */
export function onUncaughtException(handler: (error: unknown) => void): void {
  process.on('uncaughtException', handler)
}

/** onUnhandledRejection installs a process-wide rejected-promise listener. */
export function onUnhandledRejection(handler: (error: unknown) => void): void {
  process.on('unhandledRejection', handler)
}
