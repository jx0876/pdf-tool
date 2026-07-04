/* PDF 合併工具 — 純瀏覽器版
   合併 PDF / 圖轉 PDF：pdf-lib
   PDF → 圖片、縮圖：pdf.js（+ JSZip 多張打包）
   拆分 PDF：pdf-lib
   全程本機處理，檔案不上傳。 */

const { PDFDocument, degrees } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const IMG_EXT = ["jpg", "jpeg", "png", "bmp", "jfif", "webp"];
let files = [];          // {id, name, kind:'image'|'pdf', ext, bytes:ArrayBuffer, pages?}
let selected = null;     // 選中的 id
let uid = 0;
const thumbCache = new Map();   // id -> dataURL
const thumbBusy = new Set();    // 正在產縮圖的 id

// ── DOM ──
const $ = (s) => document.querySelector(s);
const listEl = $("#filelist");
const emptyEl = $("#empty");
const logEl = $("#log");
const barFill = $("#bar-fill");
const dropzone = $("#dropzone");

// ── 記錄 ──
function log(msg, cls = "") {
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = msg + "\n";
  logEl.appendChild(span);
  logEl.scrollTop = logEl.scrollHeight;
}
function setBar(pct) { barFill.style.width = (pct * 100) + "%"; }

// ── 檔案加入 ──
function extOf(name) { return (name.split(".").pop() || "").toLowerCase(); }

async function addFiles(fileObjs) {
  for (const f of fileObjs) {
    const ext = extOf(f.name);
    let kind;
    if (ext === "pdf") kind = "pdf";
    else if (IMG_EXT.includes(ext)) kind = "image";
    else { log(`⚠ 略過不支援：${f.name}`, "err"); continue; }
    const bytes = await f.arrayBuffer();
    const item = { id: ++uid, name: f.name, kind, ext, bytes };
    if (kind === "pdf") {
      try { item.pages = (await PDFDocument.load(bytes)).getPageCount(); }
      catch { item.pages = 0; }
    }
    files.push(item);
  }
  render();
}

// ── 縮圖 ──
async function imageThumb(f) {
  const url = URL.createObjectURL(new Blob([f.bytes.slice(0)], { type: "image/" + f.ext }));
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url;
    });
    return drawThumb(img, img.naturalWidth, img.naturalHeight);
  } finally { URL.revokeObjectURL(url); }
}
async function pdfThumb(f) {
  const doc = await pdfjsLib.getDocument({ data: f.bytes.slice(0) }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const scale = Math.min(76 / vp.width, 100 / vp.height); // 縮圖目標 ~2x 顯示尺寸
  const v = page.getViewport({ scale });
  const c = document.createElement("canvas");
  c.width = Math.ceil(v.width); c.height = Math.ceil(v.height);
  await page.render({ canvasContext: c.getContext("2d"), viewport: v }).promise;
  return c.toDataURL("image/jpeg", 0.7);
}
function drawThumb(src, w, h) {
  const maxW = 76, maxH = 100;
  const s = Math.min(maxW / w, maxH / h, 1);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}
async function fillThumbs() {
  for (const f of files) {
    if (thumbCache.has(f.id) || thumbBusy.has(f.id)) continue;
    thumbBusy.add(f.id);
    try {
      const url = f.kind === "image" ? await imageThumb(f) : await pdfThumb(f);
      thumbCache.set(f.id, url);
      const el = listEl.querySelector(`li[data-id="${f.id}"] .thumb`);
      if (el) el.src = url;
    } catch { /* 縮圖失敗就留佔位，不影響功能 */ }
    finally { thumbBusy.delete(f.id); }
  }
}

// ── 清單畫面 ──
function render() {
  listEl.innerHTML = "";
  emptyEl.style.display = files.length ? "none" : "block";
  files.forEach((f, i) => {
    const li = document.createElement("li");
    li.draggable = true;
    li.dataset.id = f.id;
    if (f.id === selected) li.classList.add("selected");
    const cached = thumbCache.get(f.id) || "";
    const pageTag = f.kind === "pdf" ? `<span class="pages">${f.pages || "?"} 頁</span>` : "";
    li.innerHTML =
      `<span class="idx">${String(i + 1).padStart(2, "0")}.</span>` +
      `<img class="thumb" alt="" src="${cached}">` +
      `<span class="name"></span>${pageTag}`;
    li.querySelector(".name").textContent = f.name;
    li.addEventListener("click", () => { selected = f.id; render(); });
    listEl.appendChild(li);
  });
  updateSplitHint();
  fillThumbs();
}

// ── 拖曳排序 ──
let dragId = null;
listEl.addEventListener("dragstart", (e) => {
  const li = e.target.closest("li"); if (!li) return;
  dragId = +li.dataset.id; li.classList.add("dragging");
});
listEl.addEventListener("dragend", (e) => {
  const li = e.target.closest("li"); if (li) li.classList.remove("dragging");
  dragId = null;
});
listEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  const over = e.target.closest("li"); if (!over || dragId == null) return;
  const overId = +over.dataset.id;
  if (overId === dragId) return;
  const from = files.findIndex((f) => f.id === dragId);
  const to = files.findIndex((f) => f.id === overId);
  const [moved] = files.splice(from, 1);
  files.splice(to, 0, moved);
  render();
});

