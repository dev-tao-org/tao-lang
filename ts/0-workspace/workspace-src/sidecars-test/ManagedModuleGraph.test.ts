import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { auditInstalledGraph, collectAllRequirements } from '../sidecars/ManagedModuleGraph'
import type { ManagedModulesInput, NormalizedManagedRequirement } from '../sidecars/ManagedModuleTypes'
import { calculateManagedGraphFingerprint, normalizeManagedRequirements } from '../sidecars/ManagedNpmIdentity'

const ResolvedPackageNameMismatchErrorRegx = /resolved package different-name/
const DeclaredPeerRangeMismatchErrorRegx = /does not satisfy \^4/
const IncompatibleReactSingletonErrorRegx = /incompatible singleton react/

Tests.test('normalization retains named requirement fields without changing the durable graph identity', () => {
  const input = buildManagedInput('/project')
  const requirement = { name: 'Alpha', version: '1.0.0', origin: 'A.tao\nDetails', directory: '/ignored' }
  input.modules = [
    { directory: '/project/z', requirements: [{ name: 'alpha', version: '1.0.0', origin: 'Z.tao' }] },
    { directory: '/project/a', requirements: [requirement] },
  ]
  const normalized = normalizeManagedRequirements(input)
  Tests.expect(normalized).toEqual([
    { directory: '/project/a', name: 'Alpha', version: '1.0.0', origin: 'A.tao\nDetails' },
    { directory: '/project/z', name: 'alpha', version: '1.0.0', origin: 'Z.tao' },
  ])
  const canonicalGraph =
    '{"requirements":{"Alpha":"1.0.0","alpha":"1.0.0"},"target":"browser","runtimePins":{},"singletonPackages":["expo","react","react-dom","react-native","react-native-web"],"policyRegistryVersion":1}'
  Tests.expect(calculateManagedGraphFingerprint(input, normalized)).toBe(Platform.hashText(canonicalGraph))
})

Tests.test('managed requirements validate the complete version without treating newlines as field separators', () => {
  const requirements = [{ directory: '', name: 'alpha', version: '1.0.0\nOther.tao', origin: 'Owner.tao' }]
  Tests.expect(() => collectAllRequirements(requirements)).toThrow('exact version for alpha in Owner.tao')
})

Tests.test('accepts mixed-case npm package names in managed requirements', () => {
  Tests.expect(collectAllRequirements([
    { directory: '', name: 'JSONStream', version: '1.3.5', origin: 'Legacy.tao' },
    { directory: '', name: '@scope/JSONStream', version: '1.3.5', origin: 'Scoped.tao' },
  ])).toEqual({ '@scope/JSONStream': '1.3.5', JSONStream: '1.3.5' })
})

Tests.test('orders canonical npm requirements by code point', () => {
  const requirements = collectAllRequirements([
    { directory: '', name: 'alpha', version: '1.0.0', origin: 'Lowercase.tao' },
    { directory: '', name: 'Alpha', version: '1.0.0', origin: 'Uppercase.tao' },
  ])
  Tests.expect(Object.keys(requirements)).toEqual(['Alpha', 'alpha'])
})

Tests.test('checks installed npm aliases against target names, ranges, and singleton versions', async () => {
  const profile = Artifacts.resolvePath('tmp', `managed-alias-${Platform.randomUUID()}`)
  const requirements: NormalizedManagedRequirement[] = [
    { directory: '', name: 'holder', version: '1.0.0', origin: 'Holder.tao' },
  ]
  const input = buildManagedInput(profile)
  await Try(async () => {
    await writePackage(profile, 'holder', 'holder', '1.0.0', {
      'string-width-cjs': 'npm:string-width@^4',
    })
    await writePackage(profile, 'string-width-cjs', 'different-name', '4.1.0')
    await Tests.rejects(
      auditInstalledGraph(profile, input, requirements),
      ResolvedPackageNameMismatchErrorRegx,
    )

    await writePackage(profile, 'string-width-cjs', 'string-width', '3.0.0')
    await Tests.rejects(auditInstalledGraph(profile, input, requirements), DeclaredPeerRangeMismatchErrorRegx)

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
      IncompatibleReactSingletonErrorRegx,
    )
  }, { finally: () => FileSystem.rm(profile, { recursive: true, force: true }) })
})

function buildManagedInput(directory: string): ManagedModulesInput {
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
  await FileSystem.mkdir(directory)
  await FileSystem.writeFile(Path.join(directory, 'package.json'), JSON.stringify({ name, version, dependencies }))
}
