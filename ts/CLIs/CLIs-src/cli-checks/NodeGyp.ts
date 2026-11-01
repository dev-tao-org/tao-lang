import { Regxs } from '@shared'
import { FileSystem, Path } from '@shared/os'

/** NodeGypOptions contains the resolved Node root, optional local headers, and safe child environment. */
export type NodeGypOptions = {
  root: string
  headers: string[]
  environment: { NODE_OPTIONS: string }
}

/** nodeGypOptions shares header selection and warning configuration across native addon builders. */
export function nodeGypOptions(executable: string, inheritedOptions: InheritedNodeOptions): NodeGypOptions {
  const root = Path.dirname(Path.dirname(executable))
  return {
    root,
    headers: FileSystem.existsSync(Path.join(root, 'include/node/node.h')) ? ['--nodedir', root] : [],
    environment: { NODE_OPTIONS: withNodeGypWarning(inheritedOptions) },
  }
}

type InheritedNodeOptions = string | undefined

function withNodeGypWarning(inheritedOptions: InheritedNodeOptions): string {
  const flag = '--disable-warning=DEP0169'
  const options = (inheritedOptions ?? '').split(Regxs.WhitespaceRunsRegx).filter(Boolean)
  if (!options.includes(flag)) {
    options.push(flag)
  }
  return options.join(' ')
}
