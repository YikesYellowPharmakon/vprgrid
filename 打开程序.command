#!/bin/zsh
# VprGrid.SYS — 双击启动完整应用（开发服务 8080）
# 窗口不要关。关了服务就停。

# 走没有 ~ 的 iCloud 别名，避免访达把 com~apple~CloudDocs 传进 zsh 后路径被截断
CLEAN="/Users/ye/icloud/Playground/NewMusic/V1"
if [[ -z "$VPRGRID_LAUNCHED" && -x "$CLEAN/打开程序.command" ]]; then
  export VPRGRID_LAUNCHED=1
  exec /bin/zsh --no-rcs "$CLEAN/打开程序.command"
fi

# 访达双击时不会读 .zshrc，PATH 往往只有 /usr/bin，找不到已安装的 npm。
export PATH="/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:$HOME/.local/bin:$HOME/bin:$PATH"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
fi
if [[ -d "$HOME/.volta/bin" ]]; then
  export PATH="$HOME/.volta/bin:$PATH"
fi
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --shell zsh 2>/dev/null)" || true
fi

ROOT="$CLEAN"
[[ -d "$ROOT" ]] || ROOT="${0:A:h}"
cd "$ROOT" || {
  echo "找不到项目目录：$ROOT"
  read -r "?按回车关闭 "
  exit 1
}

LOG="/tmp/vprgrid-quickstart.log"
{
  echo
  echo "==== $(date '+%Y-%m-%d %H:%M:%S') 打开程序 ===="
  echo "ROOT=$ROOT"
  echo "PATH=$PATH"
} >>"$LOG"

echo "== VprGrid.SYS 启动 =="
echo "目录：$ROOT"

if ! command -v npm >/dev/null 2>&1; then
  echo "还没有 Node.js（当前 PATH 里找不到 npm）。"
  echo "打开 https://nodejs.org 安装 LTS，装完再双击本文件。"
  echo "记录：$LOG"
  read -r "?按回车关闭 "
  exit 1
fi

echo "Node $(node -v 2>/dev/null) · npm $(npm -v 2>/dev/null) · $(command -v npm)"

if [[ ! -d node_modules ]]; then
  echo "第一次启动，正在安装依赖（只要一次，可能要几分钟）..."
  npm install || {
    echo "依赖安装失败。记录：$LOG"
    read -r "?按回车关闭 "
    exit 1
  }
fi

is_up() {
  curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:8080/"
}

if is_up; then
  echo "服务已在运行，打开浏览器。"
  open "http://127.0.0.1:8080/"
  read -r "?按回车关闭本窗口（服务会继续跑） "
  exit 0
fi

echo "启动完整应用。窗口不要关。就绪后会自动打开浏览器。"
(
  for _ in {1..90}; do
    if is_up; then
      open "http://127.0.0.1:8080/"
      exit 0
    fi
    sleep 1
  done
) &

npm run dev
status=$?
echo
if (( status != 0 )); then
  echo "启动失败（退出码 $status）。记录：$LOG"
fi
read -r "?按回车关闭本窗口 "
exit "$status"
