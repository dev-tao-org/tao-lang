import * as TR from '@runtime';
import Tao from '@tao/runtime-api';
import type { Scope as ModuleScope, Imports as ModuleImports } from "./DisabledPreview";
import { DisabledPreviewControls as _taoForeignView0 } from "/Users/ro/.codex/worktrees/4f3f/tao-lang/Apps/TS Lib App/src/tao/DisabledPreviewControls.tsx";

function useTaoInjectionDisabledPreview$CapturedStatus_7db3708347e3(Status: boolean) {
  const locked: boolean = Status
           return <Tao.Text>{locked ? 'Captured locked' : 'Captured unlocked'}</Tao.Text>
}
export function TaoView_DisabledPreview$CapturedStatus_7db3708347e3(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Locked" | "Status" | "CapturedStatus"> & { readonly "Locked": boolean; readonly "Status": boolean; readonly "CapturedStatus": TR.View };

  return TR.finishViewRender(_Render, useTaoInjectionDisabledPreview$CapturedStatus_7db3708347e3(_Scope["Status"] as boolean));
}
export function TaoView_DisabledPreview_7db3708347e3(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Locked" | "Status" | "CapturedStatus"> & { readonly "Locked": boolean; readonly "Status": boolean; readonly "CapturedStatus": TR.View };
  const _Imported_Input = TR.ScopeAliases<ModuleImports["Input"]>(_Scope, { ["Input"]: "Input" });
  const _Imported_Col = TR.ScopeAliases<ModuleImports["Col"]>(_Scope, { ["Col"]: "Col" });
  TR.LetDeclaration(_Scope, "CapturedStatus", TR.ViewDeclaration("CapturedStatus", [], TaoView_DisabledPreview$CapturedStatus_7db3708347e3, _Scope));
  TR.LetDeclaration(_Scope, "Status", _Scope["Locked"]);
  return TR.finishViewRender(_Render, TR.ViewRenderExpression(
    _Imported_Col["Col"],
    TR.ViewRenderArguments([], [
      TR.ViewRenderExpression(
        _Scope["CapturedStatus"],
        TR.ViewRenderArguments([], [])
      ),
      TR.ViewRenderExpression(
        _Scope["DisabledPreviewControls"],
        TR.ViewRenderArguments([_Scope["Locked"]], [], undefined, TR.DisabledWhen(false))
      ),
      TR.ViewRenderExpression(
        _Imported_Input["Input"],
        TR.ViewRenderArguments(["Editable"], [], "previewInput")
      )
    ], undefined, TR.DisabledWhen(_Scope["Locked"]))
  ));
}