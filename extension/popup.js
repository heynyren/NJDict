/**
 * Popup tra nhanh của NJDict.
 *
 * Dùng chung hệ thiết kế trong ui.css và bộ icon Phosphor trong icons.js với
 * trang Sổ tay, nên hai chỗ nhìn là cùng một app.
 */
const qEl = document.getElementById("q");
const dirEl = document.getElementById("dir");
const goEl = document.getElementById("go");
const resEl = document.getElementById("result");
const kanjiEl = document.getElementById("kanji");
const bookEl = document.getElementById("book");
const tabWordEl = document.getElementById("tabWord");
const tabKanjiEl = document.getElementById("tabKanji");
const tabTransEl = document.getElementById("tabTrans");
const transEl = document.getElementById("trans");
const IS_CTX_WINDOW = new URLSearchParams(location.search).get("ctx") === "1";
let initialSrc = null;   // nguồn của từ ban đầu (URL trang + tiêu đề + đoạn bôi đen) để tô sáng lại sau

/** Icon dạng phần tử DOM. */
function ic(ten, opt) {
  const s = document.createElement("span");
  s.innerHTML = window.Icon(ten, opt);
  return s.firstChild;
}

/** Ô trạng thái giữa thân popup (đang tra, không có kết quả…). */
function trangThai(box, iconTen, chu) {
  box.className = "state";
  box.innerHTML = "";
  box.appendChild(ic(iconTen, { size: 34, cls: iconTen === "spinner-gap" ? "spin" : "" }));
  box.appendChild(document.createElement("div")).textContent = chu;
}

/**
 * Chuỗi ngày hiện lên ngay trong popup.
 *
 * Popup là chỗ mở nhiều nhất trong ngày — mỗi lần bôi đen một từ là nó bật ra.
 * Nhét con số chuỗi ngày vào đây nghĩa là bạn thấy nó vài chục lần một ngày mà
 * không phải mở app, đó chính là lúc nó có tác dụng nhắc.
 */
async function veChuoiNgay() {
  try {
    const { hoc } = await chrome.storage.local.get("hoc");
    const view = window.TienDo.tongQuan(window.TienDo.chuanHoa(hoc), {});
    const chip = document.getElementById("streakChip");
    if (!view.chuoi.hienTai && !view.homNay.on) return;   // chưa học buổi nào -> không khoe gì cả
    chip.innerHTML = window.Icon("fire", { size: 14, weight: "solid" });
    const s = document.createElement("span");
    s.textContent = view.chuoi.hienTai
      ? view.chuoi.hienTai + " ngày · " + view.homNay.on + "/" + view.goal
      : view.homNay.on + "/" + view.goal + " hôm nay";
    chip.appendChild(s);
    chip.title = view.homNay.dat
      ? "Hôm nay đã đạt mục tiêu"
      : "Còn " + view.homNay.conLai + " lượt nữa là đạt mục tiêu hôm nay";
    chip.style.display = "";
  } catch (e) { /* không có dữ liệu tiến độ thì thôi */ }
}

// ---- Lấy từ đang bôi đen (web) hoặc vừa Ctrl+C (PDF) ----
async function getInitialWord() {
  try {
    const { pendingLookup } = await chrome.storage.local.get("pendingLookup");
    if (pendingLookup && pendingLookup.word && (Date.now() - (pendingLookup.ts || 0) < 15000)) {
      await chrome.storage.local.remove("pendingLookup");
      if (pendingLookup.src && pendingLookup.src.url) initialSrc = pendingLookup.src;
      return pendingLookup.word.trim();
    }
  } catch (e) { /* bỏ qua */ }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = (tab && tab.url) || "";
    const isPdf = /\.pdf(\?|#|$)/i.test(url);
    if (!isPdf && tab && tab.id && /^https?:/i.test(url)) {
      const res = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => (window.getSelection ? window.getSelection().toString() : "")
      });
      const t = ((res && res[0] && res[0].result) || "").trim();
      if (t) {
        initialSrc = { url: url, title: (tab.title || "").slice(0, 200), sel: t };
        return t;
      }
    }
  } catch (e) { /* PDF hoặc trang bị chặn -> đọc clipboard */ }
  return (await readClipboard()).trim();
}

