# Feedback and Troubleshooting

## Report a problem
Bottom right: **Feedback**. It collects system data, engine state and the last log lines; nothing is sent automatically.
1. Switch on **Detailed log**, reproduce the problem.
2. **Save log as file…** (or copy it), then open a [GitHub issue](https://github.com/pierrecinema/ai-music-studio/issues) and attach the log and a screenshot.

## Common problems
| Problem | Solution |
|---|---|
| Status bar: *AI backend offline* | [[Settings]] → AI Engines: is Python 3.11/3.12 installed? Run **Install selected** |
| A package fails to install | Read the end of the log in AI Engines, press **Install selected** again; if it stays, send the log |
| Windows shows "Windows protected your PC" | The installer is not code-signed yet: **More info → Run anyway** |
| The AI uses the processor, not the graphics card | AMD / Intel: install *Graphics card support* and *Fast vocal separation*; NVIDIA: choose the CUDA variant of PyTorch |
| A synced song is not quite in time | Check its tempo in the clip bar (÷2 / ×2 or type it); songs with an unsteady tempo get a warning: see [[Beat Matching and Sync]] |
| Update not offered | [[Settings]] → Updates → Check for updates |
| Settings do not close | ✕ at the top right, **Esc**, or the gear again |

The full German manual: [docs/MANUAL.md](https://github.com/pierrecinema/ai-music-studio/blob/main/docs/MANUAL.md).
