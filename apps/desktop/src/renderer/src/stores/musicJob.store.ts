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
        if (j.status === 'done' || j.status === 'error') {
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
}))

export const isBusy = (j: MusicJob | null): boolean => j?.status === 'queued' || j?.status === 'running'
