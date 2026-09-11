#!/bin/zsh
# 与「打开程序」同一套启动逻辑
CLEAN="/Users/ye/icloud/Playground/NewMusic/V1"
if [[ -x "$CLEAN/打开程序.command" ]]; then
  export VPRGRID_LAUNCHED=1
  exec /bin/zsh --no-rcs "$CLEAN/打开程序.command"
fi
export VPRGRID_LAUNCHED=1
exec /bin/zsh --no-rcs "${0:h}/打开程序.command"
