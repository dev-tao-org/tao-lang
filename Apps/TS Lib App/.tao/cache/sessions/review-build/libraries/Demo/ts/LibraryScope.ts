import * as TR from '@tao/runtime/generated';
import * as Source0 from "./packages/src/tao/Library";
import * as Source1 from "./packages/src/tao/@cards/Card";
import * as Source2 from "./packages/src/tao/@cards/Other";
import * as Source3 from "./packages/src/tao/@cards/details/DetailedCard";
import * as Source4 from "./packages/src/tao/LanguageFeatures";
import * as Source5 from "./packages/src/tao/ScopeExamples";
import * as Source6 from "./packages/src/tao/ValueSnapshots";
import * as Source7 from "./dependencies/tao/@ui/Views";

const _scope0 = TR.Scope() as Source0.Scope;
const _scope1 = TR.Scope() as Source1.Scope;
const _scope2 = TR.Scope() as Source2.Scope;
const _scope3 = TR.Scope() as Source3.Scope;
const _scope4 = TR.Scope() as Source4.Scope;
const _scope5 = TR.Scope() as Source5.Scope;
const _scope6 = TR.Scope() as Source6.Scope;
const _scope7 = TR.Scope() as Source7.Scope;
const _Modules = { "ts/packages/src/tao/Library.ts": _scope0,
"ts/packages/src/tao/@cards/Card.ts": _scope1,
"ts/packages/src/tao/@cards/Other.ts": _scope2,
"ts/packages/src/tao/@cards/details/DetailedCard.ts": _scope3,
"ts/packages/src/tao/LanguageFeatures.ts": _scope4,
"ts/packages/src/tao/ScopeExamples.ts": _scope5,
"ts/packages/src/tao/ValueSnapshots.ts": _scope6,
"ts/dependencies/tao/@ui/Views.ts": _scope7 };
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
Source4.initializeFileCaption(_scope4);
Source4.initializeEscapedCaption(_scope4);

export const Published_Greeting_cdb4ee2aea69 = TR.LibraryView<TR.LibraryViewProps & { "First": string; "Second": string }>(_scope0["Greeting"], ["First", "Second"]);
export const Published_Panel_cdb4ee2aea69 = TR.LibraryView<TR.LibraryViewProps>(_scope0["Panel"], []);
export const Published_LanguageFeatures_cdb4ee2aea69 = TR.LibraryView<TR.LibraryViewProps & { "Name": string }>(_scope4["LanguageFeatures"], ["Name"]);
export const Published_ValueSnapshots_cdb4ee2aea69 = TR.LibraryView<TR.LibraryViewProps>(_scope6["ValueSnapshots"], []);
export const Published_Caption_74c02d3abcd9 = TR.LibraryView<TR.LibraryViewProps & { "Value": string }>(_scope1["Caption"], ["Value"]);
export const Published_DetailedCard_7eaeef3b4616 = TR.LibraryView<TR.LibraryViewProps & { "Value": string }>(_scope3["DetailedCard"], ["Value"]);