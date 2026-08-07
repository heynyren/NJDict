importScripts("kanji-data.js");   // nạp dữ liệu Hán tự (self.KANJI) để tính âm Hán Việt ở nền

// ==== Cấu hình ====
const CACHE_MAX = 1000;              // số từ giữ trong bộ nhớ đệm
const CACHE_TTL = 30 * 86400000;     // 30 ngày

const DEFAULT_SETTINGS = { inline: true, requireCtrl: false, maxLen: 30 };

// ==== Menu chuột phải ====
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "tra-mazii-popup",
      title: 'Tra "%s" bằng NJDict',
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "luu-njdict",
      title: 'Lưu "%s" vào NJDict (kèm nguồn)',
      contexts: ["selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "tra-mazii-popup" && info.selectionText) {
    await openPopupWindow(info.selectionText, tab);
  } else if (info.menuItemId === "luu-njdict" && info.selectionText) {
    await handleContextSave(info, tab);
  }
});

// ==== Lưu từ menu chuột phải: dịch sang tiếng Việt + lưu kèm nguồn & ngữ cảnh ====
function grabSelCtx() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const text = (sel.toString() || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  let prefix = "", suffix = "";
  try {
    const r = sel.getRangeAt(0);
    const sc = r.startContainer, ec = r.endContainer;
    if (sc && sc.nodeType === 3) prefix = (sc.textContent || "").slice(0, r.startOffset).slice(-70);
    if (ec && ec.nodeType === 3) suffix = (ec.textContent || "").slice(r.endOffset).slice(0, 70);
  } catch (e) {}
  return { sel: text, prefix: prefix.replace(/\s+/g, " ").trim(), suffix: suffix.replace(/\s+/g, " ").trim() };
}

async function translateToVi(text) {
  // Ép sl=ja khi là tiếng Nhật -> phiên âm ra romaji Nhật đúng (auto có thể nhầm sang pinyin Trung).
  const sl = hasJapanese(text) ? "ja" : "auto";
  try { const g = await gtxTranslate(text, sl, "vi"); if (g && g.text) return { text: g.text, reading: g.reading || "" }; } catch (e) {}
  const { syncUrl, syncToken } = await chrome.storage.local.get(["syncUrl", "syncToken"]);
  if (syncUrl) {
    try {
      const r = await fetch(syncUrl, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ token: syncToken || "", action: "translate", text, from: sl === "ja" ? "ja" : "", to: "vi" })
      });
      const d = await r.json();
      if (d && d.text) return { text: d.text, reading: "" };
    } catch (e) {}
  }
  return { text: "", reading: "" };
}

function flashBadge(txt, color) {
  try {
    chrome.action.setBadgeText({ text: txt });
    chrome.action.setBadgeBackgroundColor({ color: color || "#1a9d5a" });
    setTimeout(() => { try { chrome.action.setBadgeText({ text: "" }); } catch (e) {} }, 1600);
  } catch (e) {}
}

async function handleContextSave(info, tab) {
  const rawSel = (info.selectionText || "").replace(/\s+/g, " ").trim();
  if (!rawSel) return;
  const url = (tab && tab.url) || "";
  const title = ((tab && tab.title) || "").slice(0, 200);
  const isPdf = /\.pdf(\?|#|$)/i.test(url);

  let ctx = { sel: rawSel, prefix: "", suffix: "" };
  if (!isPdf && tab && tab.id && /^https?:/i.test(url)) {
    try {
      const res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: grabSelCtx });
      const r = res && res[0] && res[0].result;
      if (r && r.sel) ctx = r;
    } catch (e) {}
  }

  const tr = await translateToVi(ctx.sel).catch(() => ({ text: "", reading: "" }));
  const vi = tr.text;
  const reading = hasJapanese(ctx.sel) ? (tr.reading || "") : "";   // furigana (romaji) khi là tiếng Nhật
  const src = { url, title, sel: ctx.sel.slice(0, 400) };
  if (ctx.prefix) src.prefix = ctx.prefix.slice(-80);
  if (ctx.suffix) src.suffix = ctx.suffix.slice(0, 80);
  if (isPdf) src.pdf = true;

  const entry = { word: ctx.sel.slice(0, 400), reading: reading, means: vi ? [vi] : [], kind: "sent", src };
  try {
    await saveWord(entry, "javi");
    scheduleSync();
    flashBadge("\u2713", "#1a9d5a");
  } catch (e) {
    flashBadge("!", "#d33");
  }
}

