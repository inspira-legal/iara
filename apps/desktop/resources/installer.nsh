!macro customInstall
  nsExec::ExecToStack 'wsl.exe --status'
  Pop $0
  ${If} $0 == 0
    MessageBox MB_YESNO "WSL detected. Would you also like to install Iara (WSL)?" IDYES installWsl IDNO skipWsl
    installWsl:
      CreateShortCut "$SMPROGRAMS\iara\iara (WSL).lnk" "$INSTDIR\iara.exe" "--windows-mode=wsl"
    skipWsl:
  ${EndIf}
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\iara\iara (WSL).lnk"
!macroend
