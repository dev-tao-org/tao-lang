/** crypto exposes the standard web host crypto API. */
export const crypto = globalThis.crypto

/** performance exposes the standard web host performance API. */
export const performance = globalThis.performance

/** fetch exposes the standard web host fetch API. */
export const fetch = globalThis.fetch.bind(globalThis)

/** WebSocket exposes the standard web host WebSocket API. */
export const WebSocket = globalThis.WebSocket

/** EventSource exposes the standard web host EventSource API. */
export const EventSource = globalThis.EventSource

/** Response exposes the standard web host Response API. */
export const Response = globalThis.Response

/** Request exposes the standard web host Request API. */
export const Request = globalThis.Request

/** ReadableStream exposes the standard web host ReadableStream API. */
export const ReadableStream = globalThis.ReadableStream

/** AbortController exposes the standard web host AbortController API. */
export const AbortController = globalThis.AbortController

/** URL exposes the standard web host URL API. */
export const URL = globalThis.URL

/** URLSearchParams exposes the standard web host URLSearchParams API. */
export const URLSearchParams = globalThis.URLSearchParams

/** TextDecoder exposes the standard web host TextDecoder API. */
export const TextDecoder = globalThis.TextDecoder

/** TextEncoder exposes the standard web host TextEncoder API. */
export const TextEncoder = globalThis.TextEncoder

/** Element describes the standard web host contract. */
export type Element = globalThis.Element

/** HTMLElement describes the standard web host contract. */
export type HTMLElement = globalThis.HTMLElement

/** HTMLIFrameElement describes the standard web host contract. */
export type HTMLIFrameElement = globalThis.HTMLIFrameElement

/** HTMLButtonElement describes the standard web host button contract. */
export type HTMLButtonElement = globalThis.HTMLButtonElement

/** HTMLTextAreaElement describes the standard web host textarea contract. */
export type HTMLTextAreaElement = globalThis.HTMLTextAreaElement

/** Window describes the standard web host contract. */
export type Window = globalThis.Window

/** MessageEvent describes the standard web host contract. */
export type MessageEvent<Value = unknown> = globalThis.MessageEvent<Value>

/** RequestInit describes the standard web host contract. */
export type RequestInit = globalThis.RequestInit

/** BodyInit describes the standard web host contract. */
export type BodyInit = globalThis.BodyInit

/** ResponseInit describes the standard web host contract. */
export type ResponseInit = globalThis.ResponseInit

/** UnderlyingDefaultSource describes the standard web host contract. */
export type UnderlyingDefaultSource<Value = unknown> = globalThis.UnderlyingDefaultSource<Value>

/** ReadableStreamDefaultController describes the standard web host contract. */
export type ReadableStreamDefaultController<Value = unknown> = globalThis.ReadableStreamDefaultController<Value>

/** AbortSignal describes the standard web host contract. */
export type AbortSignal = globalThis.AbortSignal

/** WebSocket describes the standard web host contract. */
export type WebSocket = globalThis.WebSocket

/** EventSource describes the standard web host contract. */
export type EventSource = globalThis.EventSource

/** Response describes the standard web host contract. */
export type Response = globalThis.Response

/** Request describes the standard web host contract. */
export type Request = globalThis.Request

/** ReadableStream describes the standard web host contract. */
export type ReadableStream<Value = unknown> = globalThis.ReadableStream<Value>

/** AbortController describes the standard web host contract. */
export type AbortController = globalThis.AbortController

/** URL describes the standard web host contract. */
export type URL = globalThis.URL

/** URLSearchParams describes the standard web host contract. */
export type URLSearchParams = globalThis.URLSearchParams

/** TextDecoder describes the standard web host contract. */
export type TextDecoder = globalThis.TextDecoder

/** TextEncoder describes the standard web host contract. */
export type TextEncoder = globalThis.TextEncoder

/** hasWindow reports whether the browser window is available. */
export function hasWindow(): boolean {
  return typeof window !== 'undefined'
}

type BrowserGlobalWindow = Window & typeof globalThis
/** getBrowserWindow accesses the active browser window. */
export function getBrowserWindow(): BrowserGlobalWindow {
  return window
}

/** hasDocument reports whether the browser document is available. */
export function hasDocument(): boolean {
  return typeof document !== 'undefined'
}

/** getBrowserDocument accesses the active browser document. */
export function getBrowserDocument(): Document {
  return document
}