async function readClipboard() {
  try {
    const t = await navigator.clipboard.readText();
    if (t && t.trim()) return t;
  } catch (e) { /* thử cách B */ }
  try {
    const ta = document.createElement("textarea");
    ta.style.position = "fixed"; ta.style.top = "-1000px"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    document.execCommand("paste");
    const v = ta.value;
    ta.remove();
    if (v) return v;
  } catch (e) { /* bỏ qua */ }
  return "";
}

// ---- Gọi API Mazii ----
async function lookup(word, dict) {
  const payload = { dict: dict, type: "word", query: word, limit: 20, page: 1 };
  const endpoints = ["https://mazii.net/api/search", "https://mazii.net/api/search/"];
  for (const url of endpoints) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) continue;
      const data = await r.json();
      const entries = extractEntries(data);
      if (entries.length) return entries;
    } catch (e) { /* thử endpoint kế tiếp */ }
  }
  return [];
}

function extractEntries(data) {
  let arr = (data && (data.results || data.data)) || [];
  if (!Array.isArray(arr)) arr = [];
  return arr.map((e) => ({
    word: e.word || e.title || e.text || e.query || "",
    reading: e.phonetic || e.pronounce || e.hiragana || "",
    means: normalizeMeans(e)
  })).filter((x) => x.word || x.means.length);
}

function normalizeMeans(e) {
  if (Array.isArray(e.means)) {
    return e.means.map((m) => (typeof m === "string" ? m : (m.mean || m.means || m.text || ""))).filter(Boolean);
  }
  if (typeof e.mean === "string") return [e.mean];
  if (typeof e.short_mean === "string") return [e.short_mean];
  return [];
}

// ---- Phát âm tiếng Nhật (giọng có sẵn của trình duyệt) ----
function speakJa(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 0.9;
    const v = speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith("ja"));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) { /* máy không có giọng Nhật */ }
}

// ---- Sổ tay (lưu trong máy) ----
async function getNotebook() {
  const { notebook } = await chrome.storage.local.get("notebook");
  return notebook || {};
}
/**
 * Gửi một bản lưu (hoặc bản sửa) lên service worker.
 *
 * Trước đây popup tự ghi thẳng vào chrome.storage — và vì thế xoá mất ghi chú
 * lẫn bản dịch đã hiệu đính mỗi lần tra lại cùng một từ. Nay mọi đường lưu đều
 * đi qua saveWord() ở nền, nơi có đủ luật giữ gìn những thứ bạn tự làm.
 */
function guiLuu(entry, dict, moi, coSua, goc, xong) {
  const e = Object.assign({}, entry, { means: moi.means, note: moi.note || "" });
  if (!e.src && initialSrc && initialSrc.url) {
    e.src = { url: initialSrc.url, title: initialSrc.title, sel: initialSrc.sel || entry.word };
  }
  if (coSua) { e.mEdit = 1; if (goc && goc.length) e.mOrig = goc; }
  chrome.runtime.sendMessage({ type: "SAVE_WORD", entry: e, dict: dict }, (kq) => {
    xong(chrome.runtime.lastError ? { ok: false } : (kq || { ok: true }));
  });
}

/* ==================================================================== */
/* Sửa nghĩa & ghi chú NGAY TRONG POPUP                                 */
/* ==================================================================== */
/*
 * Máy dịch sai với ngữ cảnh là chuyện gặp hằng ngày, nhất là với từ chuyên
 * ngành. Trước đây muốn chữa thì phải lưu → mở Sổ tay → tìm lại từ → sửa: bốn
 * bước cho một việc năm giây, nên rốt cuộc chẳng ai sửa. Nay sửa ngay ở đúng
 * chỗ vừa nhìn thấy nó sai — và SỬA LÀ LƯU: mục chưa có trong sổ tay thì được
 * tạo luôn kèm bản sửa, không bắt bấm Lưu trước rồi mới cho sửa.
 */

