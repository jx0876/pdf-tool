# PDF 合併工具

圖片 / PDF 互相合併、PDF 轉圖片。兩種用法，自己選：

## 🌐 線上版（免安裝，推薦）

直接開網址就能用，手機也行，檔案全程在你瀏覽器內處理、**不會上傳**：

👉 **https://dodosomething.github.io/pdf-tool/**

功能：圖片＋PDF 合併成單一 PDF、PDF 轉 JPG/PNG（多張自動打包 zip）、拖曳排序。

## 💻 桌面版（可離線）

想離線、大量處理 → 下載 [`desktop/`](desktop/) 資料夾。

- **Windows**：雙擊 `啟動.bat`
- **Mac**：雙擊 `啟動.command`

首次啟動會自動建環境、裝套件（約 1 分鐘），之後秒開。
需先安裝 [Python 3](https://www.python.org/downloads/)。詳見 [desktop/README.md](desktop/README.md)。

---

## 技術

- 線上版：純前端 JS（[pdf-lib](https://pdf-lib.js.org/) 合併、[pdf.js](https://mozilla.github.io/pdf.js/) 轉圖、JSZip 打包），零後端
- 桌面版：Python + tkinter + Pillow + pdf2image + poppler
