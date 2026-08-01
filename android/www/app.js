/* Tra Mazii — bản Android (Capacitor). Dùng chung dữ liệu & cơ chế đồng bộ với extension máy tính. */
"use strict";

// ================= Capacitor bridges (có fallback để chạy thử trên trình duyệt) =================
const Cap = window.Capacitor || null;
const Plugins = (Cap && Cap.Plugins) || {};

const Store = {
  async get(key) {
    if (Plugins.Preferences) {
      const r = await Plugins.Preferences.get({ key });
      return r.value ? JSON.parse(r.value) : null;
    }
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  },
  async set(key, obj) {
    const value = JSON.stringify(obj);
    if (Plugins.Preferences) return Plugins.Preferences.set({ key, value });
    localStorage.setItem(key, value);
  },
  async remove(key) {
    if (Plugins.Preferences) return Plugins.Preferences.remove({ key });
    localStorage.removeItem(key);
  }
};

function getNativeHttp() {
  // Capacitor 6 có thể để CapacitorHttp ở nhiều chỗ tuỳ cách nạp
  return (window.CapacitorHttp) || (Plugins && Plugins.CapacitorHttp) || (Cap && Cap.CapacitorHttp) || null;
}

async function httpPostJson(url, bodyObj, contentType) {
  const ct = contentType || "application/json";
  const native = getNativeHttp();
  if (native && native.post) {
    const r = await native.post({
      url, headers: { "Content-Type": ct }, data: JSON.stringify(bodyObj)
    });
    if (r && typeof r.status === "number" && (r.status < 200 || r.status >= 300)) {
      throw new Error("HTTP " + r.status);
    }
    const d = r && r.data;
    if (typeof d === "string") { try { return JSON.parse(d); } catch (e) { throw new Error("Máy chủ trả về dữ liệu không đọc được"); } }
    return d;
  }
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": ct }, body: JSON.stringify(bodyObj) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

async function httpGetJson(url) {
  const native = getNativeHttp();
  if (native && native.get) {
    const r = await native.get({ url, headers: {} });
    if (r && typeof r.status === "number" && (r.status < 200 || r.status >= 300)) throw new Error("HTTP " + r.status);
    const d = r && r.data;
    if (typeof d === "string") { try { return JSON.parse(d); } catch (e) { throw new Error("Dữ liệu không đọc được"); } }
    return d;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

// Gọi thẳng Google Dịch (nhanh, không cần Apps Script).
async function gtxTranslate(text, f, t) {
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t"
    + "&sl=" + encodeURIComponent(f || "ja") + "&tl=" + encodeURIComponent(t || "vi")
    + "&q=" + encodeURIComponent(text);
  const data = await httpGetJson(url);
  const segs = (data && data[0]) || [];
  const out = segs.map((s) => (s && s[0]) || "").join("").trim();
  if (!out) throw new Error("gtx rỗng");
  return out;
}

async function speakJa(text) {
  try {
    if (Plugins.TextToSpeech) {
      await Plugins.TextToSpeech.speak({ text, lang: "ja-JP", rate: 0.9 });
      return;
    }
  } catch (e) { /* thử fallback */ }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP"; u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch (e) { /* máy không có giọng Nhật */ }
}

// ================= Dữ liệu sổ tay (cùng cấu trúc extension) =================
async function getNB() { return (await Store.get("notebook")) || {}; }
async function setNB(nb) { await Store.set("notebook", nb); }
async function getDecks() { return (await Store.get("decks")) || {}; }
async function setDecks(d) { await Store.set("decks", d); }

function mergeByTs(a, b) {
  const out = {};
  [a || {}, b || {}].forEach((src) => {
    for (const k in src) { const e = src[k]; if (!out[k] || (e.ts || 0) > (out[k].ts || 0)) out[k] = e; }
  });
  return out;
}

// ================= Hán Việt / Kanji =================
function isCJK(ch) {
  const c = ch.codePointAt(0);
  return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0xf900 && c <= 0xfaff);
}
function extractKanji(str) {
  const seen = new Set(), out = [];
  for (const ch of (str || "")) if (isCJK(ch) && !seen.has(ch)) { seen.add(ch); out.push(ch); }
  return out;
}
function hanVietOf(word) {
  const DB = window.KANJI || {};
  const parts = [];
  let has = false;
  for (const ch of (word || "")) {
    if (!isCJK(ch)) continue;
    has = true;
    const d = DB[ch];
    parts.push(d && d.hv ? d.hv.split(/\s*,\s*/)[0] : "?");
  }
  if (!has) return "";
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

// ================= SRS (giống hệt extension) =================
const SRS_STEPS = [1, 3, 7, 14, 30, 60, 120];
const DAY = 86400000;
function isDue(it, now) {
  if (it.del) return false;
  if (!it.srs || !it.srs.due) return true;
  return it.srs.due <= now;
}
async function gradeWord(key, remembered) {
  const nb = await getNB();
  const e = nb[key]; if (!e) return;
  const now = Date.now();
  const cur = (e.srs && typeof e.srs.lv === "number") ? e.srs.lv : -1;
  let lv, due;
  if (remembered) { lv = Math.min(cur + 1, SRS_STEPS.length - 1); due = now + SRS_STEPS[lv] * DAY; }
  else { lv = -1; due = now; }
  nb[key] = Object.assign({}, e, { srs: { lv, due }, ts: now });
  await setNB(nb);
}
function dueCountOn(list, dayOffset) {
  // số từ đến hạn tính đến cuối ngày thứ dayOffset (0 = hôm nay)
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const t = end.getTime() + dayOffset * DAY;
  return list.filter((it) => !it.del && (!it.srs || !it.srs.due || it.srs.due <= t)).length;
}

// ================= Tra từ (API Mazii — như extension) =================
let lastLookupError = "";
async function lookup(word, dict) {
  const payload = { dict, type: "word", query: word, limit: 20, page: 1 };
  lastLookupError = "";
  for (const url of ["https://mazii.net/api/search", "https://mazii.net/api/search/"]) {
    try {
      const data = await httpPostJson(url, payload, "application/json");
      let arr = (data && (data.results || data.data)) || [];
      if (!Array.isArray(arr)) arr = [];
      const entries = arr.map((e) => ({
        word: e.word || e.title || e.text || e.query || "",
        reading: e.phonetic || e.pronounce || e.hiragana || "",
        means: normMeans(e)
      })).filter((x) => x.word || x.means.length);
      if (entries.length) return entries;
      lastLookupError = "Máy chủ trả về danh sách rỗng";
    } catch (e) { lastLookupError = (e && e.message) || String(e); }
  }
  return [];
}
function normMeans(e) {
  if (Array.isArray(e.means)) return e.means.map((m) => (typeof m === "string" ? m : (m.mean || m.means || m.text || ""))).filter(Boolean);
  if (typeof e.mean === "string") return [e.mean];
  if (typeof e.short_mean === "string") return [e.short_mean];
  return [];
}

// ================= Đồng bộ Drive (Apps Script — cùng payload với extension) =================
let syncing = null;      // không cho hai lượt đồng bộ chạy chồng nhau
function syncNow() {
  if (syncing) return syncing;
  syncing = doSync().finally(() => { syncing = null; });
  return syncing;
}

async function doSync() {
  const cfg = (await Store.get("syncCfg")) || {};
  if (!cfg.url) throw new Error("Chưa cấu hình URL đồng bộ");
  const load = await httpPostJson(cfg.url, { token: cfg.token || "", action: "load" }, "text/plain;charset=utf-8");
  if (!load || load.ok === false) throw new Error((load && load.error) || "Lỗi máy chủ");
  const data = load.data || {};
  let remoteNb, remoteDecks;
  if (data && typeof data === "object" && data.notebook !== undefined) { remoteNb = data.notebook || {}; remoteDecks = data.decks || {}; }
  else { remoteNb = data || {}; remoteDecks = {}; }
  const mergedNb = mergeByTs(await getNB(), remoteNb);
  const mergedDecks = mergeByTs(await getDecks(), remoteDecks);
  const save = await httpPostJson(cfg.url, { token: cfg.token || "", action: "save", data: { notebook: mergedNb, decks: mergedDecks } }, "text/plain;charset=utf-8");
  if (!save || save.ok === false) throw new Error((save && save.error) || "Lỗi khi lưu");

  // Đọc lại NGAY TRƯỚC KHI GHI để không xoá mất thay đổi vừa làm trong lúc chờ mạng
  const finalNb = mergeByTs(await getNB(), mergedNb);
  const finalDecks = mergeByTs(await getDecks(), mergedDecks);
  await setNB(finalNb); await setDecks(finalDecks);
  if (JSON.stringify(finalNb) !== JSON.stringify(mergedNb)) syncSoon();

  let n = 0; for (const k in finalNb) if (!finalNb[k].del) n++;
  return n;
}
let syncTimer = null;
function syncSoon() { clearTimeout(syncTimer); syncTimer = setTimeout(() => { syncNow().then(refreshNotifications).catch(() => {}); }, 2500); }

// ================= Thông báo nhắc học =================
async function refreshNotifications() {
  const LN = Plugins.LocalNotifications;
  if (!LN) return;
  const cfg = (await Store.get("notifCfg")) || {};
  if (!cfg.on) return;
  try {
    const perm = await LN.checkPermissions();
    if (perm.display !== "granted") { const r = await LN.requestPermissions(); if (r.display !== "granted") return; }
    // xoá lịch cũ (id 1..7)
    await LN.cancel({ notifications: [1,2,3,4,5,6,7].map((id) => ({ id })) });
    const nb = await getNB();
    const list = Object.values(nb);
    const [hh, mm] = (cfg.time || "20:00").split(":").map(Number);
    const notis = [];
    for (let d = 0; d < 7; d++) {
      const at = new Date(); at.setDate(at.getDate() + d); at.setHours(hh, mm, 0, 0);
      if (at.getTime() <= Date.now()) continue;
      const n = dueCountOn(list, d);
      if (n <= 0) continue;
      notis.push({
        id: d + 1,
        title: "Đến giờ ôn từ vựng 🎓",
        body: "Hôm nay có " + n + " từ đến hạn trong sóng học tập. Vào ôn " + (n <= 5 ? "vài phút là xong!" : "nhé!"),
        schedule: { at }
      });
    }
    if (notis.length) await LN.schedule({ notifications: notis });
  } catch (e) { /* bỏ qua */ }
}

// ================= UI chung =================
const $ = (id) => document.getElementById(id);
function show(view) {
  ["Lookup", "Notebook", "Study"].forEach((v) => {
    $("view" + v).classList.toggle("show", v === view);
    $("nav" + v).classList.toggle("active", v === view);
  });
  if (view === "Notebook") { drawNotebook(); pullAndRefresh(); }
  if (view === "Study") { updateDueButton(); pullAndRefresh(); }
}
$("navLookup").addEventListener("click", () => show("Lookup"));
$("navNotebook").addEventListener("click", () => show("Notebook"));
$("navStudy").addEventListener("click", () => show("Study"));

// ================= View: Tra từ =================
let lastEntries = [];
let currentSrc = null;   // nguồn (URL+tiêu đề+đoạn chọn) của lượt tra hiện tại, để lưu kèm khi bấm ＋Lưu
function switchSub(name) {
  if (name === true) name = "word";
  if (name === false) name = "kanji";
  ["word","kanji","trans"].forEach((n) => {
    const btn = { word: "tabWord", kanji: "tabKanji", trans: "tabTrans" }[n];
    const pane = { word: "result", kanji: "kanji", trans: "trans" }[n];
    $(btn).classList.toggle("active", n === name);
    $(pane).style.display = n === name ? "" : "none";
  });
  if (name === "trans") showTranslate(($("q").value || "").trim());
}
$("tabWord").addEventListener("click", () => switchSub("word"));
$("tabKanji").addEventListener("click", () => switchSub("kanji"));
$("tabTrans").addEventListener("click", () => switchSub("trans"));

async function runLookup(word, src) {
  currentSrc = (src && src.url) ? src : null;   // tra tay/dán -> không nguồn; chia sẻ -> có nguồn
  const w = (word || "").trim();
  if (!w) return;
  $("q").value = w;
  if (w.length > 30 || /[。．！？\n]/.test(w)) { switchSub("trans"); return; }   // là câu -> dịch cả câu
  const chars = extractKanji(w);
  $("tabKanji").textContent = "Hán tự" + (chars.length ? " (" + chars.length + ")" : "");
  renderKanji(chars);
  $("result").className = "state";
  $("result").textContent = "Đang tra “" + w + "”…";
  const entries = await lookup(w, $("dir").value);
  lastEntries = entries;
  await renderWord(entries);
}
$("go").addEventListener("click", () => runLookup($("q").value));
$("q").addEventListener("keydown", (e) => { if (e.key === "Enter") runLookup($("q").value); });
$("dir").addEventListener("change", () => runLookup($("q").value));
$("paste").addEventListener("click", async () => {
  try { const t = await navigator.clipboard.readText(); if (t && t.trim()) runLookup(t.trim()); } catch (e) { alert("Không đọc được bộ nhớ tạm. Hãy dán tay vào ô tra."); }
});

async function renderWord(entries) {
  const box = $("result");
  const nb = await getNB();
  const srcSnap = (currentSrc && currentSrc.url) ? currentSrc : null;   // giữ nguồn của lượt tra này
  box.className = ""; box.innerHTML = "";
  if (!entries.length) { box.className = "state"; box.innerHTML = ""; const p1 = document.createElement("div"); p1.textContent = "Không lấy được nghĩa."; box.appendChild(p1); if (lastLookupError) { const p2 = document.createElement("div"); p2.className = "hint"; p2.style.marginTop = "6px"; p2.textContent = "Chi tiết: " + lastLookupError; box.appendChild(p2); } const p3 = document.createElement("div"); p3.className = "hint"; p3.style.marginTop = "6px"; p3.textContent = getNativeHttp() ? "" : "(Đang dùng chế độ trình duyệt — bản APK sẽ gọi mạng kiểu native.)"; if (p3.textContent) box.appendChild(p3); return; }
  for (const en of entries) {
    const div = document.createElement("div"); div.className = "entry";
    const head = document.createElement("div"); head.className = "ehead";
    const left = document.createElement("div");
    const w = document.createElement("span"); w.className = "word"; w.textContent = en.word; left.appendChild(w);
    const spk = document.createElement("button"); spk.className = "spk"; spk.textContent = "🔊";
    spk.addEventListener("click", () => speakJa(en.word)); left.appendChild(spk);
    if (en.reading) { const r = document.createElement("span"); r.className = "read"; r.textContent = en.reading; left.appendChild(r); }
    head.appendChild(left);
    const btn = document.createElement("button"); btn.className = "save";
    const key = $("dir").value + ":" + en.word;
    if (nb[key] && !nb[key].del) { btn.textContent = "✓ Đã lưu"; btn.classList.add("saved"); }
    else {
      btn.textContent = "＋ Lưu";
      btn.addEventListener("click", async () => {
        const nb2 = await getNB();
        const old2 = nb2[key];
        const ne2 = { word: en.word, reading: en.reading || "", means: en.means || [], dict: $("dir").value, ts: Date.now() };
        if (srcSnap) ne2.src = srcSnap;
        if (old2 && !old2.del) { if (old2.deck) ne2.deck = old2.deck; if (old2.srs) ne2.srs = old2.srs; if (old2.kind) ne2.kind = old2.kind; if (old2.src && !ne2.src) ne2.src = old2.src; }
        nb2[key] = ne2;
        await setNB(nb2);
        btn.textContent = "✓ Đã lưu"; btn.classList.add("saved");
        syncSoon(); refreshNotifications();
      });
    }
    head.appendChild(btn);
    div.appendChild(head);
    if (en.means.length) {
      const ul = document.createElement("ul"); ul.className = "mean";
      en.means.slice(0, 6).forEach((m) => { const li = document.createElement("li"); li.textContent = m; ul.appendChild(li); });
      div.appendChild(ul);
    }
    box.appendChild(div);
  }
}

function renderKanji(chars) {
  const box = $("kanji");
  box.innerHTML = "";
  if (!chars.length) { box.className = "state"; box.textContent = "Từ này không có Hán tự."; return; }
  box.className = "";
  const DB = window.KANJI || {};
  for (const ch of chars) {
    const d = DB[ch];
    const row = document.createElement("div"); row.className = "kentry";
    const c = document.createElement("div"); c.className = "kchar"; c.textContent = ch; row.appendChild(c);
    const main = document.createElement("div");
    const hv = document.createElement("div"); hv.className = "khv"; hv.textContent = d && d.hv ? d.hv : "—"; main.appendChild(hv);
    if (d) {
      const bits = [];
      if (d.on) bits.push("On: " + d.on);
      if (d.kun) bits.push("Kun: " + d.kun);
      if (d.s) bits.push(d.s + " nét");
      if (d.jlpt) bits.push("N" + d.jlpt);
      if (d.rad) bits.push("Bộ: " + d.rad);
      if (bits.length) { const meta = document.createElement("div"); meta.className = "kmeta"; meta.textContent = bits.join(" · "); main.appendChild(meta); }
      if (d.m && d.m.length) {
        const ul = document.createElement("ul"); ul.className = "kmean";
        d.m.slice(0, 6).forEach((m) => { const li = document.createElement("li"); li.textContent = m; ul.appendChild(li); });
        main.appendChild(ul);
      }
    }
    row.appendChild(main);
    box.appendChild(row);
  }
}


// ================= Dịch câu (Google Dịch qua Apps Script) =================
async function translateText(text) {
  const t = (text || "").trim();
  if (!t) throw new Error("Chưa có nội dung");
  const cache = (await Store.get("trCache")) || {};
  const key = "ja>vi:" + t;
  const hit = cache[key];
  if (hit && Date.now() - (hit.ts || 0) < 30 * DAY) return hit.v;
  // 1) Nhanh: gọi thẳng Google Dịch.  2) Dự phòng: Apps Script (nếu (1) lỗi).
  let out = "";
  try { out = await gtxTranslate(t, "ja", "vi"); } catch (e) { out = ""; }
  if (!out) {
    const cfg = (await Store.get("syncCfg")) || {};
    if (!cfg.url) throw new Error("Không dịch được lúc này (và chưa cấu hình đồng bộ để dùng máy chủ dự phòng).");
    const r = await httpPostJson(cfg.url, { token: cfg.token || "", action: "translate", text: t, from: "ja", to: "vi" }, "text/plain;charset=utf-8");
    if (!r || r.ok === false || !r.text) throw new Error((r && r.error) || "Không dịch được");
    out = r.text;
  }
  cache[key] = { v: out, ts: Date.now() };
  const ks = Object.keys(cache);
  if (ks.length > 300) { ks.sort((a, b) => cache[a].ts - cache[b].ts); for (let i = 0; i < ks.length - 300; i++) delete cache[ks[i]]; }
  await Store.set("trCache", cache);
  return out;
}

async function showTranslate(text) {
  const box = $("trans");
  const srcSnap = (currentSrc && currentSrc.url) ? { url: currentSrc.url, title: currentSrc.title, sel: text } : null;
  box.className = "state"; box.textContent = "Đang dịch…";
  try {
    const out = await translateText(text);
    box.className = "trbox"; box.innerHTML = "";
    const hd = document.createElement("div"); hd.className = "hd";
    const tr = document.createElement("div"); tr.className = "tr"; tr.textContent = out;
    hd.appendChild(tr);
    const sv = document.createElement("button"); sv.className = "save"; sv.textContent = "＋ Lưu";
    const key = "javi:" + text;
    const nb0 = await getNB();
    if (nb0[key] && !nb0[key].del) { sv.textContent = "✓ Đã lưu"; sv.classList.add("saved"); }
    else sv.addEventListener("click", async () => {
      const nb = await getNB();
      const oldS = nb[key];
      const neS = { word: text, reading: "", means: [out], dict: "javi", kind: "sent", ts: Date.now() };
      if (srcSnap) neS.src = srcSnap;
      if (oldS && !oldS.del) { if (oldS.deck) neS.deck = oldS.deck; if (oldS.srs) neS.srs = oldS.srs; if (oldS.src && !neS.src) neS.src = oldS.src; }
      nb[key] = neS;
      await setNB(nb);
      sv.textContent = "✓ Đã lưu"; sv.classList.add("saved");
      syncSoon(); refreshNotifications();
    });
    hd.appendChild(sv);
    box.appendChild(hd);
    const src = document.createElement("div"); src.className = "src"; src.textContent = text;
    box.appendChild(src);
  } catch (e) {
    box.className = "state"; box.textContent = (e && e.message) || "Không dịch được.";
  }
}

// ================= View: Sổ tay =================
const ALL = "__all__", NONE = "__none__";
let curDeck = ALL;
function deckName(decks, id) { const d = decks[id]; return d && !d.del ? d.name : null; }

// Mở lại trang nguồn của từ/câu trong trình duyệt hệ thống; đính kèm Text Fragment
// (#:~:text=…) để Chrome tự cuộn tới và tô sáng đúng vị trí đã lưu.
function openSourceExt(it) {
  if (!it.src || !it.src.url) return;
  const base = it.src.url;
  const enc = encodeURIComponent((it.src.sel || it.word || "").slice(0, 60));
  const url = base.indexOf("#") >= 0 ? base + ":~:text=" + enc : base + "#:~:text=" + enc;
  try { window.open(url, "_system"); }
  catch (e) { try { window.open(url, "_blank"); } catch (e2) { location.href = url; } }
}

// Thêm/sửa/xoá link nguồn bằng tay (dán URL từ thanh địa chỉ trình duyệt).
// Dùng khi trình duyệt lúc chia sẻ không kèm link.
async function addLink(it) {
  const cur = (it.src && it.src.url) || "";
  let url = (prompt('Dán đường link trang nguồn cho “' + it.word + '”\n(để trống rồi OK = xoá link):', cur) || "").trim();
  if (url === cur) return;
  const nb = await getNB(); const e = nb[it.key]; if (!e || e.del) return;
  const ne = Object.assign({}, e, { ts: Date.now() });
  if (!url) {
    delete ne.src;
  } else {
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;   // tự thêm https:// nếu thiếu
    let title = "";
    try { title = new URL(url).hostname.replace(/^www\./, ""); } catch (e2) {}
    ne.src = { url: url, title: title, sel: (e.src && e.src.sel) || it.word };
  }
  nb[it.key] = ne;
  await setNB(nb);
  drawNotebook();
  syncSoon();
}

// Toast ngắn báo trạng thái (dùng khi chia sẻ không kèm link).
function toast(msg) {
  let t = document.getElementById("njToast");
  if (!t) { t = document.createElement("div"); t.id = "njToast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = "show";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = ""; }, 4000);
}

async function drawNotebook() {
  const nb = await getNB(), decks = await getDecks();
  const items = Object.entries(nb).map(([key, v]) => ({ key, ...v })).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const activeItems = items.filter((it) => !it.del);
  if (curDeck !== ALL && curDeck !== NONE && !deckName(decks, curDeck)) curDeck = ALL;

  // deck bar
  const bar = $("deckBar"); bar.innerHTML = "";
  const activeDecks = Object.values(decks).filter((d) => !d.del).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const countIn = (id) => id === ALL ? activeItems.length : id === NONE ? activeItems.filter((i) => !i.deck).length : activeItems.filter((i) => i.deck === id).length;
  const mk = (id, label) => {
    const b = document.createElement("button"); b.className = "chip" + (curDeck === id ? " active" : "");
    b.textContent = label + " (" + countIn(id) + ")";
    b.addEventListener("click", () => { curDeck = id; drawNotebook(); });
    bar.appendChild(b);
  };
  mk(ALL, "Tất cả"); mk(NONE, "Chưa phân loại");
  activeDecks.forEach((d) => mk(d.id, d.name));
  const add = document.createElement("button"); add.className = "chip add"; add.textContent = "＋ Sổ mới";
  add.addEventListener("click", async () => {
    const name = (prompt("Tên sổ con mới:") || "").trim(); if (!name) return;
    const d = await getDecks();
    const id = "d_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    d[id] = { id, name, ts: Date.now() };
    await setDecks(d); curDeck = id; drawNotebook(); syncSoon();
  });
  bar.appendChild(add);
  $("deckActions").style.display = (curDeck !== ALL && curDeck !== NONE) ? "" : "none";

  // list
  const kw = $("filter").value.trim().toLowerCase();
  let rows = activeItems;
  if (curDeck === NONE) rows = rows.filter((i) => !i.deck);
  else if (curDeck !== ALL) rows = rows.filter((i) => i.deck === curDeck);
  if (kw) rows = rows.filter((it) => (it.word + " " + (it.reading || "") + " " + (it.means || []).join(" ")).toLowerCase().includes(kw));
  $("nbCount").textContent = "Hiện: " + rows.length + " từ";

  const list = $("nbList"); list.innerHTML = "";
  if (!rows.length) {
    const d = document.createElement("div"); d.className = "state";
    d.textContent = activeItems.length ? "Không có từ trong mục này." : "Chưa có từ nào. Sang tab Tra từ và bấm ＋ Lưu.";
    list.appendChild(d); return;
  }
  const now = Date.now();
  for (const it of rows) {
    const row = document.createElement("div"); row.className = "nrow" + (it.kind === "sent" ? " sent" : "");
    const main = document.createElement("div"); main.className = "main";
    const head = document.createElement("div");
    const w = document.createElement("span"); w.className = "w"; w.textContent = it.word; head.appendChild(w);
    const spk = document.createElement("button"); spk.className = "spk"; spk.textContent = "🔊";
    spk.addEventListener("click", () => speakJa(it.word)); head.appendChild(spk);
    if (it.reading) { const r = document.createElement("span"); r.className = "r"; r.textContent = it.reading; head.appendChild(r); }
    if (isDue(it, now)) { const du = document.createElement("span"); du.className = "due"; du.textContent = "đến hạn"; head.appendChild(du); }
    main.appendChild(head);
    const hvS = hanVietOf(it.word);
    if (hvS) { const hv = document.createElement("div"); hv.className = "hv"; hv.textContent = "Hán Việt: " + hvS; main.appendChild(hv); }
    if (it.means && it.means.length) { const m = document.createElement("div"); m.className = "m"; m.textContent = it.means.slice(0, 4).join("; "); main.appendChild(m); }
    if (it.src && it.src.url) {
      const sEl = document.createElement("div"); sEl.className = "srcline";
      let hostn = it.src.url; try { hostn = new URL(it.src.url).hostname.replace(/^www\./, ""); } catch (e) {}
      sEl.textContent = "🔗 " + hostn; sEl.title = it.src.title || it.src.url;
      main.appendChild(sEl);
    }
    row.appendChild(main);

    const ctl = document.createElement("div"); ctl.className = "rowctl";
    const decksNow = await getDecks();
    const activeDks = Object.values(decksNow).filter((d) => !d.del).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const sel = document.createElement("select"); sel.className = "movesel";
    const o0 = document.createElement("option"); o0.value = NONE; o0.textContent = "Chưa phân loại"; sel.appendChild(o0);
    activeDks.forEach((d) => { const o = document.createElement("option"); o.value = d.id; o.textContent = d.name; sel.appendChild(o); });
    sel.value = it.deck && deckName(decksNow, it.deck) ? it.deck : NONE;
    sel.addEventListener("change", async () => {
      const nb2 = await getNB(); const e = nb2[it.key]; if (!e) return;
      const ne = Object.assign({}, e, { ts: Date.now() });
      if (sel.value === NONE) delete ne.deck; else ne.deck = sel.value;
      nb2[it.key] = ne; await setNB(nb2); drawNotebook(); syncSoon();
    });
    ctl.appendChild(sel);
    if (it.src && it.src.url) {
      const open = document.createElement("button"); open.className = "mini"; open.style.color = "var(--blue)"; open.textContent = "🔗 Nguồn";
      open.addEventListener("click", () => openSourceExt(it));
      ctl.appendChild(open);
      const edit = document.createElement("button"); edit.className = "mini"; edit.textContent = "✎"; edit.title = "Sửa hoặc xoá link nguồn";
      edit.addEventListener("click", () => addLink(it));
      ctl.appendChild(edit);
    } else {
      const add = document.createElement("button"); add.className = "mini"; add.style.color = "var(--blue)"; add.textContent = "🔗 Thêm link";
      add.addEventListener("click", () => addLink(it));
      ctl.appendChild(add);
    }
    const del = document.createElement("button"); del.className = "mini"; del.style.color = "var(--red)"; del.textContent = "Xoá";
    del.addEventListener("click", async () => {
      if (!confirm("Xoá “" + it.word + "”?")) return;
      const nb2 = await getNB();
      nb2[it.key] = { word: it.word, dict: it.dict, del: true, ts: Date.now() };
      await setNB(nb2); drawNotebook(); syncSoon(); refreshNotifications();
    });
    ctl.appendChild(del);
    row.appendChild(ctl);
    list.appendChild(row);
  }
}
$("filter").addEventListener("input", drawNotebook);
$("renameDeck").addEventListener("click", async () => {
  const decks = await getDecks(); const cur = deckName(decks, curDeck) || "";
  const name = (prompt("Đổi tên sổ:", cur) || "").trim(); if (!name || name === cur) return;
  decks[curDeck] = Object.assign({}, decks[curDeck], { name, ts: Date.now() });
  await setDecks(decks); drawNotebook(); syncSoon();
});
$("deleteDeck").addEventListener("click", async () => {
  const decks = await getDecks(); const nm = deckName(decks, curDeck);
  if (!confirm('Xoá sổ "' + nm + '"? Từ trong sổ sẽ về "Chưa phân loại".')) return;
  const nb = await getNB(); const now = Date.now();
  for (const k in nb) if (nb[k].deck === curDeck) { const e = Object.assign({}, nb[k], { ts: now }); delete e.deck; nb[k] = e; }
  decks[curDeck] = { id: curDeck, name: nm, del: true, ts: now };
  await setNB(nb); await setDecks(decks); curDeck = ALL; drawNotebook(); syncSoon();
});

// sync UI
$("saveCfg").addEventListener("click", async () => {
  await Store.set("syncCfg", { url: $("syncUrl").value.trim(), token: $("syncToken").value.trim() });
  $("syncStatus").textContent = "Đã lưu cấu hình.";
});
$("syncNow").addEventListener("click", async () => {
  $("syncStatus").textContent = "Đang đồng bộ…";
  try { const n = await syncNow(); $("syncStatus").textContent = "Đã đồng bộ • " + n + " từ • " + new Date().toLocaleTimeString("vi-VN"); drawNotebook(); refreshNotifications(); }
  catch (e) { $("syncStatus").textContent = "Lỗi: " + (e && e.message || e); }
});

// notif UI
$("notifOn").addEventListener("click", async () => {
  await Store.set("notifCfg", { on: true, time: $("notifTime").value || "20:00" });
  await refreshNotifications();
  $("notifStatus").textContent = "Đã bật nhắc lúc " + ($("notifTime").value || "20:00") + " hằng ngày (7 ngày tới đã lên lịch).";
});
$("notifOff").addEventListener("click", async () => {
  await Store.set("notifCfg", { on: false });
  if (Plugins.LocalNotifications) try { await Plugins.LocalNotifications.cancel({ notifications: [1,2,3,4,5,6,7].map((id) => ({ id })) }); } catch (e) {}
  $("notifStatus").textContent = "Đã tắt nhắc nhở.";
});

// ================= View: Học =================
let session = { queue: [], done: 0, again: 0 };
async function currentDue() {
  const nb = await getNB();
  const now = Date.now();
  return Object.entries(nb).map(([key, v]) => ({ key, ...v })).filter((it) => isDue(it, now));
}
async function updateDueButton() {
  const due = await currentDue();
  $("dueCount").textContent = due.length;
}
$("stStart").addEventListener("click", async () => {
  const due = await currentDue();
  if (!due.length) { alert("Không có từ nào đến hạn. Quay lại sau nhé!"); return; }
  session = { queue: due.sort(() => Math.random() - 0.5), done: 0, again: 0, deleted: 0 };
  lastDeleted = null; $("stUndo").style.display = "none"; $("stDelRow").style.display = "";
  $("stEmpty").style.display = "none"; $("stBody").style.display = "";
  showCard();
});
function showCard() {
  const it = session.queue[0];
  if (!it) { finishStudy(); return; }
  $("stProg").textContent = "Còn " + session.queue.length + " từ • đã xong " + session.done;
  $("stWord").textContent = it.word;
  const src = $("stSrc");
  if (src) {
    if (it.src && it.src.url) { src.style.display = ""; src.onclick = () => openSourceExt(it); }
    else { src.style.display = "none"; src.onclick = null; }
  }
  $("stRead").textContent = "";
  $("stMean").innerHTML = "";
  $("stReveal").style.display = "";
  $("stGrade").style.display = "none";
}

// ---- Xoá nhanh ngay trong buổi học ----
let lastDeleted = null;
async function deleteCurrentCard() {
  const it = session.queue[0];
  if (!it) return;
  const nb = await getNB();
  const original = nb[it.key];
  lastDeleted = original ? { key: it.key, entry: Object.assign({}, original) } : null;
  nb[it.key] = { word: it.word, dict: it.dict, del: true, ts: Date.now() };
  await setNB(nb);
  session.queue = session.queue.filter((x) => x.key !== it.key);
  session.deleted = (session.deleted || 0) + 1;
  $("stUndoWord").textContent = it.word;
  $("stUndo").style.display = "";
  syncSoon(); refreshNotifications();
  showCard();
}
async function undoDelete() {
  if (!lastDeleted) return;
  const nb = await getNB();
  nb[lastDeleted.key] = Object.assign({}, lastDeleted.entry, { ts: Date.now() });
  await setNB(nb);
  lastDeleted = null;
  $("stUndo").style.display = "none";
  updateDueButton(); syncSoon(); refreshNotifications();
}
$("stDel").addEventListener("click", deleteCurrentCard);
$("stUndoBtn").addEventListener("click", undoDelete);

$("stReveal").addEventListener("click", () => {
  const it = session.queue[0]; if (!it) return;
  const hvS = hanVietOf(it.word);
  $("stRead").textContent = (it.reading || "") + (hvS ? ((it.reading ? "　·　" : "") + "Hán Việt: " + hvS) : "");
  if (it.means && it.means.length) {
    const ul = document.createElement("ul");
    it.means.slice(0, 5).forEach((m) => { const li = document.createElement("li"); li.textContent = m; ul.appendChild(li); });
    $("stMean").innerHTML = ""; $("stMean").appendChild(ul);
  }
  $("stReveal").style.display = "none"; $("stGrade").style.display = "";
});
$("stSpk").addEventListener("click", () => { const it = session.queue[0]; if (it) speakJa(it.word); });
async function grade(remembered) {
  const it = session.queue.shift(); if (!it) return;
  await gradeWord(it.key, remembered);
  if (remembered) session.done++; else { session.again++; session.queue.push(Object.assign({}, it)); }
  syncSoon();
  showCard();
}
$("gKnow").addEventListener("click", () => grade(true));
$("gForgot").addEventListener("click", () => grade(false));
async function finishStudy() {
  $("stBody").style.display = "none";
  $("stEmpty").style.display = "";
  $("stEmpty").textContent = "🎉 Xong! Đã thuộc " + session.done + " từ"
    + (session.again ? " • học lại " + session.again + " lượt" : "")
    + (session.deleted ? " • đã xoá " + session.deleted + " từ" : "") + ".";
  $("stDelRow").style.display = "none";
  $("stProg").textContent = "";
  updateDueButton(); syncSoon(); refreshNotifications();
}


// Kéo dữ liệu mới từ Drive rồi làm tươi màn hình đang xem (nếu đã cấu hình đồng bộ)
let pulling = false;
async function pullAndRefresh() {
  if (pulling) return;
  const cfg = (await Store.get("syncCfg")) || {};
  if (!cfg.url) return;
  pulling = true;
  try {
    await syncNow();
    const cur = document.querySelector(".view.show");
    if (cur && cur.id === "viewNotebook") drawNotebook();
    if (cur && cur.id === "viewStudy") updateDueButton();
    refreshNotifications();
  } catch (e) { /* offline -> bỏ qua */ } finally { pulling = false; }
}

// ================= Nhận chữ từ menu bôi đen của Android =================
async function checkProcessText() {
  try {
    const data = await Store.get("processText");
    if (!data || !data.word) return;
    await Store.remove("processText");
    if (Date.now() - (data.ts || 0) > 30000) return;   // quá cũ -> bỏ
    show("Lookup");
    runLookup(data.word);
  } catch (e) { /* bỏ qua */ }
}
window.addEventListener("njdict-process-text", checkProcessText);

// ================= Nhận nội dung Chia sẻ (ACTION_SEND) — kèm link nếu app nguồn gửi =================
// Lấy đoạn tô sáng từ Text Fragment (#:~:text=…) khi app nguồn chỉ chia sẻ một đường link.
function textFragmentOf(url) {
  const i = (url || "").indexOf("#:~:text=");
  if (i < 0) return "";
  let frag = url.slice(i + 9).split("&")[0];
  const parts = frag.split(",");
  const core = parts.filter((p) => p && !p.endsWith("-") && !p.startsWith("-"));
  const pick = core[0] || parts[0] || "";
  try { return decodeURIComponent(pick).trim(); } catch (e) { return pick; }
}
// Tách chuỗi chia sẻ thành { url, sel, title }. Chrome có thể gửi "đoạn chọn + link",
// chỉ link (kèm #:~:text=), hoặc chỉ chữ (không link).
function parseShare(rawText, subject) {
  const text = (rawText || "").trim();
  const title = (subject || "").trim();
  const strip = (s) => (s || "")
    .replace(/[「」『』（）()【】〈〉《》“”‘’"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.,;:・\-–—]+|[.,;:・\-–—]+$/g, "")
    .trim();
  let url = "", sel = "";
  const m = text.match(/https?:\/\/[^\s]+/);
  if (m) {
    url = m[0].replace(/[)\].,;>」』”’"']+$/, "");
    const rest = strip(text.replace(m[0], ""));
    sel = rest || textFragmentOf(url);
  } else {
    sel = strip(text);
  }
  return { url, sel: sel.slice(0, 400), title };
}
async function checkShare() {
  try {
    const data = await Store.get("shareData");
    if (!data || !data.text) return;
    await Store.remove("shareData");
    if (Date.now() - (data.ts || 0) > 60000) return;   // quá cũ -> bỏ
    const p = parseShare(data.text, data.subject);
    if (!p.sel) return;                                 // không rút được từ/câu -> bỏ qua
    const src = p.url ? { url: p.url, title: p.title || "", sel: p.sel } : null;
    show("Lookup");
    runLookup(p.sel, src);
    if (!src) setTimeout(() => toast("Trình duyệt không gửi kèm link. Có thể bấm 🔗 Thêm link trong Sổ tay để dán tay."), 400);
  } catch (e) { /* bỏ qua */ }
}
window.addEventListener("njdict-share", checkShare);

document.addEventListener("visibilitychange", () => { if (!document.hidden) { checkProcessText(); checkShare(); pullAndRefresh(); } });

// ================= Khởi động =================
(async () => {
  const cfg = (await Store.get("syncCfg")) || {};
  if (cfg.url) { $("syncUrl").value = cfg.url; $("syncToken").value = cfg.token || ""; syncNow().then((n) => { $("syncStatus").textContent = "Đã đồng bộ • " + n + " từ"; drawNotebook(); refreshNotifications(); }).catch(() => {}); }
  const ncfg = (await Store.get("notifCfg")) || {};
  if (ncfg.time) $("notifTime").value = ncfg.time;
  updateDueButton();
  refreshNotifications();
  checkProcessText();
  checkShare();
})();
