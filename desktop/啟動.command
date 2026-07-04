#!/bin/bash
# Mac 一鍵啟動：首次自動建 venv + 裝套件，之後秒開
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "找不到 python3。請先安裝 Python 3：https://www.python.org/downloads/"
  read -n 1 -s -r -p "按任意鍵關閉…"
  exit 1
fi

if [ ! -d ".venv" ]; then
  echo "首次啟動：建立環境並安裝套件（約 1 分鐘）…"
  python3 -m venv .venv
  ./.venv/bin/pip install --upgrade pip -q
  ./.venv/bin/pip install -r requirements.txt -q
fi

# 提醒：Mac 的 PDF→圖片需要 poppler
if [ ! -d "poppler" ] && ! command -v pdfinfo >/dev/null 2>&1; then
  echo "⚠ 未偵測到 poppler，PDF→圖片可能失敗。可執行：brew install poppler"
fi

./.venv/bin/python "PDF轉換器.py"
