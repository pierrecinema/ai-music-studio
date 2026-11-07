// Copy text to the clipboard. The async API needs focus and a permission some environments deny:
// fall back to the old selection-based copy so that "Copy report" works everywhere.
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch { /* try the fallback */ }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
    document.body.appendChild(area)
    area.focus()
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch { return false }
}
