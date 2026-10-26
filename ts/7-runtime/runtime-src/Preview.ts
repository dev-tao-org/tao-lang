import { Time } from '@shared'
import * as PreviewPlatform from '@shared/os/preview'
import type { AppOptions } from './View'

/** ModuleApplied marks evaluation of a new generated module for preview correlation. */
export function ModuleApplied(revision: string): void {
  PreviewPlatform.beginPreviewRevision(revision)
}

/** reportRenderError records a failed render for its actual generated revision. */
export function reportRenderError(revision: string, error: unknown): void {
  PreviewPlatform.reportPreviewError('runtime-error', String(error), revision)
}

/** previewOptions supplies the dev harness's post-commit callback and local duration observer. */
export function previewOptions(): AppOptions {
  return PreviewPlatform.isPreview() ? options : {}
}

const options: AppOptions = {
  onApplied(revision) {
    PreviewPlatform.reportPreviewEvent('tao.preview-applied', revision)
  },
  observer: { now: Time.nowMs, onTiming: PreviewPlatform.previewTiming },
}
