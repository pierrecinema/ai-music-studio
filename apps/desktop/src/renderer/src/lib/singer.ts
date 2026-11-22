// helpers of the Vocal Editor's singers (kept free of React, so the tests can use them)

/** lyrics for the AI rapper: structure tags it knows ([Verse], [Chorus]) with a rap mark, lines of about 8 words */
export function rapLyrics(text: string): string {
  if (/^\s*\[/m.test(text)) return text.replace(/^\s*\[(verse|chorus|hook|bridge|intro|outro)([^\]]*)\]/gim, (_m, a: string, b: string) => `[${a}${b} - rap]`)
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const out: string[] = []
  for (const l of lines) {
    const w = l.split(/\s+/)
    for (let i = 0; i < w.length; i += 8) out.push(w.slice(i, i + 8).join(' '))
  }
  return `[Verse - rap]\n${out.join('\n')}`
}
// the singer's installation in four steps (main/engines.ts installSinger): share of the whole for each
const STAGES: Array<[number, number]> = [[0, 0], [0, 5], [5, 35], [35, 45], [45, 100]]
export const STAGE_TEXT: Record<number, string> = { 0: 'Installing the singer…', 1: '1/4 Python environment', 2: '2/4 PyTorch', 3: '3/4 Packages', 4: '4/4 Singing model (2.8 GB)' }
/** progress of the singer's installation from one log line: the step ("Step 2/4"), and inside it a percentage
 *  (download bars "45%") or downloaded / total size ("120.5/203.1 MB") */
export function installProgress(line: string, stage: number): { stage: number; pct: number | null } {
  const st = /^Step (\d)\/4/.exec(line)
  if (st) { const k = Number(st[1]); return { stage: k, pct: STAGES[k][0] } }
  const [a, b] = STAGES[stage] ?? [0, 0]
  const pc = /(\d{1,3})%\|/.exec(line)
  const mb = /([\d.]+)\/([\d.]+) ([MG])B/.exec(line)
  const f = pc ? Number(pc[1]) / 100 : mb && Number(mb[2]) > 0 ? Number(mb[1]) / Number(mb[2]) : null
  return { stage, pct: f === null || !stage ? null : Math.round(a + (b - a) * Math.min(1, f)) }
}
