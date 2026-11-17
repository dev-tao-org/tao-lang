import * as TR from '@runtime';
import { createLibrary, createViewComponent } from '@tao/ts-api';
import type { ViewProps } from '@tao/ts-api';
import * as Source0 from "./ts/packages/src/tao/Library";
import * as Source1 from "./ts/packages/src/tao/LanguageFeatures";
import * as Source2 from "./ts/packages/src/tao/ScopeExamples";
import * as Source3 from "./ts/packages/src/tao/ValueSnapshots";
import * as Source4 from "./ts/dependencies/tao/@ui/Views";
import * as Source5 from "./ts/packages/src/tao/cards/Card";
import * as Source6 from "./ts/packages/src/tao/cards/Other";
import * as Source7 from "./ts/packages/src/tao/cards/Publication";

const library = createLibrary(() => {
  const _scope0 = TR.Scope() as Source0.Scope;
  const _scope1 = TR.Scope() as Source1.Scope;
  const _scope2 = TR.Scope() as Source2.Scope;
  const _scope3 = TR.Scope() as Source3.Scope;
  const _scope4 = TR.Scope() as Source4.Scope;
  const _scope5 = TR.Scope() as Source5.Scope;
  const _scope6 = TR.Scope() as Source6.Scope;
  const _scope7 = TR.Scope() as Source7.Scope;
  const _Modules = { "ts/packages/src/tao/Library.ts": _scope0,
  "ts/packages/src/tao/LanguageFeatures.ts": _scope1,
  "ts/packages/src/tao/ScopeExamples.ts": _scope2,
  "ts/packages/src/tao/ValueSnapshots.ts": _scope3,
  "ts/dependencies/tao/@ui/Views.ts": _scope4,
  "ts/packages/src/tao/cards/Card.ts": _scope5,
  "ts/packages/src/tao/cards/Other.ts": _scope6,
  "ts/packages/src/tao/cards/Publication.ts": _scope7 };
  Source0.bindAliases(_scope0, _Modules);
  Source1.bindAliases(_scope1, _Modules);
  Source2.bindAliases(_scope2, _Modules);
  Source3.bindAliases(_scope3, _Modules);
  Source4.bindAliases(_scope4, _Modules);
  Source5.bindAliases(_scope5, _Modules);
  Source6.bindAliases(_scope6, _Modules);
  Source7.bindAliases(_scope7, _Modules);
  Source0.bindDeclarations(_scope0);
  Source1.bindDeclarations(_scope1);
  Source2.bindDeclarations(_scope2);
  Source3.bindDeclarations(_scope3);
  Source4.bindDeclarations(_scope4);
  Source5.bindDeclarations(_scope5);
  Source6.bindDeclarations(_scope6);
  Source7.bindDeclarations(_scope7);
  Source1.initializeFileCaption(_scope1);
  Source1.initializeEscapedCaption(_scope1);
  return { "Greeting": _scope0["Greeting"], "Panel": _scope0["Panel"], "LanguageFeatures": _scope1["LanguageFeatures"], "ValueSnapshots": _scope3["ValueSnapshots"], "Cards/Caption": _scope5["Caption"] };
});
export const Published0 = createViewComponent<ViewProps & { "First": string; "Second": string }>(library, "Greeting", ["First", "Second"]);
export const Published1 = createViewComponent<ViewProps & {  }>(library, "Panel", []);
export const Published2 = createViewComponent<ViewProps & { "Name": string }>(library, "LanguageFeatures", ["Name"]);
export const Published3 = createViewComponent<ViewProps & {  }>(library, "ValueSnapshots", []);
export const Published4 = createViewComponent<ViewProps & { "Value": string }>(library, "Cards/Caption", ["Value"]);
export default library;