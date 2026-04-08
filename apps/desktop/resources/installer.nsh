!macro customUnInstall
  Delete "$SMPROGRAMS\Iara\Iara (WSL).lnk"
  RMDir /r "$LOCALAPPDATA\iara"
  RMDir /r "$LOCALAPPDATA\iara-wsl"
!macroend
