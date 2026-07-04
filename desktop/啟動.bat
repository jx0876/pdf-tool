@echo off
REM Windows 一鍵啟動：首次自動建 venv + 裝套件，之後秒開
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo 找不到 python。請先安裝 Python 3（勾選 Add to PATH）：https://www.python.org/downloads/
    pause
    exit /b 1
)

if not exist ".venv" (
    echo 首次啟動：建立環境並安裝套件（約 1 分鐘）…
    python -m venv .venv
    ".venv\Scripts\python.exe" -m pip install --upgrade pip -q
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt -q
)

".venv\Scripts\pythonw.exe" "PDF轉換器.py"