/** Ô soạn thảo tại chỗ: nghĩa (mỗi dòng một nghĩa) + ghi chú. */
function oSuaNhanh(dl, luu, huy) {
  const f = document.createElement("div");
  f.className = "edbox";
  const oVanBan = (nhan, giaTri, dong, goiY) => {
    const l = document.createElement("label"); l.className = "field-label"; l.textContent = nhan;
    f.appendChild(l);
    const t = document.createElement("textarea");
    t.rows = dong; t.value = giaTri || "";
    if (goiY) t.placeholder = goiY;
    t.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); huy(); }
    });
    f.appendChild(t);
    return t;
  };
  const oNghia = oVanBan("Nghĩa — mỗi dòng một nghĩa",
    (dl.means || []).join("\n"),
    Math.min(6, Math.max(2, (dl.means || []).length + 1)),
    "Nghĩa đúng với ngữ cảnh / chuyên ngành của bạn…");
  const oGhi = oVanBan("Ghi chú", dl.note || "", 2, "Ngữ cảnh, cách dùng, chỗ hay nhầm…");

  const row = document.createElement("div"); row.className = "edrow";
  const bLuu = document.createElement("button");
  bLuu.type = "button"; bLuu.className = "btn xs primary";
  bLuu.innerHTML = window.Icon("check", { size: 15 }) + '<span class="lb">Lưu</span>';
  const bHuy = document.createElement("button");
  bHuy.type = "button"; bHuy.className = "btn xs";
  bHuy.innerHTML = '<span class="lb">Huỷ</span>';
  bLuu.addEventListener("click", () => {
    bLuu.disabled = true;
    luu({
      means: oNghia.value.split("\n").map((s) => s.trim()).filter(Boolean),
      note: oGhi.value.trim()
    }, () => { bLuu.disabled = false; });
  });
  bHuy.addEventListener("click", huy);
  row.appendChild(bLuu); row.appendChild(bHuy);
  f.appendChild(row);
  setTimeout(() => {
    try { oNghia.focus(); oNghia.setSelectionRange(oNghia.value.length, oNghia.value.length); } catch (e) {}
  }, 0);
  return f;
}

/**
 * Một thẻ trong popup, sửa được tại chỗ.
 *
 * @param {Element} hostEl ô chứa thẻ (vẽ lại mỗi lần đổi trạng thái)
 * @param {object} ct  { dl, dau(el), veNghia(el, dl), phu(el, dl), gui(dl, coSua, xong) }
 */
function theSuaDuoc(hostEl, ct) {
  const dl = ct.dl;

  function nutHanhDong() {
    const acts = document.createElement("div"); acts.className = "acts";
    const sv = document.createElement("button");
    sv.type = "button"; sv.className = "btn xs save";
    const danhDau = () => {
      sv.classList.add("saved");
      sv.innerHTML = window.Icon("check", { size: 15 }) + '<span class="lb">Đã lưu</span>';
      sv.disabled = true;
    };
    if (dl.saved) danhDau();
    else {
      sv.innerHTML = window.Icon("plus", { size: 15 }) + '<span class="lb">Lưu</span>';
      sv.addEventListener("click", () => {
        sv.disabled = true;
        ct.gui({ means: dl.means, note: dl.note }, false, (kq) => {
          if (kq && kq.ok !== false) { dl.saved = true; danhDau(); } else sv.disabled = false;
        });
      });
    }
    acts.appendChild(sv);

    const ed = document.createElement("button");
    ed.type = "button"; ed.className = "btn xs";
    ed.title = "Sửa nghĩa & ghi chú";
    ed.innerHTML = window.Icon("pencil-simple", { size: 15 }) + '<span class="lb">Sửa</span>';
    ed.addEventListener("click", moSua);
    acts.appendChild(ed);
    return acts;
  }

  function veDau(hienNut) {
    const head = document.createElement("div");
    head.className = "rowx between";
    head.style.alignItems = "flex-start";
    const left = document.createElement("div");
    if (ct.dau) ct.dau(left, dl);
    if (dl.mEdit) {
      const tg = document.createElement("span");
      tg.className = "tag edited";
      tg.innerHTML = window.Icon("pencil-simple", { size: 12 }) + "<span>bản của bạn</span>";
      left.appendChild(tg);
    }
    head.appendChild(left);
    if (hienNut) head.appendChild(nutHanhDong());
    hostEl.appendChild(head);
  }

  function ve() {
    hostEl.innerHTML = "";
    veDau(true);
    ct.veNghia(hostEl, dl);
    if (dl.note) {
      const n = document.createElement("div"); n.className = "notebox";
      const b = document.createElement("b"); b.textContent = "Ghi chú · ";
      n.appendChild(b);
      n.appendChild(document.createTextNode(dl.note));
      hostEl.appendChild(n);
    }
    if (ct.phu) ct.phu(hostEl, dl);
  }

  function moSua() {
    hostEl.innerHTML = "";
    veDau(false);
    hostEl.appendChild(oSuaNhanh(dl, (moi, thatBai) => {
      ct.gui(moi, true, (kq) => {
        if (!kq || kq.ok === false) { thatBai(); return; }
        dl.means = moi.means; dl.note = moi.note; dl.saved = true; dl.mEdit = 1;
        ve();
      });
    }, ve));
    if (ct.phu) ct.phu(hostEl, dl);
  }

  ve();
}