async function openPopupWindow(rawText, tab) {
  const word = rawText.trim();
  if (!word) return;
  const src = (tab && /^https?:/i.test(tab.url || ""))
    ? { url: tab.url, title: (tab.title || "").slice(0, 200), sel: word } : null;
  await chrome.storage.local.set({ pendingLookup: { word, ts: Date.now(), src } });
  const W = 430, H = 620;
  const opts = { url: chrome.runtime.getURL("popup.html?ctx=1"), type: "popup", width: W, height: H };
  try {
    if (tab && tab.windowId != null) {
      const win = await chrome.windows.get(tab.windowId);
      if (win && win.width) {
        opts.left = Math.max(0, (win.left || 0) + win.width - W - 24);
        opts.top = (win.top || 0) + 80;
      }
    }
  } catch (e) { /* để Chrome tự đặt */ }
  await chrome.windows.create(opts);
}

// ==== Tin nhắn ====
let syncTimer = null;
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === "LOOKUP") {
    handleLookup(msg.word, msg.dict || "javi")
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === "SAVE_WORD") {
    saveWord(msg.entry, msg.dict || "javi")
      .then(() => { scheduleSync(); sendResponse({ ok: true }); })
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === "TRANSLATE") {
    handleTranslate(msg.text, msg.from, msg.to)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === "SYNC_NOW") {
    syncNow().then((n) => sendResponse({ ok: true, count: n }))
             .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === "SYNC_SOON") { scheduleSync(); return; }
});

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncNow().catch(() => {}); }, 2500);
}

// ==== Âm Hán Việt (offline) ====
function isCJK(ch) {
  const c = ch.codePointAt(0);
  return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0xf900 && c <= 0xfaff);
}
function kanjiInfo(word) {
  const DB = self.KANJI || {};
  const seen = new Set(), out = [];
  for (const ch of (word || "")) {
    if (!isCJK(ch) || seen.has(ch)) continue;
    seen.add(ch);
    const d = DB[ch];
    out.push({ ch, hv: d && d.hv ? d.hv : "", m: d && d.m ? d.m.slice(0, 2) : [] });
  }
  return out;
}

// ==== Tra từ + bộ nhớ đệm ====
async function handleLookup(rawWord, dict) {
  const word = (rawWord || "").trim();
  if (!word) return { ok: false, error: "Chưa có từ" };
  const key = dict + ":" + word;

  const { cache } = await chrome.storage.local.get("cache");
  const c = cache || {};
  const hit = c[key];
  const now = Date.now();
  if (hit && (now - (hit.ts || 0) < CACHE_TTL)) {
    return { ok: true, word, dict, entries: hit.entries, kanji: kanjiInfo(word), saved: await savedKeys(hit.entries, dict), cached: true };
  }

  const entries = await fetchMazii(word, dict);
  if (entries.length) {
    c[key] = { entries, ts: now };
    trimCache(c);
    await chrome.storage.local.set({ cache: c });
  }
  return { ok: true, word, dict, entries, kanji: kanjiInfo(word), saved: await savedKeys(entries, dict) };
}

function trimCache(c) {
  const keys = Object.keys(c);
  if (keys.length <= CACHE_MAX) return;
  keys.sort((a, b) => (c[a].ts || 0) - (c[b].ts || 0));
  const drop = keys.length - CACHE_MAX;
  for (let i = 0; i < drop; i++) delete c[keys[i]];
}

async function savedKeys(entries, dict) {
  const { notebook } = await chrome.storage.local.get("notebook");
  const nb = notebook || {};
  const out = {};
  (entries || []).forEach((e) => {
    const k = dict + ":" + e.word;
    if (nb[k] && !nb[k].del) out[e.word] = true;
  });
  return out;
}

