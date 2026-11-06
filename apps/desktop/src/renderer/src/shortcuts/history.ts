import { useProjectStore } from '../stores/project.store'
import type { Project } from '../types'

const LIMIT = 200
const MERGE_MS = 300   // a slider drag is one undo step, not hundreds

let past: Project[] = []
let future: Project[] = []
let restoring = false
let lastPush = 0

useProjectStore.subscribe(
  (s) => s.project,
  (project, previous) => {
    if (restoring || project === previous) return
    const now = Date.now()
    if (now - lastPush > MERGE_MS || past.length === 0) {
      past.push(previous)
      if (past.length > LIMIT) past.shift()
    }
    lastPush = now
    future = []
  }
)

function restore(project: Project): void {
  restoring = true
  try {
    useProjectStore.setState({ project })
  } finally {
    restoring = false
  }
  lastPush = 0
}

export function undo(): boolean {
  const previous = past.pop()
  if (!previous) return false
  future.push(useProjectStore.getState().project)
  restore(previous)
  return true
}

export function redo(): boolean {
  const next = future.pop()
  if (!next) return false
  past.push(useProjectStore.getState().project)
  restore(next)
  return true
}

// Called before every shortcut action: its change always becomes its own undo step
export function markStep(): void {
  lastPush = 0
}

export function historySize(): { undo: number; redo: number } {
  return { undo: past.length, redo: future.length }
}

export function resetHistory(): void {
  past = []
  future = []
}
