import { ThrowUnexpected } from './Errors'

/** Switch dispatches exhaustively on values, discriminators and object properties. */
export default Object.assign(Switch, {
  kind: SwitchKind,
  kindMaybe: SwitchKindMaybe,
  nothing,
  on: SwitchOn,
  property: SwitchProperty,
  type: SwitchType,
  typeMaybe: SwitchTypeMaybe,
})

type SwitchKey = string | number | symbol
type SwitchValueKey = SwitchKey | undefined
type TypeItem = { $type: SwitchKey }
type KindItem = { kind: SwitchKey }

type TypeHandlers<ItemT extends TypeItem, ResultT> = {
  [KeyT in ItemT['$type']]: (item: Extract<ItemT, { $type: KeyT }>) => ResultT
}

type KindHandlers<ItemT extends KindItem, ResultT> = {
  [KeyT in ItemT['kind']]: (item: Extract<ItemT, { kind: KeyT }>) => ResultT
}

function Switch<ValueT extends SwitchValueKey, ResultT>(
  input: ValueT,
  handlers: ValueHandlers<ValueT, ResultT>,
): ResultT {
  const key = input === undefined ? 'undefined' : input
  const handler = ownHandler(handlers, key)

  if (!handler) {
    ThrowUnexpected(`Unhandled switch value: ${String(input)}`)
  }
  return (handler as (value: ValueT) => ResultT)(input)
}

type ValueHandlers<ValueT extends SwitchValueKey, ResultT> =
  & { [KeyT in Exclude<ValueT, undefined> & SwitchKey]: (value: KeyT) => ResultT }
  & (undefined extends ValueT ? { undefined: (value: undefined) => ResultT } : {})

function SwitchType<ItemT extends TypeItem, ResultT>(
  item: ItemT,
  handlers: TypeHandlers<ItemT, ResultT>,
): ResultT {
  const key = item.$type as ItemT['$type']
  const handler = ownHandler(handlers, key)

  if (!handler) {
    ThrowUnexpected(`Unhandled item type: ${String(key)}`)
  }
  return (handler as (item: ItemT) => ResultT)(item)
}

// A single type whose kind is a literal union gives handlers no narrowing;
// a handler needing a narrower type must close over the item instead.
function SwitchKind<ItemT extends KindItem, ResultT>(
  item: ItemT,
  handlers: KindHandlers<ItemT, ResultT>,
): ResultT {
  const key = item.kind as ItemT['kind']
  const handler = ownHandler(handlers, key)

  if (!handler) {
    ThrowUnexpected(`Unhandled item kind: ${String(key)}`)
  }
  return (handler as (item: ItemT) => ResultT)(item)
}

function SwitchTypeMaybe<ItemT extends TypeItem | undefined, ResultT>(
  item: ItemT,
  handlers: TypeMaybeHandlers<ItemT, ResultT>,
): ResultT {
  const key = item === undefined ? 'undefined' : item.$type
  const handler = ownHandler(handlers, key)

  if (!handler) {
    ThrowUnexpected(`Unhandled item type: ${String(key)}`)
  }
  return (handler as (item: ItemT) => ResultT)(item)
}

type TypeMaybeHandlers<ItemT extends TypeItem | undefined, ResultT> =
  & TypeHandlers<Exclude<ItemT, undefined>, ResultT>
  & (undefined extends ItemT ? { undefined: (item: undefined) => ResultT } : {})

function SwitchKindMaybe<ItemT extends KindItem | undefined, ResultT>(
  item: ItemT,
  handlers: KindMaybeHandlers<ItemT, ResultT>,
): ResultT {
  const key = item === undefined ? 'undefined' : item.kind
  const handler = ownHandler(handlers, key)

  if (!handler) {
    ThrowUnexpected(`Unhandled item kind: ${String(key)}`)
  }
  return (handler as (item: ItemT) => ResultT)(item)
}

type KindMaybeHandlers<ItemT extends KindItem | undefined, ResultT> =
  & KindHandlers<Exclude<ItemT, undefined>, ResultT>
  & (undefined extends ItemT ? { undefined: (item: undefined) => ResultT } : {})

function SwitchProperty<ItemT extends object, PropertyT extends keyof ItemT, ResultT>(
  item: ItemT,
  propertyName: PropertyT,
  handlers: PropertyHandlers<ItemT, PropertyT, ResultT>,
): ResultT {
  const propertyValue = item[propertyName]
  const key = propertyValue === undefined ? 'undefined' : propertyValue
  const handler = ownHandler(handlers, key as PropertyKey)

  if (!handler) {
    ThrowUnexpected(`Unhandled property value: ${String(propertyValue)}`)
  }
  return (handler as (value: PropertyValue<ItemT, PropertyT>) => ResultT)(propertyValue)
}

type PropertyValue<ItemT, PropertyT extends keyof ItemT> = ItemT[PropertyT]

type PropertyHandlers<ItemT, PropertyT extends keyof ItemT, ResultT> = PropertyValue<ItemT, PropertyT> extends
  infer ValueT ?
    & { [KeyT in Exclude<ValueT, undefined> & SwitchKey]: (value: KeyT) => ResultT }
    & (undefined extends ValueT ? { undefined: (value: undefined) => ResultT } : {})
  : never

// Unlike property dispatch, each handler receives the item narrowed to that property's member.
function SwitchOn<ItemT extends object, PropertyT extends keyof ItemT, ResultT>(
  item: ItemT,
  propertyName: PropertyT,
  handlers: OnHandlers<ItemT, PropertyT, ResultT>,
): ResultT {
  const propertyValue = item[propertyName]
  const key = propertyValue === undefined ? 'undefined' : propertyValue
  const handler = ownHandler(handlers, key as PropertyKey)

  if (!handler) {
    ThrowUnexpected(`Unhandled property value: ${String(propertyValue)}`)
  }
  return (handler as (item: ItemT) => ResultT)(item)
}

type OnHandlers<ItemT extends object, PropertyT extends keyof ItemT, ResultT> =
  & {
    [KeyT in ItemT[PropertyT] & PropertyKey]: (item: Extract<ItemT, Record<PropertyT, KeyT>>) => ResultT
  }
  & (undefined extends ItemT[PropertyT]
    ? { undefined: (item: Extract<ItemT, Partial<Record<PropertyT, undefined>>>) => ResultT }
    : {})

function ownHandler<HandlersT extends object>(handlers: HandlersT, key: PropertyKey): unknown {
  return Object.hasOwn(handlers, key) ? handlers[key as keyof HandlersT] : undefined
}

function nothing(): void {}
