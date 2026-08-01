/* Popup tra nhanh hiện ngay tại chỗ bôi đen (chỉ trên trang web thường).
   Bấm chuột ra ngoài là tắt. Tắt tuỳ chọn trong trang Sổ tay -> ⚙ Cài đặt. */
(() => {
  const DEFAULTS = { inline: true, requireCtrl: false, maxLen: 30, translate: true, maxSent: 400 };
  let S = Object.assign({}, DEFAULTS);
  let host = null, root = null, boxEl = null, lastCtrl = false;
  let anchor = { x: 0, y: 0 };

  chrome.storage.local.get("settings", (r) => { if (r && r.settings) S = Object.assign({}, DEFAULTS, r.settings); });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && ch.settings) S = Object.assign({}, DEFAULTS, ch.settings.newValue || {});
  });

  function close() {
    if (host) { host.remove(); host = null; root = null; boxEl = null; }
  }

  function ensureHost(x, y) {
    close();
    anchor = { x: x, y: y };
    host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;left:" + x + "px;top:" + y + "px;";
    root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .box { width: 330px; max-height: 340px; overflow-y: auto; background:#fff; color:#1c2430;
        font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
        border:1px solid #e6e9ef; border-radius:12px; box-shadow:0 8px 28px rgba(0,0,0,.22); padding:10px 12px; }
      .st { color:#6b7684; font-size:13px; padding:6px 2px; }
      .en { padding:7px 0; border-bottom:1px solid #eef1f5; }
      .en:last-child { border-bottom:none; }
      .hd { display:flex; justify-content:space-between; gap:8px; align-items:flex-start; }
      .w { font-size:19px; font-weight:700; }
      .rd { color:#6b7684; font-size:12.5px; margin-left:5px; }
      .spk { border:none; background:none; font-size:14px; cursor:pointer; padding:0 3px; }
      ul { margin:4px 0 0; padding-left:18px; font-size:13.5px; }
      li { margin:1px 0; }
      .sv { flex:none; border:1px solid #2f6fed; color:#2f6fed; background:#fff; border-radius:7px;
        font-size:12px; font-weight:700; padding:4px 8px; cursor:pointer; white-space:nowrap; }
      .sv.on { border-color:#1a9d5a; color:#1a9d5a; background:#f0faf4; cursor:default; }
      .tr { font-size:14.5px; line-height:1.55; }
      .src { color:#6b7684; font-size:12.5px; margin-top:7px; padding-top:6px; border-top:1px dashed #e6e9ef;
        max-height:70px; overflow:hidden; }
      .lbl { display:inline-block; font-size:10.5px; font-weight:700; color:#2f6fed; border:1px solid #cddcff;
        background:#f2f6ff; border-radius:5px; padding:0 6px; margin-bottom:6px; }
      .hv { margin-top:8px; padding-top:7px; border-top:1px dashed #e6e9ef; font-size:12.5px; color:#2f6fed; font-weight:600; }
      .hvm { color:#6b7684; font-weight:400; }
    `;
    const box = document.createElement("div");
    box.className = "box";
    root.appendChild(style);
    root.appendChild(box);
    document.documentElement.appendChild(host);
    boxEl = box;
    const myHost = host;
    requestAnimationFrame(() => { if (myHost === host) place(); });
    return box;
  }

  // Tính vị trí tối ưu quanh con trỏ: ưu tiên dưới, thiếu chỗ thì lật lên trên;
  // ưu tiên phải, thiếu chỗ thì lật sang trái; luôn nằm trọn trong màn hình.
  function computePos(o) {
    const M = 8, GAP = 14;           // lề màn hình, khoảng cách với con trỏ
    const vw = o.vw, vh = o.vh;
    const w = Math.min(o.w, vw - 2 * M);

    // --- ngang ---
    let x = o.ax + 12;
    if (x + w > vw - M) x = o.ax - 12 - w;       // lật sang trái con trỏ
    if (x < M) x = Math.min(M, vw - w - M);      // vẫn không đủ -> ép vào lề
    if (x + w > vw - M) x = Math.max(M, vw - w - M);

    // --- dọc ---
    const below = vh - o.ay - GAP - M;           // chỗ trống bên dưới con trỏ
    const above = o.ay - GAP - M;                // chỗ trống bên trên con trỏ
    let y, maxH;
    if (o.h <= below) {                          // đủ chỗ bên dưới
      y = o.ay + GAP; maxH = below;
    } else if (o.h <= above) {                   // đủ chỗ bên trên -> lật lên
      y = o.ay - GAP - o.h; maxH = above;
    } else if (below >= above) {                 // không đủ hẳn: chọn bên rộng hơn
      y = o.ay + GAP; maxH = Math.max(120, below);
    } else {
      maxH = Math.max(120, above);
      y = Math.max(M, o.ay - GAP - maxH);
    }
    if (y < M) y = M;
    if (y + Math.min(o.h, maxH) > vh - M) y = Math.max(M, vh - Math.min(o.h, maxH) - M);
    return { x, y, w, maxH };
  }

  function place() {
    if (!host || !boxEl || !host.isConnected) return;
    boxEl.style.maxHeight = "none";
    boxEl.style.width = Math.min(330, innerWidth - 16) + "px";
    const natural = boxEl.offsetHeight || boxEl.scrollHeight || 0;
    const p = computePos({ ax: anchor.x, ay: anchor.y, w: 330, h: natural, vw: innerWidth, vh: innerHeight });
    boxEl.style.width = p.w + "px";
    boxEl.style.maxHeight = Math.min(340, p.maxH) + "px";
    host.style.left = p.x + "px";
    host.style.top = p.y + "px";
  }

  function speak(t) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = "ja-JP"; u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch (e) { /* không có giọng Nhật */ }
  }

  function render(box, res, word) {
    box.textContent = "";
    const entries = (res && res.entries) || [];
    if (!entries.length) {
      const d = document.createElement("div");
      d.className = "st";
      d.textContent = res && res.error ? ("Lỗi: " + res.error) : "Không tìm thấy nghĩa.";
      box.appendChild(d);
    }
    entries.slice(0, 4).forEach((en) => {
      const wrap = document.createElement("div"); wrap.className = "en";
      const hd = document.createElement("div"); hd.className = "hd";
      const left = document.createElement("div");
      const w = document.createElement("span"); w.className = "w"; w.textContent = en.word; left.appendChild(w);
      const spk = document.createElement("button"); spk.className = "spk"; spk.textContent = "🔊";
      spk.addEventListener("click", (e) => { e.stopPropagation(); speak(en.word); }); left.appendChild(spk);
      if (en.reading) { const r = document.createElement("span"); r.className = "rd"; r.textContent = en.reading; left.appendChild(r); }
      hd.appendChild(left);
      const sv = document.createElement("button"); sv.className = "sv";
      if (res.saved && res.saved[en.word]) { sv.textContent = "✓ Đã lưu"; sv.classList.add("on"); }
      else {
        sv.textContent = "＋ Lưu";
        sv.addEventListener("click", (e) => {
          e.stopPropagation();
          chrome.runtime.sendMessage({ type: "SAVE_WORD", entry: Object.assign({}, en, { src: pageSrc(word) }), dict: "javi" }, () => {
            sv.textContent = "✓ Đã lưu"; sv.classList.add("on");
          });
        });
      }
      hd.appendChild(sv);
      wrap.appendChild(hd);
      if (en.means && en.means.length) {
        const ul = document.createElement("ul");
        en.means.slice(0, 4).forEach((m) => { const li = document.createElement("li"); li.textContent = m; ul.appendChild(li); });
        wrap.appendChild(ul);
      }
      box.appendChild(wrap);
    });

    const ks = (res && res.kanji) || [];
    if (ks.length) {
      const hv = document.createElement("div"); hv.className = "hv";
      hv.textContent = "Hán Việt: " + ks.map((k) => k.ch + " " + (k.hv || "?")).join(" · ");
      box.appendChild(hv);
    }
    place();                       // canh lại vì nội dung vừa cao lên
    requestAnimationFrame(place);  // chắc chắn sau khi trình duyệt dựng xong
  }


  function renderTranslate(box, res, text) {
    box.textContent = "";
    if (!res || !res.ok) {
      const d = document.createElement("div");
      d.className = "st";
      d.textContent = (res && res.error) || "Không dịch được.";
      box.appendChild(d);
      return;
    }
    const lbl = document.createElement("div"); lbl.className = "lbl"; lbl.textContent = "DỊCH CÂU";
    box.appendChild(lbl);

    const hd = document.createElement("div"); hd.className = "hd";
    const tr = document.createElement("div"); tr.className = "tr"; tr.textContent = res.text;
    hd.appendChild(tr);
    const sv = document.createElement("button"); sv.className = "sv"; sv.textContent = "＋ Lưu";
    sv.addEventListener("click", (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({
        type: "SAVE_WORD",
        entry: { word: text, reading: "", means: [res.text], kind: "sent", src: pageSrc(text) },
        dict: "javi"
      }, () => { sv.textContent = "✓ Đã lưu"; sv.classList.add("on"); });
    });
    hd.appendChild(sv);
    box.appendChild(hd);

    const src = document.createElement("div"); src.className = "src"; src.textContent = text;
    box.appendChild(src);
    place();
    requestAnimationFrame(place);
  }

  function triggerTranslate(x, y, text) {
    const box = ensureHost(x, y);
    const st = document.createElement("div"); st.className = "st";
    st.textContent = "Đang dịch…";
    box.appendChild(st);
    chrome.runtime.sendMessage({ type: "TRANSLATE", text: text, from: "ja", to: "vi" }, (res) => {
      if (!host) return;
      if (chrome.runtime.lastError) { st.textContent = "Lỗi: " + chrome.runtime.lastError.message; return; }
      renderTranslate(box, res || {}, text);
    });
  }

  function trigger(x, y, text) {
    const box = ensureHost(x, y);
    const st = document.createElement("div"); st.className = "st";
    st.textContent = "Đang tra “" + text + "”…";
    box.appendChild(st);
    chrome.runtime.sendMessage({ type: "LOOKUP", word: text, dict: "javi" }, (res) => {
      if (!host) return;
      if (chrome.runtime.lastError) { st.textContent = "Lỗi: " + chrome.runtime.lastError.message; return; }
      render(box, res || {}, text);
    });
  }

  // Ghi lại nguồn của từ/câu khi lưu: URL + tiêu đề + đúng đoạn đang bôi đen.
  // Chỉ dùng cho trang web thường (http/https) — PDF hay trang nội bộ không tô sáng lại được.
  function pageSrc(sel) {
    try {
      if (!/^https?:/i.test(location.href)) return null;
      return { url: location.href, title: (document.title || "").slice(0, 200), sel: (sel || "").slice(0, 400) };
    } catch (e) { return null; }
  }

  // ===== Mở lại nguồn: tô sáng lại từ/câu đã lưu khi quay về trang gốc =====
  function sameDoc(a, b) {
    try { const ua = new URL(a), ub = new URL(b);
      return ua.origin === ub.origin && ua.pathname === ub.pathname && ua.search === ub.search;
    } catch (e) { return a === b; }
  }
  function hlStyle() {
    if (document.getElementById("__njdict_hl_style")) return;
    const s = document.createElement("style");
    s.id = "__njdict_hl_style";
    s.textContent =
      "mark.__njdict_hl{background:#ffe45c!important;color:inherit!important;" +
      "box-shadow:0 0 0 3px #ffe45c,0 0 0 5px #ff9800!important;border-radius:2px!important;" +
      "animation:__njdict_pulse 1s ease-in-out 3!important;cursor:pointer}" +
      "@keyframes __njdict_pulse{0%,100%{box-shadow:0 0 0 3px #ffe45c,0 0 0 5px #ff9800}" +
      "50%{box-shadow:0 0 0 3px #fff3a0,0 0 0 8px #ffb300}}" +
      ".__njdict_toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);" +
      "background:#1c2430;color:#fff;font:13px/1.4 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;" +
      "padding:9px 14px;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.3);z-index:2147483647;" +
      "max-width:80vw;opacity:0;transition:opacity .25s}.__njdict_toast.show{opacity:1}";
    (document.head || document.documentElement).appendChild(s);
  }
  function njToast(msg) {
    hlStyle();
    const t = document.createElement("div");
    t.className = "__njdict_toast";
    t.textContent = msg;
    document.documentElement.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 3500);
  }
  function findTextNode(str) {
    if (!str || !document.body) return null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || n.nodeValue.indexOf(str) < 0) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.nodeName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA") return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest("mark.__njdict_hl")) return NodeFilter.FILTER_REJECT;
        const cs = window.getComputedStyle(p);
        if (cs && (cs.display === "none" || cs.visibility === "hidden")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const n = walker.nextNode();
    if (!n) return null;
    return { node: n, index: n.nodeValue.indexOf(str), len: str.length };
  }
  function hlVariants(target) {
    const t = (target || "").trim();
    const out = [];
    if (!t) return out;
    out.push(t);
    const collapsed = t.replace(/\s+/g, " ");
    if (collapsed !== t) out.push(collapsed);
    if (t.length > 12) {                       // câu dài trải nhiều node -> neo vào đoạn đầu gọn trong một node
      const head = t.slice(0, 24).replace(/\s+\S*$/, "");
      if (head.length >= 4) out.push(head);
      out.push(t.slice(0, 8));
    }
    return out;
  }
  function doHighlight(target) {
    for (const v of hlVariants(target)) {
      const hit = findTextNode(v);
      if (!hit) continue;
      hlStyle();
      try {
        const range = document.createRange();
        range.setStart(hit.node, hit.index);
        range.setEnd(hit.node, hit.index + hit.len);
        const mark = document.createElement("mark");
        mark.className = "__njdict_hl";
        range.surroundContents(mark);
        mark.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        const clean = () => {
          if (!mark.parentNode) return;
          const tx = document.createTextNode(mark.textContent);
          const parent = mark.parentNode;
          parent.replaceChild(tx, mark);
          parent.normalize();
        };
        mark.addEventListener("click", clean);
        setTimeout(clean, 12000);
        return true;
      } catch (e) { /* thử biến thể tiếp theo */ }
    }
    return false;
  }
  function tryHighlight(target, tries) {
    if (doHighlight(target)) return;
    if (tries > 0) { setTimeout(() => tryHighlight(target, tries - 1), 400); return; }
    njToast("NJDict: không tìm thấy vị trí của mục này trên trang (nội dung có thể đã thay đổi).");
  }
  (function checkPendingHighlight() {
    try {
      if (!/^https?:/i.test(location.href)) return;
      chrome.storage.local.get("pendingHighlight", (r) => {
        const ph = r && r.pendingHighlight;
        if (!ph || !ph.url || !ph.text) return;
        if (Date.now() - (ph.ts || 0) > 60000) { chrome.storage.local.remove("pendingHighlight"); return; }
        if (!sameDoc(ph.url, location.href)) return;
        chrome.storage.local.remove("pendingHighlight");   // tiêu thụ ngay để tab khác không lặp lại
        const run = () => tryHighlight(ph.text, 15);
        if (document.readyState === "complete") setTimeout(run, 300);
        else window.addEventListener("load", () => setTimeout(run, 300), { once: true });
      });
    } catch (e) { /* bỏ qua */ }
  })();

  document.addEventListener("mousedown", (e) => {
    lastCtrl = e.ctrlKey || e.metaKey;
    if (host && !e.composedPath().includes(host)) close();   // bấm ra ngoài -> tắt
  }, true);

  document.addEventListener("mouseup", (e) => {
    if (host && e.composedPath().includes(host)) return;
    if (!S.inline) return;
    if (S.requireCtrl && !(lastCtrl || e.ctrlKey || e.metaKey)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (!text) return;
      const x = e.clientX + 12, y = e.clientY + 16;
      const lim = S.maxLen || 30;
      // Là CÂU nếu dài hơn 30 ký tự hoặc có dấu câu / xuống dòng -> dịch, không tra từ điển
      const isSentence = text.length > 30 || /[。．！？\n]/.test(text);
      if (!isSentence && text.length <= lim) { trigger(x, y, text); return; }
      if (S.translate !== false && text.length <= (S.maxSent || 400)) triggerTranslate(x, y, text);
    }, 10);
  });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  window.addEventListener("blur", close);
  window.addEventListener("resize", () => { if (host) place(); });
})();
