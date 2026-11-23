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
  ; a new installation (not an update): the app opens the setup assistant on its next start, whatever is on the PC.
  ; Two marks: one in the user's app data (Electron's userData is always per user, also for an "all users"
  ; installation, where $APPDATA would be ProgramData) and an installation id next to the app, which the app compares
  ; with the last id it has seen (works even when the installer runs as another user, e.g. an administrator).
  ${ifNot} ${isUpdated}
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    CreateDirectory "$APPDATA\desktop"
    FileOpen $0 "$APPDATA\desktop\setup-pending" w
    FileWrite $0 "1"
    FileClose $0
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
    System::Call 'kernel32::GetSystemTimeAsFileTime(*l .r1)'
    FileOpen $0 "$INSTDIR\install-id" w
    FileWrite $0 "$1"
    FileClose $0
  ${endIf}
  DetailPrint "AI Music Studio installed. On the first start the setup assistant installs the AI features."
!macroend

; Uninstall: ask whether the AI engines, downloaded models and settings go too, so that a new installation starts like
; the very first one (with the setup assistant). Never on an update (the old version is uninstalled silently then) and
; "No" in a silent uninstall. The songs and projects (Music\AI Music Studio, Documents) always stay.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also remove the AI engines, the downloaded AI models and the settings of AI Music Studio (several GB)?$\r$\n$\r$\nYour songs and projects stay.$\r$\n$\r$\n---$\r$\n$\r$\nAuch die KI-Engines, die geladenen KI-Modelle und die Einstellungen von AI Music Studio entfernen (mehrere GB)?$\r$\n$\r$\nDeine Songs und Projekte bleiben erhalten." /SD IDNO IDNO keepData
      DetailPrint "Removing the AI engines, models and settings..."
      nsExec::Exec 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process python*,pythonw* -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like \"*\desktop\*\" } | Stop-Process -Force"'
      ; Electron's userData is per user, also for an "all users" installation
      ${if} $installMode == "all"
        SetShellVarContext current
      ${endif}
      RMDir /r "$APPDATA\desktop"
      RMDir /r "$PROFILE\.ai-music-studio\models"
      RMDir /r "$PROFILE\.ai-music-studio\hf"
      ${if} $installMode == "all"
        SetShellVarContext all
      ${endif}
    keepData:
  ${endIf}
!macroend
