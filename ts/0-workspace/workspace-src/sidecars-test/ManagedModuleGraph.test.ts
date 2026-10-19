import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { allRequirements, auditInstalledGraph } from '../sidecars/ManagedModuleGraph'
import type { ManagedModulesInput } from '../sidecars/ManagedModuleTypes'

Tests.test('accepts mixed-case npm package names in managed requirements', () => {
  Tests.expect(allRequirements([
    ['', 'JSONStream', '1.3.5\nLegacy.tao'],
    ['', '@scope/JSONStream', '1.3.5\nScoped.tao'],
  ])).toEqual({ '@scope/JSONStream': '1.3.5', JSONStream: '1.3.5' })
})

Tests.test('orders canonical npm requirements by code point', () => {
  const requirements = allRequirements([
    ['', 'alpha', '1.0.0\nLowercase.tao'],
    ['', 'Alpha', '1.0.0\nUppercase.tao'],
  ])
  Tests.expect(Object.keys(requirements)).toEqual(['Alpha', 'alpha'])
})

Tests.test('checks installed npm aliases against target names, ranges, and singleton versions', async () => {
  const profile = Artifacts.resolvePath('tmp', `managed-alias-${Platform.randomUUID()}`)
  const requirements: [string, string, string][] = [['', 'holder', '1.0.0\nHolder.tao']]
  const input = managedInput(profile)
  await Try(async () => {
    await writePackage(profile, 'holder', 'holder', '1.0.0', {
      'string-width-cjs': 'npm:string-width@^4',
    })
    await writePackage(profile, 'string-width-cjs', 'different-name', '4.1.0')
    await Tests.rejects(
      auditInstalledGraph(profile, input, requirements),
      /resolved package different-name/,
    )

    await writePackage(profile, 'string-width-cjs', 'string-width', '3.0.0')
    await Tests.rejects(auditInstalledGraph(profile, input, requirements), /does not satisfy \^4/)

    await writePackage(profile, 'holder', 'holder', '1.0.0', { 'string-width-cjs': 'npm:string-width' })
    await auditInstalledGraph(profile, input, requirements)
    await writePackage(profile, 'holder', 'holder', '1.0.0', { 'string-width-cjs': 'npm:string-width@latest' })
    await auditInstalledGraph(profile, input, requirements)
    await writePackage(profile, 'holder', 'holder', '1.0.0', { 'string-width-cjs': 'npm:@scope/string-width@^4' })
    await writePackage(profile, 'string-width-cjs', '@scope/string-width', '4.1.0')
    await auditInstalledGraph(profile, input, requirements)

    await writePackage(profile, 'holder', 'holder', '1.0.0', { 'react-cjs': 'npm:react@^18' })
    await writePackage(profile, 'react', 'react', '19.1.0')
    await writePackage(profile, 'react-cjs', 'react', '18.0.0')
    await Tests.rejects(
      auditInstalledGraph(profile, { ...input, runtimePins: { react: '19.1.0' } }, requirements),
      /incompatible singleton react/,
    )
  }, { finally: () => FileSystem.rm(profile, { recursive: true, force: true }) })
})

function managedInput(directory: string): ManagedModulesInput {
  return { directory, modules: [], target: 'browser', runtimePins: {}, bunVersion: '1.4.2' }
}

async function writePackage(
  profile: string,
  installName: string,
  name: string,
  version: string,
  dependencies?: Record<string, string>,
): Promise<void> {
  const directory = Path.join(profile, 'node_modules', installName)
  await FileSystem.mkdir(directory, { recursive: true })
  await FileSystem.writeFile(Path.join(directory, 'package.json'), JSON.stringify({ name, version, dependencies }))
}
