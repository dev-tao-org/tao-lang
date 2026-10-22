import * as AST from '@ast-gen/AST'
import { Path } from '@shared/os'
import type { SourceModule } from '@typecheck/Modules'
import { validateRequirementPlacement } from '../dependencies/Requirements'
import { isNpmRequirement } from '../ModuleRequirements'
import { listRecursiveSourceFiles } from './Catalog'
import { findNamedPackageRoot, findNearestProjectRoot } from './Paths'

/** loadRequirementModules includes module-owned npm metadata without linking unrelated declarations or imports.
 *  Only reached modules are inventoried. Parsed documents share this build's exact read snapshots;
 *  missing files and incomplete declarations remain authoritative failures before setup or publication. */
export async function loadRequirementModules(
  sources: readonly SourceModule[],
  root: string,
  readDocument: (path: string) => Promise<AST.Document>,
): Promise<SourceModule[]> {
  const modules = new Map<string, string>()
  const known = new Set(sources.map(source => source.path))
  const metadata: SourceModule[] = []
  for (const source of sources) {
    const owner = findNearestProjectRoot(Path.dirname(source.path)) ?? root
    modules.set(findNamedPackageRoot(source.path, owner) ?? owner, owner)
  }
  for (const [directory, owner] of modules) {
    for (const path of await listRecursiveSourceFiles(directory, directory, owner)) {
      if (known.has(path)) {
        continue
      }
      const document = await readDocument(path)
      validateRequirementPlacement(document, path, owner)
      const declarations = AST.GetDeclarations(document).filter(isNpmRequirement)
      if (declarations.length > 0) {
        metadata.push({
          path,
          document: { ...document, root: { ...document.root, declarations } },
          imports: [],
          siblings: [],
        })
      }
    }
  }
  return metadata
}
