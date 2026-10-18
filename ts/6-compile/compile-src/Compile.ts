import type * as AST from '@ast-gen/AST'
import { Errors, S, Switch, Timings } from '@shared'

/** compile emits a single Expo app module through typed Tao runtime APIs.
 *  Full compilation consumes one immutable AST; no previous result is reused. */
export function compile(
  document: AST.Document,
  options: { revision: string },
  timings = new Timings('compiler'),
): string {
  return timings.measure('compiler.generate', () => {
    const Compile = new Compiler()
    return Compile.File(document.root, options.revision)
  })
}

class Compiler {
  File(node: AST.File, revision: string): string {
    const apps = node.declarations.filter(declaration => declaration.kind === 'AppDeclaration')
    if (apps.length !== 1) {
      Errors.ThrowUserInput('Compile one app declaration per entry file.')
    }
    const app = apps[0]!
    const views = node.declarations.filter(declaration => declaration.kind === 'ViewDeclaration')
      .map(view => this.ViewDeclaration(view)).join('\n')
    return S`
      import * as TR from '@runtime';
      TR.ModuleApplied(${literal(revision)});
      const _views: Record<string, TR.View> = {};
      ${views}
      export default function App() {
        return TR.App(_views[${literal(app.root.value)}], ${literal(revision)});
      }
    `
  }

  ViewDeclaration(node: AST.ViewDeclaration): string {
    const parameters = list(node.parameters.map(parameter => literal(parameter.name.value)))
    const callbackNames = this.CallbackNames(node)
    return S`
      _views[${literal(node.name.value)}] = TR.ViewDefinition(${
      literal(node.name.value)
    }, ${parameters}, (${callbackNames.values}, ${callbackNames.children}) => {
        ${this.Node(node.render, node.parameters, callbackNames)}
      });
    `
  }

  Node(
    node: AST.ViewRender | AST.Injection,
    parameters: readonly AST.Parameter[],
    callbackNames: CallbackNames,
  ): string {
    const Compile = this
    return Switch.kind(node, {
      ViewRender(value) {
        return `return ${Compile.ViewRender(value, callbackNames)};`
      },
      Injection(value) {
        return Compile.Injection(value, parameters, callbackNames)
      },
    })
  }

  ViewRender(node: AST.ViewRender, callbackNames: CallbackNames): string {
    return `TR.Render(_views[${literal(node.target.value)}], TR.ViewRenderArgs(${
      list(node.arguments.map(argument => this.Expression(argument, callbackNames)))
    }, ${list(node.children.map(child => this.ViewRender(child, callbackNames)))}))`
  }

  Expression(node: AST.Expression, callbackNames: CallbackNames): string {
    return Switch.kind(node, {
      Name(name) {
        return `${callbackNames.values}[${literal(name.value)}]`
      },
      TextLiteral(text) {
        return literal(text.value)
      },
    })
  }

  Injection(
    node: AST.Injection,
    parameters: readonly AST.Parameter[],
    callbackNames: CallbackNames,
  ): string {
    return [
      ...node.captures.map(capture => this.Capture(capture, parameters, callbackNames)),
      'return (() => {',
      node.code,
      '})();',
    ].join('\n')
  }

  Capture(
    node: AST.Capture,
    parameters: readonly AST.Parameter[],
    callbackNames: CallbackNames,
  ): string {
    const value = Switch.kind(node.value, {
      Name(name) {
        const parameter = parameters.find(parameter => parameter.name.value === name.value)
        const nativeType = parameter?.type.value === 'text' ? ' as string' : ''
        return `${callbackNames.values}[${literal(name.value)}]${nativeType}`
      },
      ContextReference(reference) {
        return reference.value === 'children'
          ? callbackNames.children
          : Errors.ThrowUserInput(`Unsupported injection context @@${reference.value}.`)
      },
    })
    return `const ${node.name.value} = ${value};`
  }

  CallbackNames(node: AST.ViewDeclaration): CallbackNames {
    const occupied = new Set<string>(node.parameters.map(parameter => parameter.name.value))
    const injection = node.render.kind === 'Injection' ? node.render : undefined
    for (const capture of injection?.captures ?? []) {
      occupied.add(capture.name.value)
    }
    return {
      values: unusedName('_taoValues', occupied),
      children: unusedName('_taoChildren', occupied),
    }
  }
}

type CallbackNames = { values: string; children: string }

function unusedName(base: string, occupied: Set<string>): string {
  let candidate = base
  let suffix = 0
  while (occupied.has(candidate)) {
    candidate = `${base}${++suffix}`
  }
  occupied.add(candidate)
  return candidate
}

function literal(value: string): string {
  return JSON.stringify(value)
}

function list(values: readonly string[]): string {
  return `[${values.join(', ')}]`
}
