import { IO } from '@cli-kit'
import { Artifacts, FS, Repo } from '@shared/os'
import { assertNewWorkspaceTree } from '../../cli-checks/check'
import { registerCommand } from './_command-runner'

/** packageGraphCommand writes a diagram and file import evidence for the TypeScript workspace. */
export default registerCommand({
  name: 'package-graph',
  description: 'Write diagrams and import evidence for TypeScript workspace package dependencies.',
  async action() {
    await assertNewWorkspaceTree()
    const RepoAnalysis = await import('@repo-analysis')
    const graph = await RepoAnalysis.analyzePackageGraph(Repo.resolvePath('ts'))
    const markdownPath = Artifacts.resolvePath('package-graph.md')
    const evidencePath = Artifacts.resolvePath('package-graph.json')
    await FS.writeIfChanged(markdownPath, RepoAnalysis.renderPackageGraph(graph))
    await FS.writeIfChanged(evidencePath, RepoAnalysis.serializePackageGraph(graph))
    IO.summary(`Package graph: ${markdownPath}`)
    IO.summary(`Import evidence: ${evidencePath}`)
  },
})
