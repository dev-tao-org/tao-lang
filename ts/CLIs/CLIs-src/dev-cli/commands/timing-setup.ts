import { IO } from '@cli-kit'
import { S } from '@shared'
import { registerCommand } from './_command-runner'

/** timingSetupCommand prints the handoff for preparing an SSH timing runner. */
export default registerCommand({
  name: 'timing-setup',
  description: 'Print a prompt for an agent to prepare an SSH timing runner.',
  action() {
    IO.print(S`
      Set up a Tao timing runner so I can run just timing-run from my worktree.
      Use the performance-investigation skill and read Docs/Dev Env/Performance/Remote timing workflow.md.
      Ask me for the existing SSH alias or user@hostname and the runner's Tao tooling checkout if unknown.
      Help me enable Remote Login for my existing account if needed. Verify the host fingerprint through SSH.
      Reuse existing SSH key access. If new enrollment is needed, confirm it with me and use
      ./agent ssh-key-setup HOST. If enrollment needs a Terminal or a password, give me the exact command.
      Keep SSH host-key checking enabled.
      Prepare the runner's tooling checkout with the pinned Tao environment and verify headless preview support.
      Run ./agent timing-configure HOST TOOLING to verify access and save the runner under ~/.tao-dev/timing.
      Confirm the setup with just timing-run --dry-run. Tell me what was verified and whether a real run is pending.
    `)
  },
})
