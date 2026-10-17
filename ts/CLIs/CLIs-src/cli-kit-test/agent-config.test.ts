import { S } from '@shared'
import { Test } from '@shared/os'
import { agentHostCommandPrefixes, renderClaudeHostSettings } from '../cli-kit/agent-config-claude-host'
import { codexDomains, parsePermissions, renderCodexConfig, renderCodexRules } from '../cli-kit/agent-config-codex'
import { generateAgentConfig } from '../cli-kit/agent-config-generator'
import { parseProfiles } from '../cli-kit/agent-config-profiles'
import { profileSettingsPath, renderClaudeProfile } from '../cli-kit/agent-config-profiles-renderer'

Test.test('agent config dispatches each canonical feature set to its intended harness', async () => {
  const calls: { target: string; features: readonly string[] }[] = []
  await generateAgentConfig({
    root: '/virtual/repo',
    isFile() {
      return false
    },
    async generate(options) {
      calls.push({ target: options.targets?.[0] ?? '', features: options.features ?? [] })
      return undefined
    },
    async generateClaudeHostSettings() {},
    async generateCodexConfig() {},
    async generateClaudeProfiles() {},
  })
  Test.expect(calls).toEqual([
    { target: 'codexcli', features: ['subagents', 'hooks'] },
    { target: 'claudecode', features: ['subagents', 'permissions', 'hooks'] },
    { target: 'cursor', features: ['subagents'] },
  ])
})

Test.test('agent profiles inherit write paths and render sorted standalone Claude settings', () => {
  const profiles = parseProfiles(S`
    {
      "profiles": {
        "base": { "description": "Base profile", "allowWrite": ["~/z", "~/a"] },
        "child": { "description": "Child profile", "extends": "base", "ask": ["z", "a"], "allow": ["y"] },
        "unrestricted": { "description": "No sandbox", "sandbox": false }
      }
    }
  `)
  Test.expect(profileSettingsPath('child')).toBe('.claude/settings.child.json')
  Test.expect(renderClaudeProfile(profiles, 'child')).toContain('"allowWrite": [\n        "~/a",\n        "~/z"')
  Test.expect(renderClaudeProfile(profiles, 'child')).toContain('"excludedCommands": [\n      "a",\n      "z"')
  Test.expect(renderClaudeProfile(profiles, 'unrestricted')).toContain('"enabled": false')
})

Test.test('Codex configuration narrows wildcard domains, translates network and profile rules', () => {
  const domains = codexDomains(['npmjs.org', '*.npmjs.org', 'api.example.com', '*.example.com'])
  Test.expect(domains).toEqual(['**.example.com', '**.npmjs.org'])
  const permissions = parsePermissions(S`
    {
      "permission": { "read": { "~/code/tao-lang/**": "allow", "**/.env": "deny" } },
      "claudecode": { "sandbox": { "filesystem": { "allowWrite": ["~/.cache"] },
        "network": { "allowLocalBinding": true, "allowUnixSockets": ["~/.sock", "/var/run/docker.sock"],
          "allowedDomains": ["*.example.com"] } } },
      "agentHostCommands": ["setup", "land"]
    }
  `)
  const profiles = parseProfiles('{"profiles":{"native":{"description":"Native","allowWrite":["~/sim"]}}}')
  const content = renderCodexConfig(
    permissions,
    profiles,
    '| standard | `opus` | `gpt-6.1-sol` | `claude-opus-5-5` |',
  )
  Test.expect(content).toContain('default_subagent_model = "gpt-6.1-sol"')
  Test.expect(content).toContain('allow_local_binding = true')
  Test.expect(content).toContain('"/var/run/docker.sock" = "allow"')
  Test.expect(content).not.toContain('"~/.sock" = "allow"')
  Test.expect(content).toContain('[permissions.tao-native.filesystem]')
  Test.expect(renderCodexRules(permissions)).toContain('"./agent","unsandboxed","setup"')
})

Test.test('Claude host settings remove deleted source keys and maintain one host rule per operation', () => {
  const source = {
    agentHostCommands: ['setup', 'land subcommand'],
    claudecode: { sandbox: { enabled: true } },
  }
  const prefixes = agentHostCommandPrefixes(source)
  const output = renderClaudeHostSettings(
    JSON.stringify({
      $schema: 'schema',
      permissions: { allow: ['Bash(./agent unsandboxed setup)', 'Bash(other)'], ask: ['Bash(keep)'] },
      sandbox: { excludedCommands: ['old'], enabled: true, removed: true },
    }),
    prefixes,
    source.claudecode,
    { allow: ['Bash(ls *)'], deny: ['Bash(rm *)'] },
  )
  const settings = JSON.parse(output)
  Test.expect(settings.permissions.allow).toEqual([
    'Bash(ls *)',
    'Bash(./agent unsandboxed setup)',
    'Bash(./agent unsandboxed setup *)',
    'Bash(./agent unsandboxed land)',
    'Bash(./agent unsandboxed land *)',
  ])
  Test.expect(settings.permissions.ask).toBeUndefined()
  Test.expect(settings.sandbox.removed).toBeUndefined()
  Test.expect(settings.sandbox.excludedCommands).toHaveLength(4)
})
