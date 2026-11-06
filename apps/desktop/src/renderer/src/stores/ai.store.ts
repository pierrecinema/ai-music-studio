import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIProvider, AIMessage } from '../types'

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5'
export const DEFAULT_OPENAI_MODEL = 'gpt-4o'

interface AIState {
  provider: AIProvider
  claudeApiKey: string
  openaiApiKey: string
  model: string
  claudeModel: string
  openaiModel: string
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
      model: DEFAULT_CLAUDE_MODEL,
      claudeModel: DEFAULT_CLAUDE_MODEL,
      openaiModel: DEFAULT_OPENAI_MODEL,
      messages: [],
      isThinking: false,

      // `model` is the active model; each provider remembers its own choice
      setProvider: (provider) =>
        set((s) => ({ provider, model: provider === 'claude' ? s.claudeModel : s.openaiModel })),
      setClaudeApiKey: (claudeApiKey) => set({ claudeApiKey }),
      setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
      setModel: (model) =>
        set((s) => (s.provider === 'claude' ? { model, claudeModel: model } : { model, openaiModel: model })),
      addMessage: (msg) =>
        set((s) => ({
          messages: [...s.messages, { ...msg, timestamp: Date.now() }]
        })),
      clearMessages: () => set({ messages: [] }),
      setThinking: (isThinking) => set({ isThinking })
    }),
    {
      name: 'ams-ai',
      version: 2,
      migrate: (persisted: unknown) => {
        // v1 stored a single shared model: keep the user's choice for the active provider
        const p = (persisted ?? {}) as Partial<AIState>
        return {
          ...p,
          claudeModel: p.provider === 'openai' ? DEFAULT_CLAUDE_MODEL : (p.model ?? DEFAULT_CLAUDE_MODEL),
          openaiModel: p.provider === 'openai' ? (p.model ?? DEFAULT_OPENAI_MODEL) : DEFAULT_OPENAI_MODEL
        } as AIState
      },
      partialize: (s) => ({
        provider: s.provider,
        claudeApiKey: s.claudeApiKey,
        openaiApiKey: s.openaiApiKey,
        model: s.model,
        claudeModel: s.claudeModel,
        openaiModel: s.openaiModel
      })
    }
  )
)
