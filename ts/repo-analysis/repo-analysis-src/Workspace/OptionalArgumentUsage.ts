import { TypeScript } from '@tao/shared/typescript'

type ArgumentCount = number | undefined

/** OptionalCallReference describes a reference to a function with optional positional arguments. */
export type OptionalCallReference = {
  symbol: TypeScript.Symbol
  declaration: TypeScript.FunctionDeclaration
  site: TypeScript.Node
  argumentCount: ArgumentCount
}

/** ScopedOptionalCalls separates observed call sites by their module usage. */
export type ScopedOptionalCalls = { production: OptionalCallReference[]; tests: OptionalCallReference[] }

type OptionalArgumentCandidate = { parameter: TypeScript.ParameterDeclaration; testSite: TypeScript.Node }

/** readOptionalCallReference recognizes direct positional calls and records ambiguous function references. */
export function readOptionalCallReference(
  symbol: TypeScript.Symbol,
  site: TypeScript.Node,
): OptionalCallReference | undefined {
  if ((symbol.flags & TypeScript.SymbolFlags.Function) === 0) {
    return
  }
  const declaration = symbol.declarations?.find(isFunctionImplementation)
  if (declaration === undefined || !declaration.parameters.some(isOptionalParameter)) {
    return
  }
  const call = readDirectCall(site)
  const argumentsList = call?.arguments
  const argumentCount = argumentsList?.some(TypeScript.isSpreadElement) ? undefined : argumentsList?.length
  return { symbol, declaration, site, argumentCount }
}

/** findTestOnlyOptionalArguments finds optional positions supplied by tests and omitted at direct production call sites. */
export function findTestOnlyOptionalArguments(
  calls: ScopedOptionalCalls,
  external: ReadonlySet<TypeScript.Symbol>,
): OptionalArgumentCandidate[] {
  const production = summarizeCallReferences(calls.production)
  const tests = summarizeCallReferences(calls.tests)
  const candidates: OptionalArgumentCandidate[] = []
  for (const [symbol, test] of tests) {
    const actual = production.get(symbol)
    if (!actual || external.has(symbol) || test.ambiguous) {
      continue
    }
    const productionCount = actual.longest.argumentCount
    const testCount = test.longest.argumentCount
    if (actual.ambiguous || productionCount === undefined || testCount === undefined) {
      continue
    }
    for (const parameter of test.longest.declaration.parameters.slice(productionCount, testCount)) {
      if (isOptionalParameter(parameter)) {
        candidates.push({ parameter, testSite: test.longest.site })
      }
    }
  }
  return candidates
}

function readDirectCall(site: TypeScript.Node): TypeScript.CallExpression | undefined {
  const access = site.parent
  const receiver = isAccessKey(site, access) ? access : site
  const call = receiver.parent
  if (TypeScript.isCallExpression(call) && call.expression === receiver) {
    return call
  }
}

function isAccessKey(site: TypeScript.Node, access: TypeScript.Node): boolean {
  if (TypeScript.isPropertyAccessExpression(access)) {
    return access.name === site
  }
  return TypeScript.isElementAccessExpression(access) && access.argumentExpression === site
}

function isFunctionImplementation(node: TypeScript.Declaration): node is TypeScript.FunctionDeclaration {
  if (!TypeScript.isFunctionDeclaration(node) || node.body === undefined) {
    return false
  }
  return node.parameters[0]?.name.getText() !== 'this'
}

function isOptionalParameter(parameter: TypeScript.ParameterDeclaration): boolean {
  const omittable = parameter.questionToken !== undefined || parameter.initializer !== undefined
  return omittable && TypeScript.isIdentifier(parameter.name)
}

type CallSummary = { longest: OptionalCallReference; ambiguous: boolean }
type CallSummaryByFunction = Map<TypeScript.Symbol, CallSummary>

function summarizeCallReferences(calls: readonly OptionalCallReference[]): CallSummaryByFunction {
  const summaries: CallSummaryByFunction = new Map()
  for (const call of calls) {
    const summary = summaries.get(call.symbol)
    if (!summary) {
      summaries.set(call.symbol, { longest: call, ambiguous: call.argumentCount === undefined })
    } else if (call.argumentCount === undefined) {
      summary.ambiguous = true
    } else if (call.argumentCount > (summary.longest.argumentCount ?? 0)) {
      summary.longest = call
    } else {
      // The recorded call already supplies at least as many argument positions.
    }
  }
  return summaries
}
