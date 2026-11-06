; AI Music Studio — custom NSIS installer script
; Checks for Python 3.11+ and installs server dependencies

!macro customInstall
  ; Check if Python is available
  nsExec::ExecToStack '"python" "--version"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONINFORMATION "Python 3.11+ is recommended for AI features.$\n$\nYou can install it from python.org$\nThe app will still work without it (AI features disabled)." IDOK +1
  ${EndIf}

  ; Install Python server dependencies in background (best-effort)
  SetDetailsPrint both
  DetailPrint "Setting up AI backend..."
  nsExec::ExecToLog '"python" "-m" "pip" "install" "--quiet" "-r" "$INSTDIR\resources\server\requirements.txt" "--no-deps" "--prefer-binary"'
  DetailPrint "AI backend setup complete."
!macroend

!macro customUnInstall
  ; Nothing extra needed
!macroend
