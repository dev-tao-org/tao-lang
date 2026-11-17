import { S, Switch } from '@shared'

/** ModuleRefreshLayout selects one experimental component-module grouping. */
export type ModuleRefreshLayout = 'single-app' | 'per-source-file' | 'per-view'

/** ModuleRefreshFixture describes a stable module tree and the one file edited per sample. */
export type ModuleRefreshFixture = {
  files: readonly { path: string; source: string }[]
  editedPath: string
  editSource(factor: number, label: string): string
}

/** createModuleRefreshFixture emits the same two-view behavior with alternative stable module boundaries. */
export function createModuleRefreshFixture(layout: ModuleRefreshLayout): ModuleRefreshFixture {
  return Switch(layout, {
    'single-app': singleAppFixture,
    'per-source-file': sourceFileFixture,
    'per-view': perViewFixture,
  })
}

const metricsDeclaration = S`
  const metrics = (globalThis as any).__taoModuleRefreshMetrics ??= {
    primaryRenders: 0,
    secondaryRenders: 0,
  }
`

const valuesModule = S`
  export const primaryInitial = 1
  export const secondaryInitial = 10
`

function singleAppFixture(): ModuleRefreshFixture {
  return {
    files: [{ path: 'src/App.tsx', source: singleAppSource(2, 'Primary baseline') }],
    editedPath: 'src/App.tsx',
    editSource: singleAppSource,
  }
}

function sourceFileFixture(): ModuleRefreshFixture {
  return {
    files: [
      { path: 'src/Values.ts', source: valuesModule },
      { path: 'src/source/Views.tsx', source: sourceFileModule(2, 'Primary baseline') },
      { path: 'src/App.tsx', source: wiredAppSource('./source/Views') },
    ],
    editedPath: 'src/source/Views.tsx',
    editSource: sourceFileModule,
  }
}

function perViewFixture(): ModuleRefreshFixture {
  return {
    files: [
      { path: 'src/Values.ts', source: valuesModule },
      { path: 'src/views/Primary.tsx', source: primaryViewModule(2, 'Primary baseline') },
      { path: 'src/views/Secondary.tsx', source: secondaryViewModule() },
      { path: 'src/App.tsx', source: perViewAppSource() },
    ],
    editedPath: 'src/views/Primary.tsx',
    editSource: primaryViewModule,
  }
}

function singleAppSource(factor: number, label: string): string {
  return S`
    import React from '@runtime/client/Bridge_react/Bridge_react'
    import Tao from '@tao/runtime-api'

    ${metricsDeclaration}
    ${primaryComponent(factor, label, '1')}
    ${secondaryComponent('10')}

    function App() {
      return React.createElement(Tao.View, null,
        React.createElement(PrimaryView),
        React.createElement(SecondaryView),
      )
    }

    export { PrimaryView, SecondaryView }
    export default App
  `
}

function sourceFileModule(factor: number, label: string): string {
  return S`
    import React from '@runtime/client/Bridge_react/Bridge_react'
    import Tao from '@tao/runtime-api'
    import { primaryInitial, secondaryInitial } from '../Values'

    ${metricsDeclaration}
    ${primaryComponent(factor, label, 'primaryInitial')}
    ${secondaryComponent('secondaryInitial')}

    export { PrimaryView, SecondaryView }
  `
}

function primaryViewModule(factor: number, label: string): string {
  return S`
    import React from '@runtime/client/Bridge_react/Bridge_react'
    import Tao from '@tao/runtime-api'
    import { primaryInitial } from '../Values'

    ${metricsDeclaration}
    ${primaryComponent(factor, label, 'primaryInitial', true)}
  `
}

function secondaryViewModule(): string {
  return S`
    import React from '@runtime/client/Bridge_react/Bridge_react'
    import Tao from '@tao/runtime-api'
    import { secondaryInitial } from '../Values'

    ${metricsDeclaration}
    ${secondaryComponent('secondaryInitial', true)}
  `
}

function primaryComponent(factor: number, label: string, initial: string, exported = false): string {
  return S`
    ${exported ? 'export ' : ''}function PrimaryView() {
      metrics.primaryRenders += 1
      const count = Tao.useWritable(() => ${initial})
      const current = Tao.useValue(count)
      const scaled = Tao.useComputed(() => count.jsValue() * ${factor}, [count])
      const scaledValue = Tao.useValue(scaled)
      return React.createElement(Tao.View, null,
        React.createElement(Tao.Text, { testID: 'primary-label' }, '${label}'),
        React.createElement(Tao.Text, { testID: 'primary-count' }, String(current)),
        React.createElement(Tao.Text, { testID: 'primary-scaled' }, String(scaledValue)),
        React.createElement(Tao.Pressable, {
          testID: 'increment-primary', onPress: () => count.update(current + 1),
        }, React.createElement(Tao.Text, null, 'increment primary')),
      )
    }
  `
}

function secondaryComponent(initial: string, exported = false): string {
  return S`
    ${exported ? 'export ' : ''}function SecondaryView() {
      metrics.secondaryRenders += 1
      const count = Tao.useWritable(() => ${initial})
      const current = Tao.useValue(count)
      const scaled = Tao.useComputed(() => count.jsValue() * 2, [count])
      const scaledValue = Tao.useValue(scaled)
      return React.createElement(Tao.View, null,
        React.createElement(Tao.Text, { testID: 'secondary-label' }, 'Secondary stable'),
        React.createElement(Tao.Text, { testID: 'secondary-count' }, String(current)),
        React.createElement(Tao.Text, { testID: 'secondary-scaled' }, String(scaledValue)),
        React.createElement(Tao.Pressable, {
          testID: 'increment-secondary', onPress: () => count.update(current + 1),
        }, React.createElement(Tao.Text, null, 'increment secondary')),
      )
    }
  `
}

function wiredAppSource(componentDirectory: string): string {
  return S`
    import React from '@runtime/client/Bridge_react/Bridge_react'
    import Tao from '@tao/runtime-api'
    import { PrimaryView, SecondaryView } from '${componentDirectory}'

    function App() {
      return React.createElement(Tao.View, null,
        React.createElement(PrimaryView),
        React.createElement(SecondaryView),
      )
    }

    export default App
  `
}

function perViewAppSource(): string {
  return S`
    import React from '@runtime/client/Bridge_react/Bridge_react'
    import Tao from '@tao/runtime-api'
    import { PrimaryView } from './views/Primary'
    import { SecondaryView } from './views/Secondary'

    function App() {
      return React.createElement(Tao.View, null,
        React.createElement(PrimaryView),
        React.createElement(SecondaryView),
      )
    }

    export default App
  `
}
