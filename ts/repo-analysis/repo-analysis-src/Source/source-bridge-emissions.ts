import { Regxs } from '@shared'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import type { SourceBridgeContext } from './source-bridge-owners'
import { sourceBridgeIssue, sourceBridgeLoaderAliases } from './source-bridges'

/** sourceBridgeEmissionIssues checks literal imports in handwritten tagged source templates. */
export function sourceBridgeEmissionIssues(
  node: TypeScript.Node,
  filename: string,
  context: SourceBridgeContext,
): string[] {
  if (!TypeScript.isTaggedTemplateExpression(node)) {
    return []
  }
  const source = renderTemplateSource(node.template)
  if (!Regxs.EmittedModuleSyntaxRegx.test(source)) {
    return []
  }
  const file = TypeScript.createSourceFile('emission.tsx', source, TypeScript.ScriptTarget.Latest, true)
  const aliases = sourceBridgeLoaderAliases(file)
  const emittedContext = createEmissionBridgeContext(context)
  const issues: string[] = []
  const visit = (child: TypeScript.Node): void => {
    if (isExplicitHostProbe(child, filename)) {
      return
    }
    const issue = sourceBridgeIssue(child, filename, emittedContext, aliases, false)
    if (issue) {
      issues.push('emitted source: ' + issue)
    }
    TypeScript.forEachChild(child, visit)
  }
  visit(file)
  return issues
}

function createEmissionBridgeContext(context: SourceBridgeContext): SourceBridgeContext {
  return { ...context, pathAliases: [...context.pathAliases, '@runtime'] }
}

function renderTemplateSource(template: TypeScript.TemplateLiteral): string {
  if (TypeScript.isNoSubstitutionTemplateLiteral(template)) {
    return template.text
  }
  return template.head.text
    + template.templateSpans.map(span => './__template_expression__' + span.literal.text).join('')
}

function isExplicitHostProbe(node: TypeScript.Node, filename: string): boolean {
  if (!TypeScript.isStringLiteralLike(node)) {
    return false
  }
  return hostProbeSpecifiers.get(filename)?.includes(node.text) === true
}

// These programs must capture the actual external module graph to prove routing and interception.
// Standalone consumer templates and declaration contracts intentionally resolve the consumer's peers.
const hostProbeSpecifiers = new Map<string, readonly string[]>([
  ['ts/6-compile/compile-src/Compile/ForeignViewContractCompiler.ts', ['react']],
  ['ts/6-compile/compile-src/Compile/LibraryPackageCompiler.ts', ['react']],
  ['ts/0-workspace/workspace-src/projects/LibraryProjectTemplate.ts', [
    '@tao-dev/ts-lib-example',
    '@tao-dev/ts-lib-example/Greeting',
    'react',
    'react-native',
  ]],
  ['ts/0-workspace/test-workspace/sidecars.test-fixtures.ManagedMetro.Acceptance.ts', ['tao-fixture-label']],
  ['ts/0-workspace/test-workspace/Workspace.ManagedDependenciesAcceptance.test.ts', ['tao-fixture-label']],
  ['ts/7-runtime/test-runtime/expo/Metro.test-fixtures.Integration.DelayPreload.ts', [
    'node:fs',
    'node:module',
    'node:path',
    'expo/package.json',
    '@expo/cli/package.json',
    '@expo/metro/metro/Bundler',
  ]],
  ['ts/7-runtime/test-runtime/expo/Metro.Guards.test.ts', ['node:module']],
  ['ts/shared/test-shared/os/Storage.Core.test.ts', ['node:fs/promises']],
  ['ts/shared/test-shared/os/FS.GeneratedFileSystem.test.ts', [
    'node:assert/strict',
    'node:fs',
    'node:fs/promises',
    'node:path',
  ]],
  ['ts/shared/test-shared/os/FS.GeneratedFileSystem.GeneratedStreams.test.ts', [
    'node:assert/strict',
    'node:fs',
    'node:fs/promises',
    'node:module',
    'node:path',
    'node:stream',
    'node:stream/promises',
    'expo/package.json',
    '@expo/cli/package.json',
    'graceful-fs',
  ]],
  ['ts/7-runtime/runtime-src/expo/MetroIntegration-test/DelayPreload.ts', [
    'node:fs',
    'node:module',
    'node:path',
    'expo/package.json',
    '@expo/cli/package.json',
    '@expo/metro/metro/Bundler',
  ]],
  ['ts/7-runtime/runtime-src/expo/MetroIntegration-test/MetroGuards.test.ts', ['node:module']],
  ['ts/repo-analysis/test-repo-analysis/Source.Api.test.ts', ['@model']],
  ['ts/shared/test-shared/os/FS.Files.GeneratedMetadata.test.ts', ['bun:test']],
  ['ts/shared/test-shared/os/Storage.LeaseFailures.test.ts', ['bun:test']],
  ['ts/shared/test-shared/os/locks.FileLock.PointerDiagnostics.test.ts', ['bun:test']],
])