// ---- Tab Từ vựng ----
async function renderWord(entries) {
  const nb = await getNotebook();
  resEl.className = "";
  resEl.innerHTML = "";
  if (!entries.length) {
    trangThai(resEl, "warning-circle", "Không lấy được nghĩa. Kiểm tra mạng rồi thử lại.");
    return;
  }
  const dict = dirEl.value;
  for (const en of entries) {
    const box = document.createElement("div");
    box.className = "entry";
    resEl.appendChild(box);
    // Nghĩa Mazii trả về cũng sửa được; đã sửa lần trước thì hiện thẳng bản của
    // bạn chứ không hiện lại bản máy rồi bắt bạn tự nhớ là mình đã hiệu đính.
    const daCo = window.Muc.banCuaBan(nb[dict + ":" + en.word]);
    const goc = (en.means || []).slice(0, 8);
    theSuaDuoc(box, {
      dl: {
        means: (daCo && daCo.mEdit ? (daCo.means || []) : goc).slice(0, 6),
        note: (daCo && daCo.note) || "",
        saved: !!(daCo && daCo.saved),
        mEdit: daCo && daCo.mEdit ? 1 : 0
      },
      dau: (el) => {
        const w = document.createElement("span");
        w.className = "ja"; w.style.cssText = "font-size:21px;font-weight:750;letter-spacing:-.01em";
        w.textContent = en.word;
        el.appendChild(w);
        const spk = document.createElement("button");
        spk.className = "iconbtn"; spk.type = "button"; spk.title = "Phát âm";
        spk.appendChild(ic("speaker-high", { size: 17 }));
        spk.addEventListener("click", () => speakJa(en.word));
        el.appendChild(spk);
        if (en.reading) {
          const r = document.createElement("span");
          r.style.cssText = "color:var(--accent);font-size:13.5px;font-weight:600;margin-left:6px";
          r.textContent = en.reading;
          el.appendChild(r);
        }
      },
      veNghia: (el, dl) => {
        if (!dl.means.length) return;
        const ul = document.createElement("ul");
        ul.className = "m";
        dl.means.forEach((m) => { const li = document.createElement("li"); li.textContent = m; ul.appendChild(li); });
        el.appendChild(ul);
      },
      gui: (moi, coSua, xong) => guiLuu(en, dict, moi, coSua, goc, xong)
    });
  }
}

// ---- Tab Hán tự (dữ liệu offline) ----
function extractKanji(str) {
  const seen = new Set(); const out = [];
  for (const ch of (str || "")) {
    const c = ch.codePointAt(0);
    const isCJK = (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0xf900 && c <= 0xfaff);
    if (isCJK && !seen.has(ch)) { seen.add(ch); out.push(ch); }
  }
  return out;
}

/**
 * Tab Hán tự: mỗi chữ là một thẻ đầy đủ và LƯU ĐƯỢC vào sổ tay như từ vựng.
 *
 * Một chữ Hán không phải chú thích của từ, nó là đơn vị học riêng — nhớ 電 thì
 * đọc được 電気・電車・停電 mà chẳng cần tra lại chữ nào. Nên nó xứng đáng có
 * chỗ trong sổ tay và trong sóng học tập, chứ không chỉ là một dòng phụ.
 */
