; AI Music Studio - custom NSIS hooks (electron-builder)

; Before installing or updating: end a running AI Music Studio and its AI backend (Python) instead of asking the
; user to close them. The backend and its workers run from the app's own environments under %APPDATA%\desktop\engines.
!macro customCheckAppRunning
  nsExec::Exec 'taskkill /F /T /IM "AI Music Studio.exe"'
  nsExec::Exec 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process python*,pythonw* -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like \"*\desktop\engines\*\" } | Stop-Process -Force"'
  Sleep 1000
!macroend

; What Windows shows under Settings > Apps for AI Music Studio: description, project page and help link.
!macro customInstall
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "Comments" "Free, open-source music studio for Windows with local AI song and loop generation and a full DAW."
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "URLInfoAbout" "https://github.com/pierrecinema/ai-music-studio"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "HelpLink" "https://github.com/pierrecinema/ai-music-studio#easy-windows-installation"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "URLUpdateInfo" "https://github.com/pierrecinema/ai-music-studio/releases"
  DetailPrint "AI Music Studio installed. For the AI features install Python 3.11 or 3.12, then open Settings > AI Engines."
!macroend
