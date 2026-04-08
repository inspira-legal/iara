!macro customInstall
  nsExec::ExecToStack 'wsl.exe --status'
  Pop $0
  ${If} $0 == 0
    CreateShortCut "$SMPROGRAMS\Iara\Iara (WSL).lnk" "$INSTDIR\iara.exe" "--windows-mode=wsl"
  ${EndIf}
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Iara\Iara (WSL).lnk"
  RMDir /r "$LOCALAPPDATA\iara"
  RMDir /r "$LOCALAPPDATA\iara-wsl"
!macroend
