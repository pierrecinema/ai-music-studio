import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIProvider, AIMessage } from '../types'

interface AIState {
  provider: AIProvider
  claudeApiKey: string
  openaiApiKey: string
  model: string
  messages: AIMessage[]
  isThinking: boolean

  setProvider: (p: AIProvider) => void
  setClaudeApiKey: (key: string) => void
  setOpenaiApiKey: (key: string) => void
  setModel: (m: string) => void
  addMessage: (msg: Omit<AIMessage, 'timestamp'>) => void
  clearMessages: () => void
  setThinking: (v: boolean) => void
}

export const useAIStore = create<AIState>()(
  persist(
    (set) => ({
      provider: 'claude',
      claudeApiKey: '',
      openaiApiKey: '',
      model: 'claude-sonnet-4-5',
      messages: [],
      isThinking: false,

      setProvider: (provider) => set({ provider }),
      setClaudeApiKey: (claudeApiKey) => set({ claudeApiKey }),
      setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
      setModel: (model) => set({ model }),
      addMessage: (msg) =>
        set((s) => ({
          messages: [...s.messages, { ...msg, timestamp: Date.now() }]
        })),
      clearMessages: () => set({ messages: [] }),
      setThinking: (isThinking) => set({ isThinking })
    }),
    {
      name: 'ams-ai',
      partialize: (s) => ({
        provider: s.provider,
        claudeApiKey: s.claudeApiKey,
        openaiApiKey: s.openaiApiKey,
        model: s.model
      })
    }
  )
)
