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
async function saveEntry(dict, en) {
  const nb = await getNotebook();
  const key = dict + ":" + en.word;
  const old = nb[key];
  const e = { word: en.word, reading: en.reading || "", means: en.means || [], dict: dict, ts: Date.now() };
  if (initialSrc && initialSrc.url) e.src = initialSrc;              // nguồn từ trang đang mở
  else if (old && !old.del && old.src) e.src = old.src;             // giữ nguồn cũ nếu có
  nb[key] = e;
  await chrome.storage.local.set({ notebook: nb });
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
  for (const en of entries) {
    const box = document.createElement("div");
    box.className = "entry";
    const head = document.createElement("div");
    head.className = "rowx between";
    head.style.alignItems = "flex-start";
    const left = document.createElement("div");
    const w = document.createElement("span");
    w.className = "ja"; w.style.cssText = "font-size:21px;font-weight:750;letter-spacing:-.01em";
    w.textContent = en.word;
    left.appendChild(w);
    const spk = document.createElement("button");
    spk.className = "iconbtn"; spk.type = "button"; spk.title = "Phát âm";
    spk.appendChild(ic("speaker-high", { size: 17 }));
    spk.addEventListener("click", () => speakJa(en.word));
    left.appendChild(spk);
    if (en.reading) {
      const r = document.createElement("span");
      r.style.cssText = "color:var(--accent);font-size:13.5px;font-weight:600;margin-left:6px";
      r.textContent = en.reading;
      left.appendChild(r);
    }
    head.appendChild(left);

    const btn = document.createElement("button");
    btn.className = "btn xs save";
    btn.type = "button";
    const danhDauDaLuu = () => {
      btn.classList.add("saved");
      btn.innerHTML = window.Icon("check", { size: 15 }) + '<span class="lb">Đã lưu</span>';
    };
    const key = dirEl.value + ":" + en.word;
    if (nb[key] && !nb[key].del) danhDauDaLuu();
    else {
      btn.innerHTML = window.Icon("plus", { size: 15 }) + '<span class="lb">Lưu</span>';
      btn.addEventListener("click", async () => {
        await saveEntry(dirEl.value, en);
        danhDauDaLuu();
        try { chrome.runtime.sendMessage({ type: "SYNC_SOON" }); } catch (e) { /* bỏ qua */ }
      });
    }
    head.appendChild(btn);
    box.appendChild(head);

    if (en.means.length) {
      const ul = document.createElement("ul");
      ul.className = "m";
      en.means.slice(0, 6).forEach((m) => { const li = document.createElement("li"); li.textContent = m; ul.appendChild(li); });
      box.appendChild(ul);
    }
    resEl.appendChild(box);
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

    const head = document.createElement("div");
    head.className = "khead";
    const left = document.createElement("div");
    const hv = document.createElement("div");
    hv.className = "khv";
    hv.textContent = k.hv || "—";
    left.appendChild(hv);
    const meta = window.HanTu.META(k);
    if (meta) {
      const m = document.createElement("div");
      m.className = "kmeta"; m.textContent = meta;
      left.appendChild(m);
    }
    head.appendChild(left);

    const btn = document.createElement("button");
    btn.className = "btn xs save"; btn.type = "button";
    const danhDau = () => {
      btn.classList.add("saved");
      btn.innerHTML = window.Icon("check", { size: 15 }) + '<span class="lb">Đã lưu</span>';
    };
    const key = window.HanTu.KHOA(k.ch);
    if (nb[key] && !nb[key].del) danhDau();
    else {
      btn.innerHTML = window.Icon("plus", { size: 15 }) + '<span class="lb">Lưu</span>';
      btn.addEventListener("click", () => {
        chrome.runtime.sendMessage(
          { type: "SAVE_WORD", entry: window.HanTu.MUC(k), dict: window.HanTu.HUONG },
          () => { danhDau(); try { chrome.runtime.sendMessage({ type: "SYNC_SOON" }); } catch (e) {} }
        );
      });
    }
    head.appendChild(btn);
    body.appendChild(head);

    const ngh = window.HanTu.MUC(k).means;
    if (ngh.length) {
      const ul = document.createElement("ul");
      ul.className = "kmean";
      ngh.slice(0, 6).forEach((m) => { const li = document.createElement("li"); li.textContent = m; ul.appendChild(li); });
      body.appendChild(ul);
    } else {
      const m = document.createElement("div");
      m.className = "kmeta"; m.textContent = "Chưa có nghĩa cho chữ này — lưu lại rồi tự viết vào Sổ tay.";
      body.appendChild(m);
    }
    row.appendChild(body);
    kanjiEl.appendChild(row);
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
    const hd = document.createElement("div"); hd.className = "rowx between";
    hd.style.alignItems = "flex-start"; hd.style.gap = "10px";
    const tr = document.createElement("div"); tr.className = "tr"; tr.textContent = res.text;
    hd.appendChild(tr);
    const sv = document.createElement("button"); sv.className = "btn xs save"; sv.type = "button";
    sv.innerHTML = window.Icon("plus", { size: 15 }) + '<span class="lb">Lưu</span>';
    sv.title = "Lưu bản dịch vào sổ tay — sau đó có thể sửa lại cho đúng chuyên ngành";
    sv.addEventListener("click", () => {
      const entry = { word: text, reading: res.reading || "", means: [res.text], kind: "sent" };
      if (initialSrc && initialSrc.url) entry.src = { url: initialSrc.url, title: initialSrc.title, sel: text };
      chrome.runtime.sendMessage({ type: "SAVE_WORD", entry: entry, dict: "javi" }, () => {
        sv.classList.add("saved");
        sv.innerHTML = window.Icon("check", { size: 15 }) + '<span class="lb">Đã lưu</span>';
      });
    });
    hd.appendChild(sv);
    transEl.appendChild(hd);
    if (res.reading) {
      const rd = document.createElement("div"); rd.className = "furi";
      rd.appendChild(ic("speaker-high", { size: 15 }));
      const rs = document.createElement("span"); rs.textContent = res.reading;
      rd.appendChild(rs);
      transEl.appendChild(rd);
    }
    const src = document.createElement("div"); src.className = "src"; src.textContent = text;
    transEl.appendChild(src);
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
