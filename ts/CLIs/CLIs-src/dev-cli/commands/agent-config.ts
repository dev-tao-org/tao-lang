import { registerCommand } from './_command-runner'

/** agentConfigCommand generates local adapters before installing Codex Git metadata grants. */
export default registerCommand({
  name: 'agent-config',
  description: 'Regenerate repository harness configuration from its canonical sources.',
  async action() {
    const { generateRepositoryAgentConfig } = await import('../../cli-kit/agent-config-generator')
    await generateRepositoryAgentConfig()
    const { installGitPermissions } = await import('../../cli-kit/agent-git-permissions')
    await installGitPermissions()
  },
})
