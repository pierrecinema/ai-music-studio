# AI Chat 💬

A music assistant for chords, lyrics, song structure, mixing tips and ideas, **that can use the app**: ask it to make a song ("make me an afro house track with female vocals") and it starts the music AI itself with the model chosen in Create music; the progress shows in the chat, and the finished song can go to the Studio with one click (it is in the Library too). It can also check a job, list LoRAs, split stems, master a track and suggest chords. Choose the provider in [[Settings]] → AI:

| Provider | Cost | Setup |
|---|---|---|
| **Ollama** | free, runs on your PC, no account | install from ollama.com, run `ollama pull llama3.2` once, choose *Ollama* and the same model |
| **Claude** (Anthropic) | your own API key | paste the key, choose the model (or *Other model ID…*) |
| **ChatGPT** (OpenAI) | your own API key | paste the key, choose the model |
| **Grok** (xAI) | your own API key | paste the key |
| **Gemini** (Google) | your own key, free tier with limits | key from aistudio.google.com; models Gemini 3.5 Flash / Pro |
| **Local server** | free, on your PC | LM Studio, KoboldCpp or llama.cpp server (also through Vulkan on older AMD cards); choose its address |

Each provider remembers its own model. Keys are stored locally in the app's data folder. Without a key everything else in the app works; only the chat needs one (or Ollama).
