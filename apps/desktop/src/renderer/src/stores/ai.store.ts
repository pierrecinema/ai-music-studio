import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIProvider, AIMessage } from '../types'

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5'
export const DEFAULT_OPENAI_MODEL = 'gpt-4o'
export const DEFAULT_GROK_MODEL = 'grok-4.1-fast'
export const DEFAULT_OLLAMA_MODEL = 'llama3.2'

interface AIState {
  provider: AIProvider
  claudeApiKey: string
  openaiApiKey: string
  grokApiKey: string
  model: string
  claudeModel: string
  openaiModel: string
  grokModel: string
  ollamaModel: string
  messages: AIMessage[]
  isThinking: boolean

  setProvider: (p: AIProvider) => void
  setClaudeApiKey: (key: string) => void
  setOpenaiApiKey: (key: string) => void
  setGrokApiKey: (key: string) => void
  setModel: (m: string) => void
  addMessage: (msg: Omit<AIMessage, 'timestamp'>) => void
  clearMessages: () => void
  setThinking: (v: boolean) => void
}

const MODEL_FIELD: Record<AIProvider, 'claudeModel' | 'openaiModel' | 'grokModel' | 'ollamaModel'> = {
  claude: 'claudeModel', openai: 'openaiModel', grok: 'grokModel', ollama: 'ollamaModel'
}

/** The key for the chosen provider. Ollama runs on this PC and needs none. */
export function apiKeyFor(s: Pick<AIState, 'provider' | 'claudeApiKey' | 'openaiApiKey' | 'grokApiKey'>): string {
  return s.provider === 'claude' ? s.claudeApiKey : s.provider === 'openai' ? s.openaiApiKey : s.provider === 'grok' ? s.grokApiKey : 'local'
}

export const PROVIDER_LABEL: Record<AIProvider, string> = {
  claude: 'Claude', openai: 'GPT', grok: 'Grok', ollama: 'Ollama (local)'
}

export const useAIStore = create<AIState>()(
  persist(
    (set) => ({
      provider: 'claude',
      claudeApiKey: '',
      openaiApiKey: '',
      grokApiKey: '',
      model: DEFAULT_CLAUDE_MODEL,
      claudeModel: DEFAULT_CLAUDE_MODEL,
      openaiModel: DEFAULT_OPENAI_MODEL,
      grokModel: DEFAULT_GROK_MODEL,
      ollamaModel: DEFAULT_OLLAMA_MODEL,
      messages: [],
      isThinking: false,

      // `model` is the active model; each provider remembers its own choice
      setProvider: (provider) => set((s) => ({ provider, model: s[MODEL_FIELD[provider]] })),
      setClaudeApiKey: (claudeApiKey) => set({ claudeApiKey }),
      setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
      setGrokApiKey: (grokApiKey) => set({ grokApiKey }),
      setModel: (model) => set((s) => ({ model, [MODEL_FIELD[s.provider]]: model })),
      addMessage: (msg) =>
        set((s) => ({
          messages: [...s.messages, { ...msg, timestamp: Date.now() }]
        })),
      clearMessages: () => set({ messages: [] }),
      setThinking: (isThinking) => set({ isThinking })
    }),
    {
      name: 'ams-ai',
      version: 3,
      migrate: (persisted: unknown, version: number) => {
        const p = (persisted ?? {}) as Partial<AIState>
        if (version < 2) {
          // v1 stored a single shared model: keep the user's choice for the active provider
          p.claudeModel = p.provider === 'openai' ? DEFAULT_CLAUDE_MODEL : (p.model ?? DEFAULT_CLAUDE_MODEL)
          p.openaiModel = p.provider === 'openai' ? (p.model ?? DEFAULT_OPENAI_MODEL) : DEFAULT_OPENAI_MODEL
        }
        return { grokApiKey: '', grokModel: DEFAULT_GROK_MODEL, ollamaModel: DEFAULT_OLLAMA_MODEL, ...p } as AIState
      },
      partialize: (s) => ({
        provider: s.provider,
        claudeApiKey: s.claudeApiKey,
        openaiApiKey: s.openaiApiKey,
        grokApiKey: s.grokApiKey,
        model: s.model,
        claudeModel: s.claudeModel,
        openaiModel: s.openaiModel,
        grokModel: s.grokModel,
        ollamaModel: s.ollamaModel
      })
    }
  )
)
