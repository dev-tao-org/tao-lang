import * as TR from '@runtime';
import Tao from '@tao/runtime-api';
import type { Scope as ModuleScope, Imports as ModuleImports } from "./Views";


function useTaoInjectionText_124f3da2469c(Value: string) {
  return <Tao.Text>{Value}</Tao.Text>
}
export function TaoView_Text_124f3da2469c(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Value"> & { readonly "Value": string };

  return TR.finishViewRender(_Render, useTaoInjectionText_124f3da2469c(_Scope["Value"] as string));
}

function useTaoInjectionCol_124f3da2469c(Children: TR.ViewComponentProps['children']) {
  return <Tao.View style={{ flexDirection: 'column' }}>{Children}</Tao.View>
}
export function TaoView_Col_124f3da2469c(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;

  return TR.finishViewRender(_Render, useTaoInjectionCol_124f3da2469c(_Render.children));
}

function useTaoInjectionRow_124f3da2469c(Children: TR.ViewComponentProps['children']) {
  return <Tao.View style={{ flexDirection: 'row' }}>{Children}</Tao.View>
}
export function TaoView_Row_124f3da2469c(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;

  return TR.finishViewRender(_Render, useTaoInjectionRow_124f3da2469c(_Render.children));
}

function useTaoInjectionInput_124f3da2469c(Value: string) {
  return <Tao.TextInput defaultValue={Value} />
}
export function TaoView_Input_124f3da2469c(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Value"> & { readonly "Value": string };

  return TR.finishViewRender(_Render, useTaoInjectionInput_124f3da2469c(_Scope["Value"] as string));
}