// ── 外部檔案拖放進視窗 ──
["dragenter", "dragover"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault(); dropzone.classList.add("dragover");
    }
  }));
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, () => dropzone.classList.remove("dragover")));
dropzone.addEventListener("drop", (e) => {
  if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); }
});

// ── 按鈕 ──
$("#btn-add-img").onclick = () => $("#file-img").click();
$("#btn-add-pdf").onclick = () => $("#file-pdf").click();
$("#file-img").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
$("#file-pdf").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };

function selIndex() { return files.findIndex((f) => f.id === selected); }
$("#btn-up").onclick = () => {
  const i = selIndex(); if (i <= 0) return;
  [files[i - 1], files[i]] = [files[i], files[i - 1]]; render();
};
$("#btn-down").onclick = () => {
  const i = selIndex(); if (i < 0 || i >= files.length - 1) return;
  [files[i], files[i + 1]] = [files[i + 1], files[i]]; render();
};
$("#btn-del").onclick = () => {
  const i = selIndex(); if (i < 0) return;
  thumbCache.delete(files[i].id);
  files.splice(i, 1); selected = null; render();
};
$("#btn-clear").onclick = () => {
  if (files.length && confirm("確定清除所有檔案？")) {
    files = []; selected = null; thumbCache.clear(); render();
  }
};

// ── 工具 ──
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function setBusy(b) {
  ["#btn-merge", "#btn-toimg", "#btn-split-extract", "#btn-split-each"]
    .forEach((s) => { $(s).disabled = b; });
}
// 非 jpg/png（bmp/webp/jfif 保險）→ 經 canvas 轉 png bytes
async function toPngBytes(bytes, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const img = await new Promise((res, rej) => {
    const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url;
  });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

// ── 合併輸出 PDF ──
$("#btn-merge").onclick = async () => {
  if (!files.length) { alert("請先新增檔案！"); return; }
  setBusy(true); setBar(0);
  log(`▶ 開始合併 ${files.length} 個檔案…`, "info");
  try {
    const out = await PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.kind === "pdf") {
        const src = await PDFDocument.load(f.bytes);
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      } else {
        let img;
        if (f.ext === "png") img = await out.embedPng(f.bytes);
        else if (["jpg", "jpeg", "jfif"].includes(f.ext)) img = await out.embedJpg(f.bytes);
        else img = await out.embedPng(await toPngBytes(f.bytes, "image/" + f.ext)); // bmp/webp
        const page = out.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
      setBar((i + 1) / files.length);
    }
    const bytes = await out.save();
    download(new Blob([bytes], { type: "application/pdf" }), `merged_${stamp()}.pdf`);
    log(`🎉 合併完成！已下載 merged_${stamp()}.pdf`, "ok");
  } catch (e) {
    log(`✘ 錯誤：${e.message}`, "err");
  } finally { setBusy(false); setBar(0); }
};

