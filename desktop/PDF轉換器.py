#!/usr/bin/env python3
"""
圖片 ↔ PDF 合併工具（升級版）
- 加入多檔清單，可調整順序
- 圖片 + PDF 混合合併成一個 PDF
- 多個 PDF 合併成一個
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import os, sys, threading
from pathlib import Path
from datetime import datetime

try:
    from PIL import Image
except ImportError:
    sys.exit("請先安裝 Pillow：pip install pillow")

try:
    from pdf2image import convert_from_path
except ImportError:
    sys.exit("請先安裝 pdf2image：pip install pdf2image")

try:
    import tkinterdnd2 as dnd
    HAS_DND = True
except ImportError:
    HAS_DND = False

try:
    from pypdf import PdfReader, PdfWriter
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False

def _resolve_poppler_path():
    here = os.path.dirname(os.path.abspath(__file__))
    # 打包後（PyInstaller）用 bundle 內的 poppler
    if getattr(sys, "frozen", False):
        bundled = os.path.join(sys._MEIPASS, "poppler")
        if os.path.isdir(bundled):
            return bundled
    # 同層 poppler/ 資料夾（跨平台優先，Windows 解壓後常是 poppler/Library/bin）
    for sub in ("poppler/Library/bin", "poppler/bin", "poppler"):
        cand = os.path.join(here, sub)
        if os.path.isdir(cand):
            return cand
    # 舊習慣：Windows C:\poppler；其他平台靠系統 PATH
    if os.path.isdir(r"C:\poppler\Library\bin"):
        return r"C:\poppler\Library\bin"
    return None  # None = pdf2image 走系統 PATH

POPPLER_PATH = _resolve_poppler_path()

# ── 顏色 ─────────────────────────────────────────────────
ACCENT  = "#4F8EF7"
BG      = "#F0F2F8"
CARD    = "#FFFFFF"
CARD2   = "#F8F9FC"
TEXT    = "#1E2235"
SUBTEXT = "#6B7280"
SUCCESS = "#22C55E"
ERROR   = "#EF4444"
BORDER  = "#E2E6EF"
HOVER   = "#EEF3FF"

# ── 核心轉換 ─────────────────────────────────────────────
def collect_images_from_file(path: str) -> list:
    """從單一檔案取得 PIL Image 清單（圖片或 PDF 都處理）"""
    ext = Path(path).suffix.lower()
    if ext == ".pdf":
        pages = convert_from_path(path, dpi=150, poppler_path=POPPLER_PATH)
        return [p.convert("RGB") for p in pages]
    else:
        return [Image.open(path).convert("RGB")]

def merge_to_pdf(file_paths: list, out_path: str):
    all_imgs = []
    for p in file_paths:
        all_imgs.extend(collect_images_from_file(p))
    if not all_imgs:
        raise ValueError("沒有可用的圖片")
    all_imgs[0].save(out_path, save_all=True, append_images=all_imgs[1:])

# ── GUI ──────────────────────────────────────────────────
class App(tk.Tk if not HAS_DND else dnd.Tk):
    def __init__(self):
        super().__init__()
        self.title("PDF 合併工具")
        self.geometry("600x620")
        self.update_idletasks()
        w, h = 600, 620
        sw = self.winfo_screenwidth()
        sh = self.winfo_screenheight()
        x = (sw - w) // 2
        y = (sh - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")
        self.minsize(500, 500)
        self.configure(bg=BG)
        self.out_dir = os.path.dirname(os.path.abspath(__file__))
        self.file_list = []   # 維護檔案清單
        self._build()

    def _build(self):
        # ── 標題 ──
        title_bar = tk.Frame(self, bg=ACCENT, height=52)
        title_bar.pack(fill="x")
        title_bar.pack_propagate(False)
        tk.Label(title_bar, text="🗂  PDF 合併工具",
                 font=("Microsoft JhengHei", 15, "bold"),
                 bg=ACCENT, fg="white").pack(side="left", padx=18)
        tk.Label(title_bar, text="圖片 / PDF → 合併成單一 PDF",
                 font=("Microsoft JhengHei", 10),
                 bg=ACCENT, fg="#C8D8FF").pack(side="left")

        # ── 拖放區 / 清單區 ──
        main = tk.Frame(self, bg=BG)
        main.pack(fill="both", expand=True, padx=20, pady=14)

        # 左側：清單
        list_card = tk.Frame(main, bg=CARD, highlightthickness=1,
                             highlightbackground=BORDER)
        list_card.pack(fill="both", expand=True)

        # 清單標題列
        list_header = tk.Frame(list_card, bg=CARD2, pady=8)
        list_header.pack(fill="x")
        tk.Label(list_header, text="📋  檔案清單（可調整順序）",
                 font=("Microsoft JhengHei", 10, "bold"),
                 bg=CARD2, fg=TEXT).pack(side="left", padx=12)
        tk.Label(list_header, text="拖放檔案至下方空白處",
                 font=("Microsoft JhengHei", 9),
                 bg=CARD2, fg=SUBTEXT).pack(side="right", padx=12)

        tk.Frame(list_card, bg=BORDER, height=1).pack(fill="x")

        # 拖放提示（清單為空時顯示）
        self.empty_label = tk.Label(list_card,
            text="📂\n\n將 JPG、PNG、PDF 拖放至此\n或點下方按鈕新增檔案",
            font=("Microsoft JhengHei", 12),
            bg=CARD, fg=SUBTEXT, justify="center", pady=40)
        self.empty_label.pack(expand=True)

        # Listbox + Scrollbar
        list_frame = tk.Frame(list_card, bg=CARD)
        # 先不 pack，等有檔案才顯示

        self.lb_scroll = tk.Scrollbar(list_frame)
        self.lb_scroll.pack(side="right", fill="y")

        self.listbox = tk.Listbox(list_frame,
                                   font=("Microsoft JhengHei", 10),
                                   bg=CARD, fg=TEXT,
                                   selectbackground=ACCENT,
                                   selectforeground="white",
                                   activestyle="none",
                                   relief="flat", bd=0,
                                   highlightthickness=0,
                                   yscrollcommand=self.lb_scroll.set)
        self.listbox.pack(side="left", fill="both", expand=True, padx=4)
        self.lb_scroll.config(command=self.listbox.yview)
        self.list_frame = list_frame

        # 拖放綁定
        if HAS_DND:
            self.empty_label.drop_target_register(dnd.DND_FILES)
            self.empty_label.dnd_bind("<<Drop>>", self._on_drop)
            self.listbox.drop_target_register(dnd.DND_FILES)
            self.listbox.dnd_bind("<<Drop>>", self._on_drop)

        # ── 操作按鈕列 ──
        ctrl = tk.Frame(self, bg=BG)
        ctrl.pack(fill="x", padx=20, pady=(0, 6))

        self._sbtn(ctrl, "＋ 新增圖片", self._add_images).pack(side="left", padx=(0,6))
        self._sbtn(ctrl, "＋ 新增 PDF", self._add_pdf).pack(side="left", padx=(0,6))
        self._sbtn(ctrl, "↑ 上移", self._move_up).pack(side="left", padx=(0,4))
        self._sbtn(ctrl, "↓ 下移", self._move_down).pack(side="left", padx=(0,4))
        self._sbtn(ctrl, "✕ 刪除", self._remove_item, danger=True).pack(side="left", padx=(0,4))
        self._sbtn(ctrl, "🗑 全部清除", self._clear_all, danger=True).pack(side="left")

        # ── 輸出資料夾 ──
        dir_row = tk.Frame(self, bg=BG)
        dir_row.pack(fill="x", padx=20, pady=(0,8))
        tk.Label(dir_row, text="輸出至：",
                 font=("Microsoft JhengHei", 10),
                 bg=BG, fg=SUBTEXT).pack(side="left")
        self.dir_label = tk.Label(dir_row,
                                   text=self.out_dir,
                                   font=("Microsoft JhengHei", 9),
                                   bg=BG, fg=TEXT, anchor="w")
        self.dir_label.pack(side="left", fill="x", expand=True)
        self._sbtn(dir_row, "變更", self._change_dir).pack(side="right")

        # ── PDF轉圖片 格式選項 ──
        fmt_row = tk.Frame(self, bg=BG)
        fmt_row.pack(fill="x", padx=20, pady=(0,6))

        tk.Label(fmt_row, text="PDF → 圖片  格式：",
                 font=("Microsoft JhengHei", 10),
                 bg=BG, fg=SUBTEXT).pack(side="left")

        self.img_fmt = tk.StringVar(value="JPG")
        for fmt in ["JPG", "PNG"]:
            tk.Radiobutton(fmt_row, text=fmt, variable=self.img_fmt, value=fmt,
                           font=("Microsoft JhengHei", 10),
                           bg=BG, fg=TEXT, selectcolor=BG,
                           activebackground=BG, cursor="hand2").pack(side="left", padx=(0,8))

        tk.Label(fmt_row, text="  DPI：",
                 font=("Microsoft JhengHei", 10),
                 bg=BG, fg=SUBTEXT).pack(side="left")

        self.img_dpi = tk.StringVar(value="300")
        dpi_menu = ttk.Combobox(fmt_row, textvariable=self.img_dpi,
                                 values=["150", "200", "300", "600"],
                                 width=5, state="readonly",
                                 font=("Microsoft JhengHei", 10))
        dpi_menu.pack(side="left")
        tk.Label(fmt_row, text="（數字越大越清晰）",
                 font=("Microsoft JhengHei", 9),
                 bg=BG, fg=SUBTEXT).pack(side="left", padx=(6,0))

        # ── 拆分 PDF ──
        split_row = tk.Frame(self, bg=BG)
        split_row.pack(fill="x", padx=20, pady=(0,8))
        tk.Label(split_row, text="✂ 拆分（對選取的 PDF）：",
                 font=("Microsoft JhengHei", 10),
                 bg=BG, fg=SUBTEXT).pack(side="left")
        self.split_entry = tk.Entry(split_row, width=18,
                                    font=("Microsoft JhengHei", 10),
                                    relief="flat", highlightthickness=1,
                                    highlightbackground=BORDER, highlightcolor=ACCENT)
        self.split_entry.pack(side="left", padx=(0,4), ipady=3)
        tk.Label(split_row, text="如 1-3,5,8-10",
                 font=("Microsoft JhengHei", 8),
                 bg=BG, fg=SUBTEXT).pack(side="left", padx=(0,8))
        self._sbtn(split_row, "擷取這些頁", self._split_extract).pack(side="left", padx=(0,4))
        self._sbtn(split_row, "每頁拆單檔", self._split_each).pack(side="left")

        # ── 功能按鈕列 ──
        action_row = tk.Frame(self, bg=BG)
        action_row.pack(fill="x", padx=20, pady=(0,8))

        self.merge_btn = tk.Button(action_row,
                                    text="⬇  合併輸出 PDF",
                                    font=("Microsoft JhengHei", 12, "bold"),
                                    bg=ACCENT, fg="white",
                                    activebackground="#3B73D9",
                                    activeforeground="white",
                                    relief="flat", cursor="hand2",
                                    command=self._merge)
        self.merge_btn.pack(side="left", fill="x", expand=True, ipady=12, padx=(0,8))

        self.to_img_btn = tk.Button(action_row,
                                     text="🖼  PDF → 圖片",
                                     font=("Microsoft JhengHei", 12, "bold"),
                                     bg="#22C55E", fg="white",
                                     activebackground="#16A34A",
                                     activeforeground="white",
                                     relief="flat", cursor="hand2",
                                     command=self._pdf_to_images)
        self.to_img_btn.pack(side="left", ipady=12, ipadx=16)

        # ── 進度 + 日誌 ──
        self.progress = ttk.Progressbar(self, mode="indeterminate")
        self.progress.pack(fill="x", padx=20, pady=(0,6))

        log_frame = tk.Frame(self, bg=CARD, highlightthickness=1,
                             highlightbackground=BORDER)
        log_frame.pack(fill="x", padx=20, pady=(0,16))
        self.log = tk.Text(log_frame, height=4, bg=CARD, fg=TEXT,
                           font=("Consolas", 9), state="disabled",
                           relief="flat", bd=0, highlightthickness=0)
        self.log.pack(fill="both", padx=8, pady=6)
        self.log.tag_configure("ok",   foreground=SUCCESS)
        self.log.tag_configure("err",  foreground=ERROR)
        self.log.tag_configure("info", foreground=ACCENT)

    # ── 按鈕工廠 ─────────────────────────────────────────
    def _sbtn(self, parent, text, cmd, danger=False):
        return tk.Button(parent, text=text, command=cmd,
                         font=("Microsoft JhengHei", 9, "bold"),
                         bg="#FDECEA" if danger else CARD,
                         fg=ERROR if danger else TEXT,
                         activebackground=ERROR if danger else HOVER,
                         activeforeground="white" if danger else ACCENT,
                         relief="flat", cursor="hand2",
                         highlightthickness=1,
                         highlightbackground=BORDER,
                         padx=10, pady=5)

    # ── 清單管理 ─────────────────────────────────────────
    def _refresh_list(self):
        self.listbox.delete(0, "end")
        for i, p in enumerate(self.file_list, 1):
            ext  = Path(p).suffix.upper().lstrip(".")
            name = Path(p).name
            icon = "🖼" if ext in ("JPG","JPEG","PNG","BMP","JFIF") else "📄"
            self.listbox.insert("end", f"  {i:02d}.  {icon}  {name}")

        if self.file_list:
            self.empty_label.pack_forget()
            self.list_frame.pack(fill="both", expand=True, padx=4, pady=4)
        else:
            self.list_frame.pack_forget()
            self.empty_label.pack(expand=True)

    def _add_paths(self, paths):
        for p in paths:
            if p not in self.file_list:
                self.file_list.append(p)
        self._refresh_list()

    def _on_drop(self, event):
        import re
        raw = event.data
        paths = re.findall(r'\{([^}]+)\}|(\S+)', raw)
        paths = [a or b for a, b in paths]
        valid_ext = (".jpg",".jpeg",".png",".bmp",".jfif",".pdf")
        good  = [p for p in paths if Path(p).suffix.lower() in valid_ext]
        bad   = [p for p in paths if Path(p).suffix.lower() not in valid_ext]
        if bad:
            self._log(f"⚠ 略過不支援的格式：{', '.join(Path(p).name for p in bad)}", "err")
        self._add_paths(good)

    def _add_images(self):
        paths = filedialog.askopenfilenames(
            title="選擇圖片",
            filetypes=[("圖片","*.jpg *.jpeg *.png *.bmp *.jfif"), ("所有","*.*")])
        if paths:
            self._add_paths(list(paths))

    def _add_pdf(self):
        paths = filedialog.askopenfilenames(
            title="選擇 PDF",
            filetypes=[("PDF","*.pdf"), ("所有","*.*")])
        if paths:
            self._add_paths(list(paths))

    def _move_up(self):
        sel = self.listbox.curselection()
        if not sel or sel[0] == 0:
            return
        i = sel[0]
        self.file_list[i-1], self.file_list[i] = self.file_list[i], self.file_list[i-1]
        self._refresh_list()
        self.listbox.selection_set(i-1)
        self.listbox.activate(i-1)

    def _move_down(self):
        sel = self.listbox.curselection()
        if not sel or sel[0] >= len(self.file_list)-1:
            return
        i = sel[0]
        self.file_list[i], self.file_list[i+1] = self.file_list[i+1], self.file_list[i]
        self._refresh_list()
        self.listbox.selection_set(i+1)
        self.listbox.activate(i+1)

    def _remove_item(self):
        sel = self.listbox.curselection()
        if not sel:
            return
        self.file_list.pop(sel[0])
        self._refresh_list()

    def _clear_all(self):
        if self.file_list and messagebox.askyesno("確認", "確定清除所有檔案？"):
            self.file_list.clear()
            self._refresh_list()

    # ── 拆分 PDF ─────────────────────────────────────────
    def _current_pdf(self):
        """取要拆分的 PDF：選取者優先；否則清單剛好只有 1 個 PDF 就用它。"""
        pdfs = [p for p in self.file_list if Path(p).suffix.lower() == ".pdf"]
        sel = self.listbox.curselection()
        if sel:
            p = self.file_list[sel[0]]
            if Path(p).suffix.lower() == ".pdf":
                return p
        if len(pdfs) == 1:
            return pdfs[0]
        if not pdfs:
            messagebox.showwarning("提示", "清單裡沒有 PDF，請先新增 PDF！")
        else:
            messagebox.showwarning("提示", "清單有多個 PDF，請先在清單點選要拆分的那個。")
        return None

    def _parse_range(self, s, total):
        """'1-3,5,8-10' → 0-based 頁碼清單（驗證、去重、保留順序）。"""
        out = []
        for part in s.split(","):
            part = part.strip()
            if not part:
                continue
            if "-" in part:
                a, _, b = part.partition("-")
                a, b = int(a), int(b)
            else:
                a = b = int(part)
            if a > b:
                a, b = b, a
            for p in range(a, b + 1):
                if p < 1 or p > total:
                    raise ValueError(f"頁碼超出範圍：{p}（共 {total} 頁）")
                if (p - 1) not in out:
                    out.append(p - 1)
        return out

    def _split_extract(self):
        if not HAS_PYPDF:
            messagebox.showerror("缺套件", "拆分需要 pypdf：pip install pypdf")
            return
        path = self._current_pdf()
        if not path:
            return
        raw = self.split_entry.get().strip()
        if not raw:
            messagebox.showinfo("提示", "請輸入頁碼，例如 1-3,5")
            return
        try:
            reader = PdfReader(path)
            idxs = self._parse_range(raw, len(reader.pages))
        except ValueError as e:
            messagebox.showerror("頁碼錯誤", str(e))
            return
        except Exception as e:
            messagebox.showerror("讀取失敗", str(e))
            return
        if not idxs:
            messagebox.showinfo("提示", "沒有有效頁碼")
            return
        stem  = Path(path).stem
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_path = os.path.join(self.out_dir, f"{stem}_擷取_{stamp}.pdf")
        try:
            writer = PdfWriter()
            for i in idxs:
                writer.add_page(reader.pages[i])
            with open(out_path, "wb") as f:
                writer.write(f)
            self._log(f"🎉 已擷取 {len(idxs)} 頁 → {Path(out_path).name}", "ok")
        except Exception as e:
            self._log(f"✘ 錯誤：{e}", "err")

    def _split_each(self):
        if not HAS_PYPDF:
            messagebox.showerror("缺套件", "拆分需要 pypdf：pip install pypdf")
            return
        path = self._current_pdf()
        if not path:
            return
        try:
            reader = PdfReader(path)
        except Exception as e:
            messagebox.showerror("讀取失敗", str(e))
            return
        n = len(reader.pages)
        if n < 2:
            messagebox.showinfo("提示", "只有 1 頁，不需要拆分")
            return
        stem = Path(path).stem
        out_dir = os.path.join(self.out_dir, f"{stem}_拆分")
        os.makedirs(out_dir, exist_ok=True)
        try:
            for i in range(n):
                writer = PdfWriter()
                writer.add_page(reader.pages[i])
                fp = os.path.join(out_dir, f"{stem}_{i+1:03d}.pdf")
                with open(fp, "wb") as f:
                    writer.write(f)
            self._log(f"🎉 已拆成 {n} 個單頁 PDF → {stem}_拆分/", "ok")
        except Exception as e:
            self._log(f"✘ 錯誤：{e}", "err")

    def _change_dir(self):
        d = filedialog.askdirectory(initialdir=self.out_dir)
        if d:
            self.out_dir = d
            self.dir_label.configure(text=d)

    # ── 合併執行 ─────────────────────────────────────────
    def _merge(self):
        if not self.file_list:
            messagebox.showwarning("提示", "請先新增檔案！")
            return

        stamp    = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_path = os.path.join(self.out_dir, f"merged_{stamp}.pdf")

        self.merge_btn.configure(state="disabled", text="⏳  合併中…", bg="#999")
        self.progress.start(10)
        self._log(f"▶ 開始合併 {len(self.file_list)} 個檔案…", "info")

        def run():
            try:
                merge_to_pdf(self.file_list, out_path)
                self.after(0, lambda: self._log(
                    f"🎉 合併完成！已儲存：{Path(out_path).name}", "ok"))
            except Exception as e:
                msg = str(e)
                self.after(0, lambda m=msg: self._log(f"✘ 錯誤：{m}", "err"))
            finally:
                self.after(0, self._done)

        threading.Thread(target=run, daemon=True).start()

    def _done(self):
        self.progress.stop()
        self.merge_btn.configure(state="normal", text="⬇  合併輸出 PDF", bg=ACCENT)
        self.to_img_btn.configure(state="normal", text="🖼  PDF → 圖片", bg="#22C55E")

    # ── PDF 轉圖片 ───────────────────────────────────────
    def _pdf_to_images(self):
        # 只取清單中的 PDF 檔案
        pdfs = [p for p in self.file_list if Path(p).suffix.lower() == ".pdf"]
        if not pdfs:
            # 清單沒有 PDF，直接開檔案選擇
            paths = filedialog.askopenfilenames(
                title="選擇要轉成圖片的 PDF",
                filetypes=[("PDF", "*.pdf"), ("所有", "*.*")])
            if not paths:
                return
            pdfs = list(paths)

        self.merge_btn.configure(state="disabled")
        self.to_img_btn.configure(state="disabled", text="⏳  轉換中…", bg="#999")
        self.progress.start(10)
        self._log(f"▶ 開始將 {len(pdfs)} 個 PDF 轉成 圖片…", "info")

        fmt = self.img_fmt.get()          # "JPG" or "PNG"
        dpi = int(self.img_dpi.get())
        pil_fmt  = "JPEG" if fmt == "JPG" else "PNG"
        file_ext = "jpg"  if fmt == "JPG" else "png"

        def run():
            total = 0
            try:
                for pdf_path in pdfs:
                    stem = Path(pdf_path).stem
                    pages = convert_from_path(pdf_path, dpi=dpi, poppler_path=POPPLER_PATH)
                    for i, page in enumerate(pages, 1):
                        if len(pages) == 1:
                            fname = os.path.join(self.out_dir, f"{stem}.{file_ext}")
                        else:
                            fname = os.path.join(self.out_dir, f"{stem}_{i:03d}.{file_ext}")
                        if pil_fmt == "JPEG":
                            page.convert("RGB").save(fname, pil_fmt, quality=95)
                        else:
                            page.save(fname, pil_fmt)
                        total += 1
                    self.after(0, lambda n=len(pages), s=stem: self._log(
                        f"  ✔ {s}  →  {n} 張 {fmt}", "ok"))
                self.after(0, lambda t=total: self._log(
                    f"🎉 完成！共輸出 {t} 張 {fmt}（DPI {dpi}）至 {self.out_dir}", "ok"))
            except Exception as e:
                msg = str(e)
                self.after(0, lambda m=msg: self._log(f"✘ 錯誤：{m}", "err"))
            finally:
                self.after(0, self._done)

        threading.Thread(target=run, daemon=True).start()

    # ── 日誌 ─────────────────────────────────────────────
    def _log(self, msg, tag=""):
        def _i():
            self.log.configure(state="normal")
            self.log.insert("end", msg+"\n", tag)
            self.log.see("end")
            self.log.configure(state="disabled")
        self.after(0, _i)

if __name__ == "__main__":
    app = App()
    app.mainloop()
