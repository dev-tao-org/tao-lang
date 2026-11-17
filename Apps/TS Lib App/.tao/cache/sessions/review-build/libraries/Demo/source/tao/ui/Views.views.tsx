import * as TR from '@runtime';
import Tao from '@tao/runtime-api';
import type { Scope as ModuleScope, Imports as ModuleImports } from "./Views";


function useTaoInjectionText_f7351bac9ad2(Value: string) {
  return <Tao.Text>{Value}</Tao.Text>
}
export function TaoView_Text_f7351bac9ad2(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Value"> & { readonly "Value": string };

  return TR.finishViewRender(_Render, useTaoInjectionText_f7351bac9ad2(_Scope["Value"] as string));
}

function useTaoInjectionCol_f7351bac9ad2(Children: TR.ViewComponentProps['children']) {
  return <Tao.View style={{ flexDirection: 'column' }}>{Children}</Tao.View>
}
export function TaoView_Col_f7351bac9ad2(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;

  return TR.finishViewRender(_Render, useTaoInjectionCol_f7351bac9ad2(_Render.children));
}

function useTaoInjectionRow_f7351bac9ad2(Children: TR.ViewComponentProps['children']) {
  return <Tao.View style={{ flexDirection: 'row' }}>{Children}</Tao.View>
}
export function TaoView_Row_f7351bac9ad2(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;

  return TR.finishViewRender(_Render, useTaoInjectionRow_f7351bac9ad2(_Render.children));
}

function useTaoInjectionInput_f7351bac9ad2(Value: string) {
  return <Tao.TextInput defaultValue={Value} />
}
export function TaoView_Input_f7351bac9ad2(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Value"> & { readonly "Value": string };

  return TR.finishViewRender(_Render, useTaoInjectionInput_f7351bac9ad2(_Scope["Value"] as string));
}