async function fetchMazii(word, dict) {
  const payload = { dict, type: "word", query: word, limit: 20, page: 1 };
  for (const url of ["https://mazii.net/api/search", "https://mazii.net/api/search/"]) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) continue;
      const data = await r.json();
      let arr = (data && (data.results || data.data)) || [];
      if (!Array.isArray(arr)) arr = [];
      const entries = arr.map((e) => ({
        word: e.word || e.title || e.text || e.query || "",
        reading: e.phonetic || e.pronounce || e.hiragana || "",
        means: normMeans(e)
      })).filter((x) => x.word || x.means.length);
      if (entries.length) return entries;
    } catch (e) { /* thử endpoint sau */ }
  }
  return [];
}
function normMeans(e) {
  if (Array.isArray(e.means)) return e.means.map((m) => (typeof m === "string" ? m : (m.mean || m.means || m.text || ""))).filter(Boolean);
  if (typeof e.mean === "string") return [e.mean];
  if (typeof e.short_mean === "string") return [e.short_mean];
  return [];
}

// ==== Lưu từ vào sổ tay ====
async function saveWord(entry, dict) {
  if (!entry || !entry.word) throw new Error("Thiếu dữ liệu từ");
  const { notebook } = await chrome.storage.local.get("notebook");
  const nb = notebook || {};
  const key = dict + ":" + entry.word;
  const old = nb[key];
  const e = {
    word: entry.word, reading: entry.reading || "", means: entry.means || [], dict, ts: Date.now()
  };
  if (entry.kind) e.kind = entry.kind;                       // "sent" = câu đã dịch
  if (entry.src && entry.src.url) e.src = entry.src;         // nguồn: {url, title, sel}
  if (old && !old.del) {                                     // lưu lại từ đã có -> GIỮ phân loại & tiến độ học
    if (old.deck) e.deck = old.deck;
    if (old.srs) e.srs = old.srs;
    if (old.kind && !e.kind) e.kind = old.kind;
    if (old.src && !e.src) e.src = old.src;                  // giữ nguồn cũ nếu lần lưu này không kèm nguồn
  }
  nb[key] = e;
  await chrome.storage.local.set({ notebook: nb });
}


// ==== Dịch câu: gọi thẳng Google Dịch (nhanh), Apps Script làm dự phòng ====
const TR_MAX = 300;                 // số bản dịch giữ trong bộ đệm
const TR_TTL = 30 * 86400000;

// Endpoint Google Dịch công khai — không cần Apps Script nên nhanh hơn hẳn.
async function gtxTranslate(text, f, t) {
  // dt=t: bản dịch; dt=rm: phiên âm (romaji) của nguồn tiếng Nhật.
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&dt=rm"
    + "&sl=" + encodeURIComponent(f || "ja") + "&tl=" + encodeURIComponent(t || "vi")
    + "&q=" + encodeURIComponent(text);
  const r = await fetch(url);
  if (!r.ok) throw new Error("gtx HTTP " + r.status);
  const data = await r.json();
  const segs = (data && data[0]) || [];
  const out = segs.map((s) => (s && s[0]) || "").join("").trim();
  // Google để phiên âm nguồn ở phần tử [3] của đoạn cuối (chỗ [0] rỗng).
  let reading = "";
  for (const s of segs) { if (s && s[0] == null && typeof s[3] === "string") reading += s[3]; }
  reading = reading.replace(/\s+/g, " ").trim();
  if (!out) throw new Error("gtx rỗng");
  return { text: out, reading: reading };
}
// Có phải văn bản tiếng Nhật không (hiragana/katakana/kanji)?
function hasJapanese(s) { return /[぀-ヿ㐀-鿿ｦ-ﾟ]/.test(s || ""); }

