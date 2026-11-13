// The sample rate of exported files (Settings → Audio): 44.1 kHz is what streaming platforms and distributors
// expect; AI models often render at 48 kHz, so files are converted on export.
const KEY = 'ams-sample-rate'
export const SAMPLE_RATES = [44100, 48000, 88200, 96000] as const

export function exportSampleRate(): number {
  try {
    const v = Number(localStorage.getItem(KEY))
    return (SAMPLE_RATES as readonly number[]).includes(v) ? v : 44100
  } catch { return 44100 }
}

export function setExportSampleRate(v: number): void {
  try { localStorage.setItem(KEY, String(v)) } catch { /* storage unavailable */ }
}
