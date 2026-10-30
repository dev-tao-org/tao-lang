/** ReceiptIdentity identifies one preview milestone from a boot and revision. */
export type ReceiptIdentity = {
  revision: string
  frameId: string
  bootId: string
  timestampMs: number
}

/** ReceiptMilestone distinguishes the refresh and applied receipts. */
export type ReceiptMilestone = 'hmr' | 'applied'

/** ReceiptPair contains the first matching milestones retained for one frame boot. */
export type ReceiptPair<Value> = { hmr: Value; applied: Value }

/** PreviewReceipts retains bounded, boot-matched milestones for each revision and frame. */
export class PreviewReceipts<Value> {
  private readonly revisions = new Map<string, Map<string, FrameReceipts<Value>>>()

  constructor(private readonly maxRevisions = 16, private readonly maxRetiredBoots = 8) {}

  record(milestone: ReceiptMilestone, identity: ReceiptIdentity, value: Value): boolean {
    const frames = this.revisions.get(identity.revision) ?? this.createRevision(identity.revision)
    const current = frames.get(identity.frameId)
    const frame = current ? this.currentBoot(current, identity) : createFrame<Value>(identity)
    if (!frame) {
      return false
    }
    frames.set(identity.frameId, frame)
    return recordFirstMilestone(frame, milestone, value)
  }

  complete(revision: string): Map<string, ReceiptPair<Value>> {
    const complete = new Map<string, ReceiptPair<Value>>()
    for (const [frameId, frame] of this.revisions.get(revision) ?? []) {
      if (frame.hmr !== undefined && frame.applied !== undefined) {
        complete.set(frameId, { hmr: frame.hmr, applied: frame.applied })
      }
    }
    return complete
  }

  pruneBefore(minimumRevision: number): void {
    for (const revision of this.revisions.keys()) {
      if (parseRevisionNumber(revision) < minimumRevision) {
        this.revisions.delete(revision)
      }
    }
  }

  clear(): void {
    this.revisions.clear()
  }

  private currentBoot(current: FrameReceipts<Value>, identity: ReceiptIdentity): FrameReceipts<Value> | undefined {
    if (current.bootId === identity.bootId) {
      current.latestTimestampMs = Math.max(current.latestTimestampMs, identity.timestampMs)
      return current
    }
    if (isRetiredBoot(current, identity.bootId) || identity.timestampMs <= current.latestTimestampMs) {
      return undefined
    }
    return nextBoot(current, identity, this.maxRetiredBoots)
  }

  private createRevision(revision: string): Map<string, FrameReceipts<Value>> {
    const frames = new Map<string, FrameReceipts<Value>>()
    this.revisions.set(revision, frames)
    while (this.revisions.size > this.maxRevisions) {
      const oldest = this.revisions.keys().next()
      if (oldest.done) {
        break
      }
      this.revisions.delete(oldest.value)
    }
    return frames
  }
}

type FrameReceipts<Value> = {
  bootId: string
  latestTimestampMs: number
  retiredBoots: string[]
  hmr?: Value
  applied?: Value
}

function createFrame<Value>(identity: ReceiptIdentity): FrameReceipts<Value> {
  return { bootId: identity.bootId, latestTimestampMs: identity.timestampMs, retiredBoots: [] }
}

function isRetiredBoot<Value>(frame: FrameReceipts<Value>, bootId: string): boolean {
  return frame.retiredBoots.includes(bootId)
}

function nextBoot<Value>(frame: FrameReceipts<Value>, identity: ReceiptIdentity, maxRetiredBoots: number) {
  const retiredBoots = [...frame.retiredBoots, frame.bootId]
    .slice(Math.max(0, frame.retiredBoots.length + 1 - maxRetiredBoots))
  return { bootId: identity.bootId, latestTimestampMs: identity.timestampMs, retiredBoots }
}

function recordFirstMilestone<Value>(frame: FrameReceipts<Value>, milestone: ReceiptMilestone, value: Value): boolean {
  if (frame[milestone] !== undefined) {
    return false
  }
  frame[milestone] = value
  return true
}

const RevisionPrefixRegx = /^r/
function parseRevisionNumber(revision: string): number {
  return Number(revision.replace(RevisionPrefixRegx, '')) || 0
}
