import type * as AST from '@ast-gen'
import * as Compile from '@compile'
import * as Workspace from '@workspace'

import { Errors, Timings } from '@shared'

import { prepareNativeLocks } from '../cli-checks/native-lock-build'
import { prepareRuntime } from '../cli-checks/runtime-build'
import { withProjectSessions } from './ProjectCommand'
import { workflowUI } from './WorkflowUI'

/** prepareCompiledApplication opens an app through the shared preparation and source compilation workflow. */
export async function prepareCompiledApplication(target: Workspace.CompileTarget, session?: string, yes?: boolean) {
  await prepareNativeLocks()
  await prepareRuntime()
  const options = { id: session, compile: createSelectedAppCompiler(target.target) }
  return await Workspace.execute({ kind: 'compile', entry: target.entry, options }, workflowUI(yes))
}

/** publishCompiledLibrary validates package settings before publishing the selected library generation. */
export async function publishCompiledLibrary(target: Workspace.CompileTarget, session?: string): Promise<string> {
  if (!target.out || !target.name) {
    return Errors.ThrowUserInput('Configure tao.compile.out and tao.compile.name for a TypeScript library.')
  }
  const request = { entry: target.entry, out: target.out, name: target.name, target: target.target }
  return await withProjectSessions([target.entry], () => Workspace.publishLibrary(request), session)
}

function createSelectedAppCompiler(app?: string): typeof Compile.compile {
  return Timings.createTopLevelTimer(function(timings, document: AST.Document, options: Compile.CompileOptions) {
    const selected = createSelectedAppOptions(options, app)
    return timings.run(Compile.compile, document, selected)
  })
}

function createSelectedAppOptions(options: Compile.CompileOptions, app?: string): Compile.CompileOptions {
  return { ...options, app }
}
