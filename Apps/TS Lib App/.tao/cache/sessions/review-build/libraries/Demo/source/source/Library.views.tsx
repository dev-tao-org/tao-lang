import * as TR from '@runtime';
import Tao from '@tao/runtime-api';
import type { Scope as ModuleScope, Imports as ModuleImports } from "./Library";


function useTaoInjectionGreeting$PrivateGreeting_31c9b1f32197() {
  const count = Tao.useWritable(() => 0)
        const value = Tao.useValue(count)
        const caption = Tao.useComputed(() => 'Nested private Tao helper ' + count.jsValue(), [count])
        const label = Tao.useValue(caption)
        return (
          <Tao.Pressable onPress={() => count.update(value + 1)}>
            <Tao.Text>{label}</Tao.Text>
          </Tao.Pressable>
        )
}
export function TaoView_Greeting$PrivateGreeting_31c9b1f32197(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "First" | "Second" | "PrivateGreeting"> & { readonly "First": string; readonly "Second": string; readonly "PrivateGreeting": TR.View };

  return TR.finishViewRender(_Render, useTaoInjectionGreeting$PrivateGreeting_31c9b1f32197());
}
export function TaoView_Greeting_31c9b1f32197(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "First" | "Second" | "PrivateGreeting"> & { readonly "First": string; readonly "Second": string; readonly "PrivateGreeting": TR.View };
  const _Imported_Text = TR.ScopeAliases<ModuleImports["Text"]>(_Scope, { ["Text"]: "Text" });
  const _Imported_Col = TR.ScopeAliases<ModuleImports["Col"]>(_Scope, { ["Col"]: "Col" });
  TR.LetDeclaration(_Scope, "PrivateGreeting", TR.ViewDeclaration("PrivateGreeting", [], TaoView_Greeting$PrivateGreeting_31c9b1f32197, _Scope));
  return TR.finishViewRender(_Render, TR.ViewRenderExpression(
    _Imported_Col["Col"],
    TR.ViewRenderArguments([], [
      TR.ViewRenderExpression(
        _Imported_Text["Text"],
        TR.ViewRenderArguments([_Scope["First"]], [])
      ),
      TR.ViewRenderExpression(
        _Scope["PrivateGreeting"],
        TR.ViewRenderArguments([], [])
      ),
      TR.ViewRenderExpression(
        _Imported_Text["Text"],
        TR.ViewRenderArguments([_Scope["Second"]], [])
      )
    ])
  ));
}

function useTaoInjectionPanel_31c9b1f32197(Children: TR.ViewComponentProps['children']) {
  return <Tao.View>{Children}</Tao.View>
}
export function TaoView_Panel_31c9b1f32197(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;

  return TR.finishViewRender(_Render, useTaoInjectionPanel_31c9b1f32197(_Render.children));
}

export function TaoView_Hidden_31c9b1f32197(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;
  const _Imported_Text = TR.ScopeAliases<ModuleImports["Text"]>(_Scope, { ["Text"]: "Text" });
  return TR.finishViewRender(_Render, TR.ViewRenderExpression(
    _Imported_Text["Text"],
    TR.ViewRenderArguments(["Unpublished"], [])
  ));
}