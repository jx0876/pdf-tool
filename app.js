/* PDF 合併工具 — 純瀏覽器版
   合併 PDF / 圖轉 PDF：pdf-lib
   PDF → 圖片：pdf.js（+ JSZip 多張打包）
   全程本機處理，檔案不上傳。 */

const { PDFDocument } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const IMG_EXT = ["jpg", "jpeg", "png", "bmp", "jfif", "webp"];
let files = [];          // {id, name, kind:'image'|'pdf', ext, bytes:ArrayBuffer}
let selected = null;     // 選中的 id
let uid = 0;

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
    files.push({ id: ++uid, name: f.name, kind, ext, bytes });
  }
  render();
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
    const icon = f.kind === "image" ? "🖼" : "📄";
    li.innerHTML =
      `<span class="idx">${String(i + 1).padStart(2, "0")}.</span>` +
      `<span>${icon}</span><span class="name"></span>`;
    li.querySelector(".name").textContent = f.name;
    li.addEventListener("click", () => { selected = f.id; render(); });
    listEl.appendChild(li);
  });
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
  files.splice(i, 1); selected = null; render();
};
$("#btn-clear").onclick = () => {
  if (files.length && confirm("確定清除所有檔案？")) { files = []; selected = null; render(); }
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
  $("#btn-merge").disabled = b; $("#btn-toimg").disabled = b;
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

render();
