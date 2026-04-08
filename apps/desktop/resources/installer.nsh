!macro customInstall
  nsExec::ExecToStack 'wsl.exe --status'
  Pop $0
  ${If} $0 == 0
    CreateShortCut "$SMPROGRAMS\iara\iara (WSL).lnk" "$INSTDIR\iara.exe" "--windows-mode=wsl"
  ${EndIf}
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\iara\iara (WSL).lnk"
!macroend
