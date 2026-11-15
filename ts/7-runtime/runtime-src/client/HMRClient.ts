import * as PreviewPlatform from '@shared/os/preview'
import MetroHMRClient from 'tao:metro-hmr-client'

/** PreviewHMRClient observes Expo's actual Metro client without changing update application. */
export default class PreviewHMRClient extends MetroHMRClient {
  constructor(url: string) {
    super(url)
    PreviewPlatform.initializePreviewClient()
    let deltaModules: MetroDeltaCount
    this.on('update', update => {
      deltaModules = countMetroDelta(update)
    })
    this.on('update-done', () => {
      PreviewPlatform.reportPreviewEvent('tao.update-done', undefined, deltaModules)
      deltaModules = undefined
    })
    this.on('open', () => PreviewPlatform.reportPreviewConnection(true))
    this.on('close', () => PreviewPlatform.reportPreviewConnection(false))
    this.on('connection-error', () => PreviewPlatform.reportPreviewConnection(false))
    this.on('error', error => PreviewPlatform.reportPreviewError('build-error', describeError(error)))
  }
}

type MetroDeltaCount = number | undefined
type MetroDelta = { isInitialUpdate?: boolean; added?: unknown[]; modified?: unknown[]; deleted?: unknown[] }

function countMetroDelta(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const { isInitialUpdate, added, modified, deleted } = value as MetroDelta
  if (isInitialUpdate) {
    return undefined
  }
  if (Array.isArray(added) && Array.isArray(modified) && Array.isArray(deleted)) {
    return added.length + modified.length + deleted.length
  }
  return undefined
}

function describeError(error: unknown): string {
  if (hasErrorMessage(error)) {
    return String(error.message)
  }
  return String(error)
}

function hasErrorMessage(error: unknown): error is { message: unknown } {
  return typeof error === 'object' && error !== null && 'message' in error
}
