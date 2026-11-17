import * as TR from '@runtime';
import Tao from '@tao/runtime-api';
import type { Scope as ModuleScope, Imports as ModuleImports } from "./Views";


function useTaoInjectionText_35a20822f58b(Value: string) {
  return <Tao.Text>{Value}</Tao.Text>
}
export function TaoView_Text_35a20822f58b(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Value"> & { readonly "Value": string };

  return TR.finishViewRender(_Render, useTaoInjectionText_35a20822f58b(_Scope["Value"] as string));
}

function useTaoInjectionCol_35a20822f58b(Children: TR.ViewComponentProps['children']) {
  return <Tao.View style={{ flexDirection: 'column' }}>{Children}</Tao.View>
}
export function TaoView_Col_35a20822f58b(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;

  return TR.finishViewRender(_Render, useTaoInjectionCol_35a20822f58b(_Render.children));
}

function useTaoInjectionRow_35a20822f58b(Children: TR.ViewComponentProps['children']) {
  return <Tao.View style={{ flexDirection: 'row' }}>{Children}</Tao.View>
}
export function TaoView_Row_35a20822f58b(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as ModuleScope;

  return TR.finishViewRender(_Render, useTaoInjectionRow_35a20822f58b(_Render.children));
}

function useTaoInjectionInput_35a20822f58b(Value: string) {
  return <Tao.TextInput defaultValue={Value} />
}
export function TaoView_Input_35a20822f58b(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Value"> & { readonly "Value": string };

  return TR.finishViewRender(_Render, useTaoInjectionInput_35a20822f58b(_Scope["Value"] as string));
}

function useTaoInjectionButton_35a20822f58b(Label: string, Press: TR.ViewComponentProps['press']) {
  return (
        <Tao.Pressable accessibilityRole="button" onPress={Press}>
          <Tao.Text>{Label}</Tao.Text>
        </Tao.Pressable>
      )
}
export function TaoView_Button_35a20822f58b(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Label"> & { readonly "Label": string };

  return TR.finishViewRender(_Render, useTaoInjectionButton_35a20822f58b(_Scope["Label"] as string, _Render.press));
}