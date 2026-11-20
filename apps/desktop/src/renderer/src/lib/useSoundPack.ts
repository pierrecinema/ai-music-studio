import { useEffect, useState } from 'react'
import { onSoundBank, soundBank } from '../audio/soundbank'

/** true while the sound pack is loaded (re-renders when it is installed or loaded) */
export function useSoundPack(): boolean {
  const [on, setOn] = useState(() => !!soundBank())
  useEffect(() => onSoundBank(() => setOn(!!soundBank())), [])
  return on
}