// ── PDF → 圖片 ──
$("#btn-toimg").onclick = async () => {
  const pdfs = files.filter((f) => f.kind === "pdf");
  if (!pdfs.length) { alert("清單裡沒有 PDF，請先新增 PDF！"); return; }
  const fmt = document.querySelector('input[name="fmt"]:checked').value; // JPG/PNG
  const dpi = +$("#dpi").value;
  const mime = fmt === "JPG" ? "image/jpeg" : "image/png";
  const ext = fmt === "JPG" ? "jpg" : "png";
  const scale = dpi / 72;

  setBusy(true); setBar(0);
  log(`▶ 開始將 ${pdfs.length} 個 PDF 轉成 ${fmt}（DPI ${dpi}）…`, "info");
  try {
    const outputs = []; // {name, blob}
    for (const f of pdfs) {
      const stem = f.name.replace(/\.pdf$/i, "");
      const doc = await pdfjsLib.getDocument({ data: f.bytes.slice(0) }).promise;
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const vp = page.getViewport({ scale });
        const c = document.createElement("canvas");
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        const blob = await new Promise((r) => c.toBlob(r, mime, 0.95));
        const name = doc.numPages === 1 ? `${stem}.${ext}`
          : `${stem}_${String(p).padStart(3, "0")}.${ext}`;
        outputs.push({ name, blob });
        setBar(outputs.length / (pdfs.length * doc.numPages));
      }
      log(`  ✔ ${stem} → ${doc.numPages} 張 ${fmt}`, "ok");
    }
    if (outputs.length === 1) {
      download(outputs[0].blob, outputs[0].name);
    } else {
      const zip = new JSZip();
      outputs.forEach((o) => zip.file(o.name, o.blob));
      const zblob = await zip.generateAsync({ type: "blob" });
      download(zblob, `images_${stamp()}.zip`);
    }
    log(`🎉 完成！共 ${outputs.length} 張${outputs.length > 1 ? "（已打包 zip）" : ""}`, "ok");
  } catch (e) {
    log(`✘ 錯誤：${e.message}`, "err");
  } finally { setBusy(false); setBar(0); }
};

// ── 拆分 PDF ──
// 找目前要拆分的 PDF：選取者優先；否則清單剛好只有 1 個 PDF 就用它
function currentPdf(silent) {
  const sel = files.find((f) => f.id === selected);
  if (sel && sel.kind === "pdf") return sel;
  const pdfs = files.filter((f) => f.kind === "pdf");
  if (pdfs.length === 1) return pdfs[0];
  if (!silent) alert(pdfs.length ? "請先在清單點選要拆分的 PDF" : "清單裡沒有 PDF！");
  return null;
}
function updateSplitHint() {
  const f = currentPdf(true);
  $("#split-hint").textContent = f ? `（${f.name}，共 ${f.pages || "?"} 頁）` : "";
}
// "1-3,5,8-10" → 0-based 索引陣列（驗證範圍、去重、保留輸入順序）
function parseRange(str, max) {
  const out = [];
  for (const part of str.split(",")) {
    const s = part.trim(); if (!s) continue;
    const m = s.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`頁碼格式錯誤：「${s}」`);
    let a = +m[1], b = m[2] ? +m[2] : a;
    if (a > b) [a, b] = [b, a];
    for (let p = a; p <= b; p++) {
      if (p < 1 || p > max) throw new Error(`頁碼超出範圍：${p}（共 ${max} 頁）`);
      out.push(p - 1);
    }
  }
  return [...new Set(out)];
}