async function renderKanji(chars) {
  kanjiEl.innerHTML = "";
  if (!chars.length) {
    trangThai(kanjiEl, "text-aa", "Đoạn này không có chữ Hán nào.");
    return;
  }
  kanjiEl.className = "";
  const list = window.HanTu.LIET_KE(chars.join(""));
  const nb = await getNotebook();

  for (const k of list) {
    const row = document.createElement("div");
    row.className = "kentry";

    const cEl = document.createElement("div");
    cEl.className = "kchar"; cEl.textContent = k.ch;
    row.appendChild(cEl);

    const body = document.createElement("div");
    body.className = "kbody";
    row.appendChild(body);
    kanjiEl.appendChild(row);

    const muc = window.HanTu.MUC(k);
    const goc = (muc.means || []).slice(0, 8);
    const daCo = window.Muc.banCuaBan(nb[window.HanTu.KHOA(k.ch)]);
    theSuaDuoc(body, {
      dl: {
        means: (daCo && daCo.mEdit ? (daCo.means || []) : goc).slice(0, 6),
        note: (daCo && daCo.note) || "",
        saved: !!(daCo && daCo.saved),
        mEdit: daCo && daCo.mEdit ? 1 : 0
      },
      dau: (el) => {
        const hv = document.createElement("span");
        hv.className = "khv";
        hv.textContent = k.hv || "—";
        el.appendChild(hv);
        const meta = window.HanTu.META(k);
        if (meta) {
          const m = document.createElement("div");
          m.className = "kmeta"; m.textContent = meta;
          el.appendChild(m);
        }
      },
      veNghia: (el, dl) => {
        if (dl.means.length) {
          const ul = document.createElement("ul");
          ul.className = "kmean";
          dl.means.forEach((m) => { const li = document.createElement("li"); li.textContent = m; ul.appendChild(li); });
          el.appendChild(ul);
        } else {
          const m = document.createElement("div");
          m.className = "kmeta";
          m.textContent = "Chưa có nghĩa cho chữ này — bấm Sửa để tự viết vào.";
          el.appendChild(m);
        }
      },
      gui: (moi, coSua, xong) => guiLuu(muc, window.HanTu.HUONG, moi, coSua, goc, xong)
    });
  }
}

// ---- Chuyển tab ----
function switchTab(name) {
  tabWordEl.classList.toggle("active", name === "word");
  tabKanjiEl.classList.toggle("active", name === "kanji");
  tabTransEl.classList.toggle("active", name === "trans");
  resEl.style.display   = name === "word"  ? "" : "none";
  kanjiEl.style.display = name === "kanji" ? "" : "none";
  transEl.style.display = name === "trans" ? "" : "none";
  if (name === "trans") doTranslate(qEl.value);
}

// ---- Dịch câu ----
let lastTranslated = "";
function doTranslate(raw) {
  const text = (raw || "").trim();
  if (!text) { trangThai(transEl, "translate", "Nhập hoặc dán đoạn cần dịch."); return; }
  if (lastTranslated === text && transEl.querySelector(".tr")) return;   // đã dịch rồi
  trangThai(transEl, "spinner-gap", "Đang dịch…");
  chrome.runtime.sendMessage({ type: "TRANSLATE", text, from: "ja", to: "vi" }, (res) => {
    if (chrome.runtime.lastError) { transEl.textContent = "Lỗi: " + chrome.runtime.lastError.message; return; }
    if (!res || !res.ok) { trangThai(transEl, "warning-circle", (res && res.error) || "Không dịch được."); return; }
    lastTranslated = text;
    transEl.className = "trbox";
    transEl.innerHTML = "";

    const goc = [res.text];
    const daCo = res.saved || null;
    const muc = { word: text, reading: res.reading || "", means: goc, kind: "sent" };
    theSuaDuoc(transEl, {
      dl: {
        means: (daCo && daCo.mEdit ? (daCo.means || goc) : goc),
        note: (daCo && daCo.note) || "",
        saved: !!(daCo && daCo.saved),
        mEdit: daCo && daCo.mEdit ? 1 : 0
      },
      // Bản dịch chính LÀ phần sửa được, nên phần đầu thẻ để trống — lúc đang
      // sửa thì ô soạn thảo thế chỗ nó luôn.
      dau: null,
      veNghia: (el, dl) => {
        const tr = document.createElement("div"); tr.className = "tr";
        tr.textContent = dl.means.join(" / ");
        el.appendChild(tr);
      },
      phu: (el) => {
        if (res.reading) {
          const rd = document.createElement("div"); rd.className = "furi";
          rd.appendChild(ic("speaker-high", { size: 15 }));
          const rs = document.createElement("span"); rs.textContent = res.reading;
          rd.appendChild(rs);
          el.appendChild(rd);
        }
        const src = document.createElement("div"); src.className = "src"; src.textContent = text;
        el.appendChild(src);
      },
      gui: (moi, coSua, xong) => guiLuu(muc, "javi", moi, coSua, goc, xong)
    });
  });
}


