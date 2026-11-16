import * as TR from '@runtime';
import * as _Views from "./DisabledPreview.views";
import { DisabledPreviewControls as _taoForeignView0 } from "/Users/ro/.codex/worktrees/package-graph/tao-lang/Apps/TS Lib App/src/tao/DisabledPreviewControls.tsx";
import type { Scope as ImportedScope0 } from "../tao/ui/Views";
import type { Scope as ImportedScope1 } from "./ScopeExamples";

export type Scope = {
  readonly "DisabledPreview": TR.View;
  readonly "DisabledPreviewControls": TR.View;
  readonly "Col": ImportedScope0["Col"];
  readonly "Input": ImportedScope0["Input"];
  readonly "FolderScope": ImportedScope1["FolderScope"];
};

export type Imports = {
  readonly "Col": Pick<ImportedScope0, "Col">;
  readonly "Input": Pick<ImportedScope0, "Input">;
  readonly "FolderScope": Pick<ImportedScope1, "FolderScope">;
};

export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {
  TR.AliasBinding(_Scope, "Col", () => _Modules["tao/ui/Views.ts"]!["Col"]);
  TR.AliasBinding(_Scope, "Input", () => _Modules["tao/ui/Views.ts"]!["Input"]);
  TR.AliasBinding(_Scope, "FolderScope", () => _Modules["source/ScopeExamples.ts"]!["FolderScope"]);
}

export function bindDeclarations(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "DisabledPreview", TR.ViewDeclaration("DisabledPreview", ["Locked"], _Views.TaoView_DisabledPreview_b33e36884a1c, _Scope));
  TR.LetDeclaration(_Scope, "DisabledPreviewControls", TR.ForeignView("DisabledPreviewControls", ["Locked"], _taoForeignView0, _Scope));
}