$("#btn-split-extract").onclick = async () => {
  const f = currentPdf(); if (!f) return;
  const raw = $("#split-range").value.trim();
  if (!raw) { alert("請輸入要擷取的頁碼，例如 1-3,5"); return; }
  let idxs;
  try { idxs = parseRange(raw, f.pages); }
  catch (e) { alert(e.message); return; }
  if (!idxs.length) { alert("沒有有效頁碼"); return; }

  const stem = f.name.replace(/\.pdf$/i, "");
  setBusy(true); setBar(0);
  log(`▶ 從 ${f.name} 擷取第 ${raw} 頁（共 ${idxs.length} 頁）…`, "info");
  try {
    const src = await PDFDocument.load(f.bytes);
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, idxs);
    pages.forEach((p) => out.addPage(p));
    const bytes = await out.save();
    download(new Blob([bytes], { type: "application/pdf" }), `${stem}_擷取_${stamp()}.pdf`);
    log(`🎉 已擷取 ${idxs.length} 頁 → ${stem}_擷取.pdf`, "ok");
  } catch (e) {
    log(`✘ 錯誤：${e.message}`, "err");
  } finally { setBusy(false); setBar(0); }
};

$("#btn-split-each").onclick = async () => {
  const f = currentPdf(); if (!f) return;
  const n = f.pages || 0;
  if (n < 1) { alert("讀不到頁數"); return; }
  if (n === 1) { alert("只有 1 頁，不需要拆分"); return; }

  const stem = f.name.replace(/\.pdf$/i, "");
  setBusy(true); setBar(0);
  log(`▶ 將 ${f.name} 每頁拆成單獨 PDF（共 ${n} 頁）…`, "info");
  try {
    const src = await PDFDocument.load(f.bytes);
    const zip = new JSZip();
    for (let i = 0; i < n; i++) {
      const out = await PDFDocument.create();
      const [pg] = await out.copyPages(src, [i]);
      out.addPage(pg);
      const bytes = await out.save();
      zip.file(`${stem}_${String(i + 1).padStart(3, "0")}.pdf`, bytes);
      setBar((i + 1) / n);
    }
    const zblob = await zip.generateAsync({ type: "blob" });
    download(zblob, `${stem}_拆分_${stamp()}.zip`);
    log(`🎉 已拆成 ${n} 個單頁 PDF（打包 zip）`, "ok");
  } catch (e) {
    log(`✘ 錯誤：${e.message}`, "err");
  } finally { setBusy(false); setBar(0); }
};

// ── 頁面編輯（刪頁 / 旋轉 / 拖曳重排 → 輸出）──
let edFile = null;              // 正在編輯的檔
let edOps = [];                 // [{index:原頁碼(0-based), rotate:0/90/180/270}]
let edDoc = null;              // pdf.js doc（產頁縮圖用）
const edThumb = new Map();     // 原頁碼 -> dataURL

$("#btn-edit").onclick = async () => {
  const f = currentPdf(); if (!f) return;
  if (!f.pages) { alert("讀不到頁數"); return; }
  try { await openEditor(f); }
  catch (e) { alert("開啟失敗：" + e.message); }
};

async function openEditor(f) {
  edFile = f;
  edOps = Array.from({ length: f.pages }, (_, i) => ({ index: i, rotate: 0 }));
  edThumb.clear();
  edDoc = await pdfjsLib.getDocument({ data: f.bytes.slice(0) }).promise;
  $("#editor-title").textContent = `頁面編輯 — ${f.name}（${f.pages} 頁）`;
  $("#editor").hidden = false;
  renderEditor();
}
function closeEditor() {
  $("#editor").hidden = true;
  edFile = null; edOps = []; edDoc = null; edThumb.clear();
}