async function handleTranslate(rawText, from, to) {
  const text = (rawText || "").trim();
  if (!text) return { ok: false, error: "Chưa có nội dung" };
  const f = from || "ja", t = to || "vi";
  const key = f + ">" + t + ":" + text;

  const { trCache } = await chrome.storage.local.get("trCache");
  const c = trCache || {};
  const hit = c[key];
  const now = Date.now();
  if (hit && (now - (hit.ts || 0) < TR_TTL)) return { ok: true, text: hit.v, reading: hit.rd || "", cached: true };

  // 1) Nhanh: gọi thẳng Google Dịch.  2) Dự phòng: Apps Script (nếu (1) lỗi/không có mạng thẳng).
  let out = "", reading = "";
  try { const g = await gtxTranslate(text, f, t); out = g.text; reading = g.reading; } catch (e) { out = ""; }
  if (!out) {
    const { syncUrl, syncToken } = await chrome.storage.local.get(["syncUrl", "syncToken"]);
    if (!syncUrl) return { ok: false, error: "Không dịch được lúc này (và chưa cấu hình đồng bộ để dùng máy chủ dự phòng)." };
    const r = await fetch(syncUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: syncToken || "", action: "translate", text, from: f, to: t })
    });
    const data = await r.json();
    if (!data || data.ok === false) throw new Error((data && data.error) || "Máy chủ dịch báo lỗi");
    if (!data.text) throw new Error("Không nhận được bản dịch");
    out = data.text;
  }

  // Chỉ giữ phiên âm khi NGUỒN là tiếng Nhật (dịch Việt→Nhật thì không cần).
  if (reading && !hasJapanese(text)) reading = "";
  c[key] = { v: out, rd: reading, ts: now };
  const keys = Object.keys(c);
  if (keys.length > TR_MAX) {
    keys.sort((a, b) => (c[a].ts || 0) - (c[b].ts || 0));
    for (let i = 0; i < keys.length - TR_MAX; i++) delete c[keys[i]];
  }
  await chrome.storage.local.set({ trCache: c });
  return { ok: true, text: out, reading: reading };
}

// ==== Đồng bộ Google Drive qua Apps Script ====
async function driveRequest(body) {
  const { syncUrl, syncToken } = await chrome.storage.local.get(["syncUrl", "syncToken"]);
  if (!syncUrl) throw new Error("Chưa cấu hình URL đồng bộ");
  const r = await fetch(syncUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ token: syncToken || "" }, body))
  });
  const data = await r.json();
  if (!data || data.ok === false) throw new Error((data && data.error) || "Lỗi máy chủ đồng bộ");
  return data;
}

function mergeByTs(a, b) {
  const out = {};
  [a || {}, b || {}].forEach((src) => {
    for (const k in src) { const e = src[k]; if (!out[k] || (e.ts || 0) > (out[k].ts || 0)) out[k] = e; }
  });
  return out;
}
function countActive(nb) { let n = 0; for (const k in nb) if (!nb[k].del) n++; return n; }

let syncing = null;      // lượt đồng bộ đang chạy (không cho chạy chồng nhau)

function syncNow() {
  if (syncing) return syncing;                 // đang chạy -> dùng chung kết quả
  syncing = doSync().finally(() => { syncing = null; });
  return syncing;
}

async function doSync() {
  const resp = await driveRequest({ action: "load" });
  const data = (resp && resp.data) || {};
  let remoteNb, remoteDecks;
  if (data && typeof data === "object" && data.notebook !== undefined) { remoteNb = data.notebook || {}; remoteDecks = data.decks || {}; }
  else { remoteNb = data || {}; remoteDecks = {}; }

  const store = await chrome.storage.local.get(["notebook", "decks"]);
  const mergedNb = mergeByTs(store.notebook || {}, remoteNb);
  const mergedDecks = mergeByTs(store.decks || {}, remoteDecks);

  await driveRequest({ action: "save", data: { notebook: mergedNb, decks: mergedDecks } });

  // Đọc lại dữ liệu máy NGAY TRƯỚC KHI GHI: người dùng có thể vừa sửa
  // (phân loại sổ, xoá, chấm điểm...) trong lúc chờ mạng -> phải giữ các thay đổi đó.
  const fresh = await chrome.storage.local.get(["notebook", "decks"]);
  const finalNb = mergeByTs(fresh.notebook || {}, mergedNb);
  const finalDecks = mergeByTs(fresh.decks || {}, mergedDecks);
  await chrome.storage.local.set({ notebook: finalNb, decks: finalDecks });

  // Có thay đổi mới phát sinh -> đẩy nốt lên Drive ở lượt sau
  if (JSON.stringify(finalNb) !== JSON.stringify(mergedNb) ||
      JSON.stringify(finalDecks) !== JSON.stringify(mergedDecks)) {
    scheduleSync();
  }
  return countActive(finalNb);
}