/**
 * Bôi đen phát nào cũng chạy CẢ BA: tra từ, đọc Hán tự, dịch cả câu.
 *
 * Bản cũ tự đoán ý bằng độ dài và dấu câu, và đoán sai suốt: danh từ ghép dài
 * vẫn là từ cần tra, câu ngắn cụt lủn vẫn là câu cần dịch. Nay chỉ còn đoán mỗi
 * việc *mở sẵn tab nào* — đoán sai chỗ đó thì chỉ mất một cú bấm.
 */
async function run(word) {
  const w = (word || "").trim();
  const dict = dirEl.value;
  lastTranslated = "";

  // Hán tự luôn có mặt, kể cả khi đang xem tab Dịch.
  const chars = extractKanji(w);
  renderKanji(chars);
  // Cố ý KHÔNG khoá tab này khi đoạn không có chữ Hán: tab luôn ở đó, mở ra thì
  // nó tự nói "đoạn này không có chữ Hán nào". Tab lúc có lúc mất khó dùng hơn
  // nhiều so với một tab thỉnh thoảng trống.
  tabKanjiEl.querySelector(".lb").textContent = "Hán tự" + (chars.length ? " " + chars.length : "");

  if (!w) {
    trangThai(resEl, "magnifying-glass", "Bôi đen một từ rồi mở lại, hoặc gõ vào ô trên.");
    switchTab("word");
    return;
  }

  // Mở sẵn tab hợp lý nhất, nhưng cả ba tab đều có dữ liệu.
  switchTab(trongNhuCau(w) ? "trans" : "word");

  // Đoạn dài thì tra nguyên đoạn như một từ chắc chắn rỗng — bỏ qua lượt gọi
  // mạng đó, nhưng vẫn nói rõ vì sao tab Từ vựng trống.
  if (w.length > 40) {
    trangThai(resEl, "text-aa", "Đoạn này dài quá để tra như một từ — xem tab Dịch, hoặc gõ riêng từ cần tra.");
    return;
  }
  trangThai(resEl, "spinner-gap", "Đang tra “" + w + "”…");
  const entries = await lookup(w, dict);
  renderWord(entries);
}

/** Chỉ dùng để chọn tab mở sẵn, không dùng để quyết định tra cái gì. */
function trongNhuCau(w) {
  return w.length > 30 || /[。．！？\n]/.test(w);
}

// ---- Sự kiện ----
goEl.addEventListener("click", () => run(qEl.value));
qEl.addEventListener("keydown", (e) => { if (e.key === "Enter") run(qEl.value); });
dirEl.addEventListener("change", () => run(qEl.value));
tabWordEl.addEventListener("click", () => switchTab("word"));
tabKanjiEl.addEventListener("click", () => { if (!tabKanjiEl.disabled) switchTab("kanji"); });
tabTransEl.addEventListener("click", () => switchTab("trans"));
bookEl.addEventListener("click", () => { chrome.tabs.create({ url: chrome.runtime.getURL("notebook.html") }); });

/** Gắn icon vào khung tĩnh của HTML. */
function gaiIcon() {
  document.getElementById("brandMark").innerHTML = window.Icon("translate", { size: 17, weight: "solid" });
  document.getElementById("go").innerHTML =
    window.Icon("magnifying-glass", { size: 15 }) + '<span class="lb">Tra</span>';
  document.getElementById("book").innerHTML =
    window.Icon("notebook", { size: 17 }) + '<span class="lb">Mở sổ tay &amp; tiến độ</span>';
  const gan = (el, ten, chu) => {
    el.innerHTML = window.Icon(ten, { size: 15 }) + '<span class="lb">' + chu + "</span>";
  };
  gan(tabWordEl, "book-open-text", "Từ vựng");
  gan(tabKanjiEl, "text-aa", "Hán tự");
  gan(tabTransEl, "translate", "Dịch");
  qEl.parentElement.insertBefore(ic("magnifying-glass", { size: 18 }), qEl);
}

// ---- Khởi động ----
(async () => {
  gaiIcon();
  veChuoiNgay();
  const word = await getInitialWord();
  if (word) qEl.value = word;
  run(word);
  qEl.focus();
  qEl.select();
  if (IS_CTX_WINDOW) {
    window.focus();
    setTimeout(() => { window.addEventListener("blur", () => window.close()); }, 500);
  }
})();
