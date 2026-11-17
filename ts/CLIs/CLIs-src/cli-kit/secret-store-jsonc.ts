import { Errors } from '@shared'
import { TypeScript } from '@tao/shared/typescript'

/** assertUniqueSecretStoreKeys rejects JSONC keys that conversion would overwrite or discard. */
export function assertUniqueSecretStoreKeys(source: string): void {
  visit(TypeScript.parseJsonText('secrets.jsonc', source))
}

function visit(node: TypeScript.Node): void {
  if (TypeScript.isObjectLiteralExpression(node)) {
    const names = new Set<string>()
    for (const property of node.properties) {
      if (!TypeScript.isPropertyAssignment(property) || !TypeScript.isStringLiteralLike(property.name)) {
        continue
      }
      const name = property.name.text
      if (name === '__proto__' || names.has(name)) {
        Errors.ThrowUserInput(`The secret store contains a duplicate or reserved key: ${name}`)
      }
      names.add(name)
    }
  }
  TypeScript.forEachChild(node, visit)
}
