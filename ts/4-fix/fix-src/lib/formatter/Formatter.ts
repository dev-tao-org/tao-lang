import * as CST from '@cst'
import type { NodeType, SyntaxNode, Tree } from '@cst'
import { Timings } from '@shared'
import { NodeLayout } from '../layout/NodeLayout'
import { createPlan, isCompleteNode, type LayoutPlan } from '../layout/Plan'
import { NodeFormat } from './NodeFormat'

/** FormattingHandlers checks each rule's property and token selectors against generated CST types. */
export type FormattingHandlers = { [Kind in NodeType]?: (fm: NodeFormat<Kind>) => void }

/** LayoutHandlers checks each node's vertical layout handler against its generated CST rule. */
export type LayoutHandlers = { [Kind in NodeType]?: (lm: NodeLayout<Kind>) => void }

/** formattingPlan collects both rule tables during one traversal of complete declarations. */
export function formattingPlan(
  source: string,
  tree: Tree,
  formatting: FormattingHandlers,
  layout: LayoutHandlers,
  timings: Timings,
): LayoutPlan {
  return timings.run(collectRules, source, tree, formatting, layout)
}

const collectRules = Timings.measured('formatter.rules', function(
  source: string,
  tree: Tree,
  formatting: FormattingHandlers,
  layout: LayoutHandlers,
): LayoutPlan {
  const plan = createPlan(source, tree)
  if (!tree.rootNode.hasError) {
    visit(tree.rootNode, undefined, plan, formatting, layout)
  } else {
    for (const node of tree.rootNode.namedChildren) {
      if (isCompleteNode(node)) {
        visit(node, tree.rootNode, plan, formatting, layout)
      }
    }
  }
  protectComments(plan)
  return plan
})

function visit(
  node: SyntaxNode,
  parent: SyntaxNode | undefined,
  plan: LayoutPlan,
  formatting: FormattingHandlers,
  layout: LayoutHandlers,
): void {
  const kind = node.type as NodeType
  const formatRule = formatting[kind] as ((fm: NodeFormat<NodeType>) => void) | undefined
  const layoutRule = layout[kind] as ((lm: NodeLayout<NodeType>) => void) | undefined
  formatRule?.(new NodeFormat(node, plan, parent))
  layoutRule?.(new NodeLayout(node, plan, parent))
  for (const child of node.namedChildren) {
    visit(child, node, plan, formatting, layout)
  }
}

function protectComments(plan: LayoutPlan): void {
  for (const [index, token] of plan.tokens.entries()) {
    if (!CST.IsComment(token)) {
      continue
    }
    const after = plan.gaps[index + 1]!
    if (token.text.startsWith('//')) {
      after.lines = Math.max(1, after.lines)
    }
  }
}
