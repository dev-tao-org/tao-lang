import { Json } from '@shared'
import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import * as ManagedModuleGraph from '../../workspace-src/sidecars/ManagedModule/ManagedModuleGraph'
import type * as ManagedModuleTypes from '../../workspace-src/sidecars/ManagedModule/ManagedModuleTypes'
import * as ManagedNpmIdentity from '../../workspace-src/sidecars/ManagedNpm/ManagedNpmIdentity'

const ResolvedPackageNameMismatchErrorRegx = /resolved package different-name/
const DeclaredPeerRangeMismatchErrorRegx = /does not satisfy \^4/
const IncompatibleReactSingletonErrorRegx = /incompatible singleton react/

Tests.test('normalization retains named requirement fields without changing the durable graph identity', () => {
  const input = buildManagedInput('/project')
  const requirement = {
    name: 'Alpha',
    version: '1.0.0',
    origin: S`
      A.tao
      Details
    `,
    directory: '/ignored',
  }
  input.modules = [
    { directory: '/project/z', requirements: [{ name: 'alpha', version: '1.0.0', origin: 'Z.tao' }] },
    { directory: '/project/a', requirements: [requirement] },
  ]
  const normalized = ManagedNpmIdentity.normalizeManagedRequirements(input)
  Tests.expect(normalized).toEqual([
    { directory: '/project/a', name: 'Alpha', version: '1.0.0', origin: 'A.tao\nDetails' },
    { directory: '/project/z', name: 'alpha', version: '1.0.0', origin: 'Z.tao' },
  ])
  const canonicalGraph =
    '{"requirements":{"Alpha":"1.0.0","alpha":"1.0.0"},"target":"browser","runtimePins":{},"singletonPackages":["expo","react","react-dom","react-native","react-native-web"],"policyRegistryVersion":1}'
  Tests.expect(ManagedNpmIdentity.calculateManagedGraphFingerprint(input, normalized)).toBe(
    Platform.hashText(canonicalGraph),
  )
})

Tests.test('managed requirements validate the complete version without treating newlines as field separators', () => {
  const requirements = [{
    directory: '',
    name: 'alpha',
    version: S`
      1.0.0
      Other.tao
    `,
    origin: 'Owner.tao',
  }]
  Tests.expect(() => ManagedModuleGraph.collectAllRequirements(requirements)).toThrow(
    'exact version for alpha in Owner.tao',
  )
})

Tests.test('accepts mixed-case npm package names in managed requirements', () => {
  Tests.expect(ManagedModuleGraph.collectAllRequirements([
    { directory: '', name: 'JSONStream', version: '1.3.5', origin: 'Legacy.tao' },
    { directory: '', name: '@scope/JSONStream', version: '1.3.5', origin: 'Scoped.tao' },
  ])).toEqual({ '@scope/JSONStream': '1.3.5', 'JSONStream': '1.3.5' })
})

Tests.test('orders canonical npm requirements by ordinal string order', () => {
  const requirements = ManagedModuleGraph.collectAllRequirements([
    { directory: '', name: 'alpha', version: '1.0.0', origin: 'Lowercase.tao' },
    { directory: '', name: 'Alpha', version: '1.0.0', origin: 'Uppercase.tao' },
  ])
  Tests.expect(Object.keys(requirements)).toEqual(['Alpha', 'alpha'])
})

Tests.test('checks installed npm aliases against target names, ranges, and singleton versions', async () => {
  const profile = Artifacts.resolvePath('tmp', `managed-alias-${Platform.randomUUID()}`)
  const requirements: ManagedModuleTypes.NormalizedManagedRequirement[] = [
    { directory: '', name: 'holder', version: '1.0.0', origin: 'Holder.tao' },
  ]
  const input = buildManagedInput(profile)
  await Try(async () => {
    await writePackage(profile, 'holder', 'holder', '1.0.0', {
      'string-width-cjs': 'npm:string-width@^4',
    })
    await writePackage(profile, 'string-width-cjs', 'different-name', '4.1.0')
    await Tests.rejects(
      ManagedModuleGraph.auditInstalledGraph(profile, input, requirements),
      ResolvedPackageNameMismatchErrorRegx,
    )

    await writePackage(profile, 'string-width-cjs', 'string-width', '3.0.0')
    await Tests.rejects(
      ManagedModuleGraph.auditInstalledGraph(profile, input, requirements),
      DeclaredPeerRangeMismatchErrorRegx,
    )

    await writePackage(profile, 'holder', 'holder', '1.0.0', { 'string-width-cjs': 'npm:string-width' })
    await ManagedModuleGraph.auditInstalledGraph(profile, input, requirements)
    await writePackage(profile, 'holder', 'holder', '1.0.0', { 'string-width-cjs': 'npm:string-width@latest' })
    await ManagedModuleGraph.auditInstalledGraph(profile, input, requirements)
    await writePackage(profile, 'holder', 'holder', '1.0.0', { 'string-width-cjs': 'npm:@scope/string-width@^4' })
    await writePackage(profile, 'string-width-cjs', '@scope/string-width', '4.1.0')
    await ManagedModuleGraph.auditInstalledGraph(profile, input, requirements)

    await writePackage(profile, 'holder', 'holder', '1.0.0', { 'react-cjs': 'npm:react@^18' })
    await writePackage(profile, 'react', 'react', '19.1.0')
    await writePackage(profile, 'react-cjs', 'react', '18.0.0')
    await Tests.rejects(
      ManagedModuleGraph.auditInstalledGraph(profile, { ...input, runtimePins: { react: '19.1.0' } }, requirements),
      IncompatibleReactSingletonErrorRegx,
    )
  }, { finally: () => FS.rm(profile, { recursive: true, force: true }) })
})

Tests.test('keeps exact runtime pins without treating ordinary libraries as singletons', async () => {
  const profile = Artifacts.resolvePath('tmp', `managed-library-runtime-${Platform.randomUUID()}`)
  const input = { ...buildManagedInput(profile), runtimePins: { expo: '57.0.30', zod: '4.6.7' } }
  await Try(async () => {
    await writePackage(profile, 'expo', 'expo', '57.0.30', { '@expo/cli': '57.0.31' })
    await writePackage(profile, 'expo/node_modules/@expo/cli', '@expo/cli', '57.0.31', { zod: '^3.25.76' })
    await writePackage(profile, 'expo/node_modules/@expo/cli/node_modules/zod', 'zod', '3.25.76')
    await writePackage(profile, 'zod', 'zod', '4.6.7')

    await ManagedModuleGraph.auditInstalledGraph(profile, input, [])
  }, { finally: () => FS.rm(profile, { recursive: true, force: true }) })
})

function buildManagedInput(directory: string): ManagedModuleTypes.ManagedModulesInput {
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
  await FS.mkdir(directory)
  await FS.writeFile(Path.join(directory, 'package.json'), Json.Print({ name, version, dependencies }))
}
