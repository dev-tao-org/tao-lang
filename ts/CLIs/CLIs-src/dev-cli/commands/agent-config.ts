import { Repo } from '@shared/os'
import { registerCommand } from './_command-runner'

/** agentConfigCommand regenerates supported agent subagents and hooks. */
export default registerCommand({
  name: 'agent-config',
  description: 'Regenerate supported agent subagents and hooks from canonical sources.',
  async action() {
    const { generate } = await import('rulesync')
    const root = Repo.getWorkspaceRoot()
    const targets = [
      { target: 'codexcli', features: ['subagents', 'hooks'] },
      { target: 'claudecode', features: ['subagents', 'hooks'] },
      { target: 'cursor', features: ['subagents'] },
    ] as const
    for (const { target, features } of targets) {
      await generate({
        configPath: '.rulesync/rulesync.jsonc',
        features: [...features],
        inputRoot: root,
        outputRoots: [root],
        targets: [target],
      })
    }
  },
})
