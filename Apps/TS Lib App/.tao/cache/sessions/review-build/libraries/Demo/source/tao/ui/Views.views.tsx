import * as TR from '@runtime';
import Tao from '@tao/runtime-api';
import type { Scope as ModuleScope, Imports as ModuleImports } from "./Views";


function useTaoInjectionText_8da6fc2c7acb(Value: string) {
  return <Tao.Text>{Value}</Tao.Text>
}
export function TaoView_Text_8da6fc2c7acb(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Value"> & { readonly "Value": string };

  return TR.finishViewRender(_Render, useTaoInjectionText_8da6fc2c7acb(_Scope["Value"] as string));
}

function useTaoInjectionCol_8da6fc2c7acb(Children: TR.ViewComponentProps['children']) {
  return <Tao.View style={{ flexDirection: 'column' }}>{Children}</Tao.View>
}
export function TaoView_Col_8da6fc2c7acb(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;

  return TR.finishViewRender(_Render, useTaoInjectionCol_8da6fc2c7acb(_Render.children));
}

function useTaoInjectionRow_8da6fc2c7acb(Children: TR.ViewComponentProps['children']) {
  return <Tao.View style={{ flexDirection: 'row' }}>{Children}</Tao.View>
}
export function TaoView_Row_8da6fc2c7acb(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;

  return TR.finishViewRender(_Render, useTaoInjectionRow_8da6fc2c7acb(_Render.children));
}

function useTaoInjectionInput_8da6fc2c7acb(Value: string) {
  return <Tao.TextInput defaultValue={Value} />
}
export function TaoView_Input_8da6fc2c7acb(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Value"> & { readonly "Value": string };

  return TR.finishViewRender(_Render, useTaoInjectionInput_8da6fc2c7acb(_Scope["Value"] as string));
}