# 桌面版（可離線）

## 用法

前提：電腦先裝好 [Python 3](https://www.python.org/downloads/)（Windows 安裝時勾 **Add to PATH**）。

- **Windows**：雙擊 `啟動.bat`
- **Mac**：雙擊 `啟動.command`
  - 第一次可能被 Gatekeeper 擋 → 右鍵 → 打開，或系統設定 → 隱私權與安全性 → 仍要打開

首次啟動：自動建 `.venv` 並安裝套件（約 1 分鐘）。之後直接開。

## PDF → 圖片 需要 poppler

- **Windows**：把 poppler 放進 `poppler/`（見 `poppler/放這裡.txt`），免額外安裝
- **Mac**：`brew install poppler`
- **Linux**：`sudo apt install poppler-utils`

程式找 poppler 的順序：打包內建 → 同層 `poppler/` → `C:\poppler` → 系統 PATH。

## 拖放排序

拖放（從檔案總管拖檔進來）需要 `tkinterdnd2`，只在 **Python 3.12 以下** 裝得動；
Python 3.13/3.14 會自動略過拖放，其餘功能正常（用「新增」按鈕 + 上移/下移）。

## 檔案

| 檔案 | 用途 |
|---|---|
| `PDF轉換器.py` | 主程式 |
| `啟動.bat` / `啟動.command` | 一鍵啟動（建 venv + 開） |
| `requirements.txt` | 套件清單 |
| `poppler/` | 放 poppler 執行檔（PDF→圖用） |
