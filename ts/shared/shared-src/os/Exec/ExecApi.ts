import { capture, captureStdout, readText, resolveCommandArgs, runSync, spawn, terminate } from './Exec'
import { captureProcessOutput, stopProcess } from './Exec-Lifecycle'
import { requireHostProcessAccess } from './Exec-Tools'

/** Exec starts and supervises child processes. */
const Exec = {
  capture,
  captureProcessOutput,
  captureStdout,
  readText,
  requireHostProcessAccess,
  resolveCommandArgs,
  runSync,
  spawn,
  stopProcess,
  terminate,
}

export default Exec
