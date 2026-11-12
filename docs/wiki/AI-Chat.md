# AI Chat 💬

A music assistant for chords, lyrics, song structure, mixing tips and ideas. Choose the provider in [[Settings]] → AI:

| Provider | Cost | Setup |
|---|---|---|
| **Ollama** | free, runs on your PC, no account | install from ollama.com, run `ollama pull llama3.2` once, choose *Ollama* and the same model |
| **Claude** (Anthropic) | your own API key | paste the key, choose the model (or *Other model ID…*) |
| **ChatGPT** (OpenAI) | your own API key | paste the key, choose the model |
| **Grok** (xAI) | your own API key | paste the key |

Each provider remembers its own model. Keys are stored locally in the app's data folder. Without a key everything else in the app works; only the chat needs one (or Ollama).
