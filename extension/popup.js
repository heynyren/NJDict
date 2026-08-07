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
    resEl.className = "state";
    resEl.textContent = "Không lấy được nghĩa. Kiểm tra mạng rồi thử lại.";
    return;
  }
  for (const en of entries) {
    const box = document.createElement("div");
    box.className = "entry";
    const head = document.createElement("div");
    head.className = "ehead";
    const left = document.createElement("div");
    const w = document.createElement("span");
    w.className = "word"; w.textContent = en.word;
    left.appendChild(w);
    const spk = document.createElement("button");
    spk.className = "spk"; spk.textContent = "🔊"; spk.title = "Phát âm";
    spk.addEventListener("click", () => speakJa(en.word));
    left.appendChild(spk);
    if (en.reading) {
      const r = document.createElement("span");
      r.className = "read"; r.textContent = en.reading;
      left.appendChild(r);
    }
    head.appendChild(left);

    const btn = document.createElement("button");
    btn.className = "save";
    const key = dirEl.value + ":" + en.word;
    if (nb[key]) { btn.textContent = "✓ Đã lưu"; btn.classList.add("saved"); }
    else {
      btn.textContent = "＋ Lưu";
      btn.addEventListener("click", async () => {
        await saveEntry(dirEl.value, en);
        btn.textContent = "✓ Đã lưu"; btn.classList.add("saved");
        try { chrome.runtime.sendMessage({ type: "SYNC_SOON" }); } catch (e) { /* bỏ qua */ }
      });
    }
    head.appendChild(btn);
    box.appendChild(head);

    if (en.means.length) {
      const ul = document.createElement("ul");
      ul.className = "mean";
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

function renderKanji(chars) {
  kanjiEl.innerHTML = "";
  if (!chars.length) {
    kanjiEl.className = "state";
    kanjiEl.textContent = "Từ này không có Hán tự.";
    return;
  }
  kanjiEl.className = "";
  const DB = window.KANJI || {};
  for (const ch of chars) {
    const d = DB[ch];
    const row = document.createElement("div");
    row.className = "kentry";

    const cEl = document.createElement("div");
    cEl.className = "kchar"; cEl.textContent = ch;
    row.appendChild(cEl);

    const main = document.createElement("div");
    main.className = "kmain";

    const hv = document.createElement("div");
    hv.className = "khv";
    hv.textContent = d && d.hv ? d.hv : "—";
    main.appendChild(hv);

    if (d) {
      const bits = [];
      if (d.on) bits.push("On: " + d.on);
      if (d.kun) bits.push("Kun: " + d.kun);
      if (d.s) bits.push(d.s + " nét");
      if (d.jlpt) bits.push("N" + d.jlpt);
      if (d.rad) bits.push("Bộ: " + d.rad);
      if (bits.length) {
        const meta = document.createElement("div");
        meta.className = "kmeta"; meta.textContent = bits.join(" · ");
        main.appendChild(meta);
      }
      if (d.m && d.m.length) {
        const ul = document.createElement("ul");
        ul.className = "kmean";
        d.m.slice(0, 6).forEach((m) => { const li = document.createElement("li"); li.textContent = m; ul.appendChild(li); });
        main.appendChild(ul);
      }
    } else {
      const meta = document.createElement("div");
      meta.className = "kmeta"; meta.textContent = "Không có dữ liệu Hán Việt cho chữ này.";
      main.appendChild(meta);
    }
    row.appendChild(main);
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
  if (!text) { transEl.className = "state"; transEl.textContent = "Nhập hoặc dán đoạn cần dịch."; return; }
  if (lastTranslated === text && transEl.querySelector(".tr")) return;   // đã dịch rồi
  transEl.className = "state"; transEl.textContent = "Đang dịch…";
  chrome.runtime.sendMessage({ type: "TRANSLATE", text, from: "ja", to: "vi" }, (res) => {
    if (chrome.runtime.lastError) { transEl.textContent = "Lỗi: " + chrome.runtime.lastError.message; return; }
    if (!res || !res.ok) { transEl.className = "state"; transEl.textContent = (res && res.error) || "Không dịch được."; return; }
    lastTranslated = text;
    transEl.className = "trbox";
    transEl.innerHTML = "";
    const hd = document.createElement("div"); hd.className = "hd";
    const tr = document.createElement("div"); tr.className = "tr"; tr.textContent = res.text;
    hd.appendChild(tr);
    const sv = document.createElement("button"); sv.className = "save"; sv.textContent = "＋ Lưu";
    sv.addEventListener("click", () => {
      const entry = { word: text, reading: res.reading || "", means: [res.text], kind: "sent" };
      if (initialSrc && initialSrc.url) entry.src = { url: initialSrc.url, title: initialSrc.title, sel: text };
      chrome.runtime.sendMessage({ type: "SAVE_WORD", entry: entry, dict: "javi" }, () => {
        sv.textContent = "✓ Đã lưu"; sv.classList.add("saved");
      });
    });
    hd.appendChild(sv);
    transEl.appendChild(hd);
    if (res.reading) {
      const rd = document.createElement("div"); rd.className = "furi"; rd.textContent = "🗣 " + res.reading;
      transEl.appendChild(rd);
    }
    const src = document.createElement("div"); src.className = "src"; src.textContent = text;
    transEl.appendChild(src);
  });
}


async function run(word) {
  const w = (word || "").trim();
  const dict = dirEl.value;

  // Tab Hán tự
  lastTranslated = "";
  if (w.length > 30 || /[。．！？\n]/.test(w)) { switchTab("trans"); return; }   // là câu -> dịch thẳng
  const chars = extractKanji(w);
  tabKanjiEl.textContent = "Hán tự" + (chars.length ? " (" + chars.length + ")" : "");
  tabKanjiEl.disabled = chars.length === 0;
  renderKanji(chars);
  if (!chars.length) switchTab("word");

  if (!w) {
    resEl.className = "state";
    resEl.textContent = "Bôi đen một từ rồi mở lại, hoặc gõ vào ô trên.";
    return;
  }
  resEl.className = "state";
  resEl.textContent = "Đang tra “" + w + "”…";
  const entries = await lookup(w, dict);
  renderWord(entries);
}

// ---- Sự kiện ----
goEl.addEventListener("click", () => run(qEl.value));
qEl.addEventListener("keydown", (e) => { if (e.key === "Enter") run(qEl.value); });
dirEl.addEventListener("change", () => run(qEl.value));
tabWordEl.addEventListener("click", () => switchTab("word"));
tabKanjiEl.addEventListener("click", () => { if (!tabKanjiEl.disabled) switchTab("kanji"); });
tabTransEl.addEventListener("click", () => switchTab("trans"));
bookEl.addEventListener("click", () => { chrome.tabs.create({ url: chrome.runtime.getURL("notebook.html") }); });

// ---- Khởi động ----
(async () => {
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
