import * as TR from '@runtime';
import Tao from '@tao/runtime-api';
import type { Scope as ModuleScope, Imports as ModuleImports } from "./Views";


function useTaoInjectionText_9bf877ca8681(Value: string) {
  return <Tao.Text>{Value}</Tao.Text>
}
export function TaoView_Text_9bf877ca8681(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Value"> & { readonly "Value": string };

  return TR.finishViewRender(_Render, useTaoInjectionText_9bf877ca8681(_Scope["Value"] as string));
}

function useTaoInjectionCol_9bf877ca8681(Children: TR.ViewComponentProps['children']) {
  return <Tao.View style={{ flexDirection: 'column' }}>{Children}</Tao.View>
}
export function TaoView_Col_9bf877ca8681(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;

  return TR.finishViewRender(_Render, useTaoInjectionCol_9bf877ca8681(_Render.children));
}

function useTaoInjectionRow_9bf877ca8681(Children: TR.ViewComponentProps['children']) {
  return <Tao.View style={{ flexDirection: 'row' }}>{Children}</Tao.View>
}
export function TaoView_Row_9bf877ca8681(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;

  return TR.finishViewRender(_Render, useTaoInjectionRow_9bf877ca8681(_Render.children));
}

function useTaoInjectionInput_9bf877ca8681(Value: string) {
  return <Tao.TextInput defaultValue={Value} />
}
export function TaoView_Input_9bf877ca8681(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Value"> & { readonly "Value": string };

  return TR.finishViewRender(_Render, useTaoInjectionInput_9bf877ca8681(_Scope["Value"] as string));
}