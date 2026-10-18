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
    return S`
      _views[${literal(node.name.value)}] = TR.ViewDefinition(${
      literal(node.name.value)
    }, ${parameters}, (_values, _children) => {
        ${this.Node(node.render, node.parameters)}
      });
    `
  }

  Node(node: AST.ViewRender | AST.Injection, parameters: readonly AST.Parameter[]): string {
    const Compile = this
    return Switch.kind(node, {
      ViewRender(value) {
        return `return ${Compile.ViewRender(value)};`
      },
      Injection(value) {
        return Compile.Injection(value, parameters)
      },
    })
  }

  ViewRender(node: AST.ViewRender): string {
    return `TR.Render(_views[${literal(node.target.value)}], TR.ViewRenderArgs(${
      list(node.arguments.map(argument => this.Expression(argument)))
    }, ${list(node.children.map(child => this.ViewRender(child)))}))`
  }

  Expression(node: AST.Expression): string {
    return Switch.kind(node, {
      Name(name) {
        return `_values[${literal(name.value)}]`
      },
      TextLiteral(text) {
        return literal(text.value)
      },
    })
  }

  Injection(node: AST.Injection, parameters: readonly AST.Parameter[]): string {
    return [...node.captures.map(capture => this.Capture(capture, parameters)), node.code].join('\n')
  }

  Capture(node: AST.Capture, parameters: readonly AST.Parameter[]): string {
    const value = Switch.kind(node.value, {
      Name(name) {
        const parameter = parameters.find(parameter => parameter.name.value === name.value)
        const nativeType = parameter?.type.value === 'text' ? ' as string' : ''
        return `_values[${literal(name.value)}]${nativeType}`
      },
      ContextReference(reference) {
        return reference.value === 'children'
          ? '_children'
          : Errors.ThrowUserInput(`Unsupported injection context @@${reference.value}.`)
      },
    })
    return `const ${node.name.value} = ${value};`
  }
}

function literal(value: string): string {
  return JSON.stringify(value)
}

function list(values: readonly string[]): string {
  return `[${values.join(', ')}]`
}
