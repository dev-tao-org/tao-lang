import type { Document } from '@ast-gen/AST'
import { compile, type CompileOptions } from '@compile/Compile'
import { Errors, Timings } from '@shared'
import type { CompileTarget } from '@workspace/CompileTarget'
import { publishLibrary } from '@workspace/PublishLibrary'
import { execute } from '@workspace/Workflow'
import { prepareNativeLocks } from '../cli-checks/native-lock-build'
import { prepareRuntime } from '../cli-checks/runtime-build'
import { withProjectSessions } from './ProjectCommand'
import { workflowUI } from './WorkflowUI'

/** prepareCompiledApplication opens an app through the shared preparation and source compilation workflow. */
export async function prepareCompiledApplication(target: CompileTarget, session?: string, yes?: boolean) {
  await prepareNativeLocks()
  await prepareRuntime()
  const options = { id: session, compile: createSelectedAppCompiler(target.target) }
  return await execute({ kind: 'compile', entry: target.entry, options }, workflowUI(yes))
}

/** publishCompiledLibrary validates package settings before publishing the selected library generation. */
export async function publishCompiledLibrary(target: CompileTarget, session?: string): Promise<string> {
  if (!target.out || !target.name) {
    return Errors.ThrowUserInput('Configure tao.compile.out and tao.compile.name for a TypeScript library.')
  }
  const request = { entry: target.entry, out: target.out, name: target.name, target: target.target }
  return await withProjectSessions([target.entry], () => publishLibrary(request), session)
}

function createSelectedAppCompiler(app?: string): typeof compile {
  return Timings.createTopLevelTimer(function(timings, document: Document, options: CompileOptions) {
    const selected = createSelectedAppOptions(options, app)
    return timings.run(compile, document, selected)
  })
}

function createSelectedAppOptions(options: CompileOptions, app?: string): CompileOptions {
  return { ...options, app }
}
