import { registerCommand } from './_command-runner'

/** shellSetupCommand offers optional automatic development shell activation. */
export default registerCommand({
  name: 'shell-setup',
  description: 'Offer automatic development environments for this repository and its worktrees.',
  arguments: [{ name: 'args', description: 'Optional --configure or --prepare flags.', variadic: true }],
  allowUnknownOptions: true,
  async action(args: string[]) {
    const configure = args.includes('--configure')
    const prepare = args.includes('--prepare')
    const { runDirenvSetup } = await import('../shell/DirenvSetup')
    await runDirenvSetup({ configure, prepare })
  },
})
