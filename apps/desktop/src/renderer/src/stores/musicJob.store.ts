import { create } from 'zustand'
import { api, type MusicJob } from '../lib/api'

// The running music job lives here, not inside the Create screen, so it keeps going and stays
// visible when the user opens another view and comes back.
interface MusicJobState {
  job: MusicJob | null
  error: string | null
  handled: string[]                       // finished jobs whose tracks were already put on the timeline
  setJob: (j: MusicJob | null) => void
  markHandled: (id: string) => void
  track: (jobId: string) => void
  cancel: () => Promise<void>
}

let timer: number | null = null

export const useMusicJob = create<MusicJobState>((set, get) => ({
  job: null,
  error: null,
  handled: [],
  setJob: (job) => set({ job, error: null }),
  markHandled: (id) => set((s) => ({ handled: [...s.handled, id] })),
  track: (jobId) => {
    if (timer) clearInterval(timer)
    let misses = 0
    timer = window.setInterval(async () => {
      try {
        const j = await api.music.job(jobId)
        misses = 0
        set({ job: j })
        if (j.status === 'done' || j.status === 'error' || j.status === 'cancelled') {
          if (timer) clearInterval(timer)
          timer = null
        }
      } catch (e) {
        // a busy backend may miss a poll: only give up after a minute of silence
        if (++misses > 40) {
          if (timer) clearInterval(timer)
          timer = null
          set({ error: String((e as Error).message) })
        }
      }
    }, 1500)
  },
  // Cancel button: the backend stops at the next step; finished songs stay in the library
  cancel: async () => {
    const j = get().job
    if (!j || !isBusy(j)) return
    set({ job: { ...j, cancel: true, stage_text: 'Cancelling: stops at the next step' } })
    try {
      const r = await api.music.cancel(j.id)
      if (r.status === 'cancelled') set({ job: await api.music.job(j.id) })
    } catch (e) {
      set({ error: String((e as Error).message) })
    }
    // A model that does not stop in time makes the backend restart itself (about 10 s): do not wait for it
    window.setTimeout(() => {
      const cur = get().job
      if (cur && cur.id === j.id && isBusy(cur)) {
        if (timer) clearInterval(timer)
        timer = null
        set({ job: { ...cur, status: 'cancelled', stage_text: 'Cancelled (the AI engine was restarted to stop at once)' } })
      }
    }, 12000)
  },
}))

export const isBusy = (j: MusicJob | null): boolean => j?.status === 'queued' || j?.status === 'running'
