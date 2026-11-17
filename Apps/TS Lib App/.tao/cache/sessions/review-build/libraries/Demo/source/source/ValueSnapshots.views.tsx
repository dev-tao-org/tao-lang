import * as TR from '@runtime';
import Tao from '@tao/runtime-api';
import type { Scope as ModuleScope, Imports as ModuleImports } from "./ValueSnapshots";


function useTaoInjectionValueSnapshots_d91ca1acb358() {
  const mode = Tao.useWritable(() => 'initial')
      const value = Tao.useComputed(() => {
        const currentMode = mode.jsValue()
        const reordered = currentMode === 'reordered' || currentMode === 'extra-duplicate'
        const labels = reordered ? ['B', 'A', 'A'] : ['A', 'A', 'B']
        if (currentMode === 'extra-duplicate') {
          labels.push('A')
        }
        return { rows: labels.map(label => ({ label })) }
      }, [mode])
      const comparison = Tao.useWritable(() => '')
      const snapshot = Tao.useValue(value)
      const result = Tao.useValue(comparison)
      return (
        <Tao.View>
          <Tao.Text>{snapshot.rows.map(row => row.label).join(', ')}</Tao.Text>
          <Tao.Pressable testID="recompute-equal" onPress={() => {
            const previous = value.jsValue()
            mode.update('equal')
            comparison.update(value.jsValue() === previous ? 'Reused snapshot' : 'Replaced snapshot')
          }}>
            <Tao.Text>Recompute equal rows</Tao.Text>
          </Tao.Pressable>
          <Tao.Text>{result}</Tao.Text>
          <Tao.Pressable testID="reorder-rows" onPress={() => mode.update('reordered')}>
            <Tao.Text>Reorder rows</Tao.Text>
          </Tao.Pressable>
          <Tao.Pressable testID="add-duplicate-row" onPress={() => mode.update('extra-duplicate')}>
            <Tao.Text>Add another matching row</Tao.Text>
          </Tao.Pressable>
        </Tao.View>
      )
}
export function TaoView_ValueSnapshots_d91ca1acb358(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;

  return TR.finishViewRender(_Render, useTaoInjectionValueSnapshots_d91ca1acb358());
}