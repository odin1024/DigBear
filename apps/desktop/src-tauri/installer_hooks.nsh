; 掘掘熊 DigBear —— 安装器钩子
;
; 注册 digbear:// 协议，浏览器扩展点右键菜单时通过它把网址交给应用。
; 协议只在「当前用户」范围注册（安装模式为 currentUser），不需要管理员权限。

!macro NSIS_HOOK_POSTINSTALL
  ; --- digbear:// 协议 ---
  WriteRegStr SHCTX "Software\Classes\digbear" "" "URL:DigBear 协议"
  WriteRegStr SHCTX "Software\Classes\digbear" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\digbear\DefaultIcon" "" "$INSTDIR\dig-bear.exe,0"
  WriteRegStr SHCTX "Software\Classes\digbear\shell" "" "open"
  WriteRegStr SHCTX "Software\Classes\digbear\shell\open\command" "" '"$INSTDIR\dig-bear.exe" --deep-link "%1"'

  ; --- 资源管理器右键菜单：把文件夹里的网址交给应用 ---
  WriteRegStr SHCTX "Directory\shell\DigBearUrls" "MUIVerb" "用掘掘熊翻找这个文件夹里的网址"
  WriteRegStr SHCTX "Directory\shell\DigBearUrls" "Icon" "$INSTDIR\dig-bear.exe"
  WriteRegStr SHCTX "Directory\shell\DigBearUrls\command" "" '"$INSTDIR\dig-bear.exe" --folder "%1"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey SHCTX "Software\Classes\digbear"
  DeleteRegKey SHCTX "Directory\shell\DigBearUrls"
!macroend