async function edPageThumb(origIndex) {
  if (edThumb.has(origIndex)) return edThumb.get(origIndex);
  const page = await edDoc.getPage(origIndex + 1);
  const vp = page.getViewport({ scale: 1 });
  const scale = Math.min(220 / vp.width, 300 / vp.height);
  const v = page.getViewport({ scale });
  const c = document.createElement("canvas");
  c.width = Math.ceil(v.width); c.height = Math.ceil(v.height);
  await page.render({ canvasContext: c.getContext("2d"), viewport: v }).promise;
  const url = c.toDataURL("image/jpeg", 0.72);
  edThumb.set(origIndex, url);
  return url;
}

function renderEditor() {
  const grid = $("#editor-grid");
  grid.innerHTML = "";
  edOps.forEach((op, pos) => {
    const card = document.createElement("div");
    card.className = "pcard";
    card.draggable = true;
    card.dataset.pos = pos;
    card.innerHTML =
      `<div class="pthumb-box"><img class="pthumb" alt=""></div>` +
      `<span class="pnum">第 ${pos + 1} 頁（原 ${op.index + 1}）</span>` +
      `<span class="pbtns">` +
      `<button class="rl" title="左轉">⟲</button>` +
      `<button class="rr" title="右轉">⟳</button>` +
      `<button class="del" title="刪頁">🗑</button></span>`;
    const img = card.querySelector(".pthumb");
    img.style.transform = `rotate(${op.rotate}deg)`;
    edPageThumb(op.index).then((u) => { img.src = u; }).catch(() => {});
    card.querySelector(".rl").onclick = (e) => { e.stopPropagation(); op.rotate = (op.rotate + 270) % 360; img.style.transform = `rotate(${op.rotate}deg)`; };
    card.querySelector(".rr").onclick = (e) => { e.stopPropagation(); op.rotate = (op.rotate + 90) % 360; img.style.transform = `rotate(${op.rotate}deg)`; };
    card.querySelector(".del").onclick = (e) => {
      e.stopPropagation();
      if (edOps.length <= 1) { alert("至少要留 1 頁"); return; }
      edOps.splice(pos, 1); renderEditor();
    };
    grid.appendChild(card);
  });
}

// 編輯器內拖曳重排
let edDragPos = null;
$("#editor-grid").addEventListener("dragstart", (e) => {
  const card = e.target.closest(".pcard"); if (!card) return;
  edDragPos = +card.dataset.pos; card.classList.add("dragging");
});
$("#editor-grid").addEventListener("dragend", (e) => {
  const card = e.target.closest(".pcard"); if (card) card.classList.remove("dragging");
  edDragPos = null;
});
$("#editor-grid").addEventListener("dragover", (e) => {
  e.preventDefault();
  const over = e.target.closest(".pcard"); if (!over || edDragPos == null) return;
  const to = +over.dataset.pos;
  if (to === edDragPos) return;
  const [moved] = edOps.splice(edDragPos, 1);
  edOps.splice(to, 0, moved);
  edDragPos = to;
  renderEditor();
});

$("#ed-cancel").onclick = closeEditor;

$("#ed-export").onclick = async () => {
  if (!edFile || !edOps.length) return;
  const f = edFile, ops = edOps.slice();
  const stem = f.name.replace(/\.pdf$/i, "");
  $("#ed-export").disabled = true;
  log(`▶ 輸出編輯後 PDF（${ops.length} 頁）…`, "info");
  try {
    const src = await PDFDocument.load(f.bytes);
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, ops.map((o) => o.index));
    copied.forEach((pg, i) => {
      const base = pg.getRotation().angle || 0;
      pg.setRotation(degrees(((base + ops[i].rotate) % 360 + 360) % 360));
      out.addPage(pg);
    });
    const bytes = await out.save();
    download(new Blob([bytes], { type: "application/pdf" }), `${stem}_編輯_${stamp()}.pdf`);
    log(`🎉 已輸出 ${ops.length} 頁 → ${stem}_編輯.pdf`, "ok");
    closeEditor();
  } catch (e) {
    log(`✘ 錯誤：${e.message}`, "err");
  } finally { $("#ed-export").disabled = false; }
};

render();
