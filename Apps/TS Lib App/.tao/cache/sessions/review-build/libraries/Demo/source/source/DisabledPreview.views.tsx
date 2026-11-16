import * as TR from '@runtime';
import Tao from '@tao/runtime-api';
import type { Scope as ModuleScope, Imports as ModuleImports } from "./DisabledPreview";
import { DisabledPreviewControls as _taoForeignView0 } from "/Users/ro/.codex/worktrees/package-graph/tao-lang/Apps/TS Lib App/src/tao/DisabledPreviewControls.tsx";

export function TaoView_DisabledPreview_b33e36884a1c(_Props: TR.ViewComponentProps) {
  const _Render = TR.beginViewRender(_Props);
  const _Scope = _Render.scope as Omit<ModuleScope, "Locked"> & { readonly "Locked": unknown };
  const _Imported_Input = TR.ScopeAliases<ModuleImports["Input"]>(_Scope, { ["Input"]: "Input" });
  const _Imported_Col = TR.ScopeAliases<ModuleImports["Col"]>(_Scope, { ["Col"]: "Col" });
  return TR.finishViewRender(_Render, TR.ViewRenderExpression(
    _Imported_Col["Col"],
    TR.ViewRenderArguments([], [
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