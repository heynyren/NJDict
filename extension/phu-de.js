/**
 * LỜI THOẠI YOUTUBE — bảng phụ đề bám theo video, nối thẳng vào sổ tay
 * ====================================================================
 *
 * Xem một video tiếng Nhật mà nghe hụt một câu thì bình thường phải: bật phụ
 * đề của YouTube, tua đi tua lại, chép tay câu đó sang chỗ khác để tra. Đến khi
 * tra xong thì quên mất mình đang xem tới đâu, và vài hôm sau nhìn lại cái từ
 * trong sổ cũng chẳng nhớ nó ở video nào, phút thứ mấy.
 *
 * File này bỏ hết chỗ đó đi: lời thoại nằm ngay cạnh video, tự sáng dòng đang
 * nói, bấm dòng nào là tua tới đó, bôi đen chữ nào là ra đúng cái popup ba tab
 * quen thuộc — và mục lưu về sổ tay mang theo cả **video lẫn mốc giây**, nên
 * sau này mở nguồn là nhảy về đúng chỗ người ta đang nói câu đó.
 *
 * Ba điều đáng nói về cách làm:
 *
 * 1. KHÔNG nghe gì cả. Trang xem video đã có sẵn danh sách phụ đề kèm mốc thời
 *    gian; việc còn lại chỉ là tìm nhị phân theo `video.currentTime`. Nhờ vậy
 *    "thời gian thực" không tốn mạng, không lệch, và chạy được cả khi tua.
 *
 * 2. GHÉP CUE THÀNH CÂU trước khi làm bất cứ việc gì. Phụ đề tự sinh cắt theo
 *    hơi thở chứ không theo câu — "và cái mà tôi muốn" / "nói ở đây là" / "thiết
 *    bị đóng cắt". Ném từng mẩu đó đi dịch thì ra rác, mà lưu vào sổ tay thì ra
 *    những mục cụt đầu cụt đuôi. Xem `ghepCau`.
 *
 * 3. Đây KHÔNG phải một loại mục mới. Nó chỉ là một loại **nguồn** mới:
 *    `src.yt = {v, t}` nằm cạnh `src.url` sẵn có. Nhờ vậy sổ tay, sóng ôn tập,
 *    sửa nghĩa, ghi chú, xuất Anki, đồng bộ — chạy nguyên, không sửa gì.
 */
(() => {
  "use strict";
  if (location.hostname.indexOf("youtube.com") < 0) return;

  /* ================================================================== */
  /* Lấy phụ đề                                                          */
  /* ================================================================== */

  /**
   * Cắt một object JSON nhúng trong HTML, đếm ngoặc chứ không dùng biểu thức
   * chính quy: nội dung bên trong có cả `}` lẫn `;` nằm trong chuỗi, regex sẽ
   * cắt nhầm ở video đầu tiên có dấu ngoặc trong tiêu đề.
   */
  function catJSON(html, khoa) {
    const i = html.indexOf(khoa);
    if (i < 0) return null;
    const b = html.indexOf("{", i);
    if (b < 0) return null;
    let sau = 0, trongChuoi = false, thoat = false;
    for (let k = b; k < html.length; k++) {
      const c = html[k];
      if (thoat) { thoat = false; continue; }
      if (c === "\\") { if (trongChuoi) thoat = true; continue; }
      if (c === '"') { trongChuoi = !trongChuoi; continue; }
      if (trongChuoi) continue;
      if (c === "{") sau++;
      else if (c === "}") { sau--; if (!sau) { try { return JSON.parse(html.slice(b, k + 1)); } catch (e) { return null; } } }
    }
    return null;
  }

  /* ---- Cầu nối sang thế giới của trang (xem phu-de-trang.js) ---- */

  let soHoi = 0;
  function hoiTrang(viec, url) {
    return new Promise((giai) => {
      const id = "njd" + (++soHoi);
      let xong = false;
      const nghe = (e) => {
        const d = e.data;
        if (e.source !== window || !d || d.__njd !== "tra" || d.id !== id) return;
        xong = true; window.removeEventListener("message", nghe); giai(d.kq || null);
      };
      window.addEventListener("message", nghe);
      window.postMessage({ __njd: "hoi", id: id, viec: viec, url: url }, "*");
      // Không có bên kia trả lời (trang chặn, hoặc Chrome cũ không cho world:MAIN)
      // thì đừng treo mãi — còn hai đường khác để đi.
      setTimeout(() => { if (!xong) { window.removeEventListener("message", nghe); giai(null); } }, 4000);
    });
  }

  /** Thân trả về có đúng là JSON không — YouTube hay trả 200 kèm thân RỖNG. */
  function laJson(t) {
    const x = (t || "").trim();
    return x.length > 2 && (x[0] === "{" || x[0] === "[");
  }

  /**
   * Danh sách bản phụ đề của một video.
   *
   * Tải lại chính trang xem thay vì đọc `ytInitialPlayerResponse` của trang
   * đang mở: YouTube là ứng dụng một trang, chuyển video KHÔNG tải lại trang,
   * nên biến toàn cục đó thường vẫn là của video trước. Tự tải theo đúng mã
   * video thì không bao giờ nhầm. Đây là fetch cùng nguồn từ content script nên
   * có sẵn cookie và không cần xin thêm quyền nào.
   */
  async function layBanPhuDe(v) {
    // Hỏi thẳng trình phát trước: nhanh, và chắc chắn là của ĐÚNG video đang mở.
    let pr = null;
    const q = await hoiTrang("player");
    if (q && q.ok && q.pr && q.pr.videoDetails && q.pr.videoDetails.videoId === v) pr = q.pr;

    if (!pr) {
      const r = await fetch("/watch?v=" + encodeURIComponent(v), { credentials: "include" });
      if (!r.ok) throw new Error("Không tải được trang video (HTTP " + r.status + ")");
      pr = catJSON(await r.text(), "ytInitialPlayerResponse");
    }
    if (!pr) throw new Error("Không đọc được dữ liệu trình phát");
    const ds = pr.videoDetails || {};
    const ct = ((pr.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks || [];
    return {
      tieuDe: ds.title || "",
      kenh: ds.author || "",
      ban: ct.map((t) => ({
        url: t.baseUrl,
        ma: t.languageCode || "",
        ten: (t.name && (t.name.simpleText || (t.name.runs || []).map((x) => x.text).join(""))) || t.languageCode || "?",
        tuDong: t.kind === "asr"
      })).filter((t) => t.url)
    };
  }

  /**
   * Đọc json3 thành các MẨU nhỏ nhất còn giữ được mốc thời gian.
   *
   * Phụ đề tự sinh thường kèm `tOffsetMs` cho từng từ. Giữ lại thì tô sáng được
   * đúng chữ đang nói chứ không chỉ đúng câu — mà đó mới là thứ giúp bám kịp
   * người bản xứ nói nhanh. Phụ đề người làm thường mỗi sự kiện một mẩu, lúc đó
   * mẩu = một dòng phụ đề, vẫn nhỏ hơn câu nhiều.
   *
   * Cố ý KHÔNG cắt bỏ khoảng trắng đầu/cuối mỗi mẩu: với tiếng có dấu cách,
   * dấu cách nằm ở đầu mẩu sau, cắt đi là dính chữ.
   */
  function docJson3(txt) {
    const d = JSON.parse(txt);
    const out = [];
    (d.events || []).forEach((e) => {
      if (!e.segs) return;
      const t0 = (e.tStartMs || 0) / 1000;
      const dai = (e.dDurationMs || 0) / 1000;
      const segs = e.segs.filter((x) => (x.utf8 || "").trim());
      segs.forEach((x, i) => {
        const lech = (x.tOffsetMs || 0) / 1000;
        const sau = segs[i + 1];
        const lechSau = sau ? ((sau.tOffsetMs || 0) / 1000) : dai;
        out.push({
          t: t0 + lech,
          d: Math.max(0.05, lechSau - lech),
          s: String(x.utf8).replace(/\s+/g, " ")
        });
      });
    });
    return out;
  }

  /**
   * Tải một bản phụ đề về dạng [{t, d, s}] (giây, giây, chữ).
   *
   * Ba đường, đi lần lượt cho tới khi có chữ:
   *   1. fetch TỪ TRONG TRANG — đúng ngữ cảnh trình phát, cửa còn rộng nhất.
   *   2. fetch từ content script — cùng nguồn, có cookie.
   *   3. nhờ chính YouTube: mở bảng "bản chép lời" của họ rồi đọc DOM.
   *
   * Vì sao phải ba đường: YouTube đang siết `timedtext`, và khi từ chối thì nó
   * trả về 200 kèm thân RỖNG chứ không báo lỗi tử tế. Đường 3 chậm và xấu, bù
   * lại gần như không bao giờ hỏng — vì phần khó (giấy phép, mã thông báo) do
   * chính YouTube làm, mình chỉ đọc lại kết quả.
   */
  async function layCue(ban) {
    const u = ban.url + "&fmt=json3";
    let txt = "";

    const a = await hoiTrang("fetch", u);
    if (a && a.ok && laJson(a.text)) txt = a.text;

    if (!txt) {
      try {
        const r = await fetch(u, { credentials: "include" });
        if (r.ok) { const t = await r.text(); if (laJson(t)) txt = t; }
      } catch (e) { /* rơi xuống đường 3 */ }
    }

    if (txt) {
      try { const cs = docJson3(txt); if (cs.length) return { cue: cs, cach: "api" }; } catch (e) { /* rơi xuống */ }
    }

    const cs = await capBangYouTube();
    if (cs.length) return { cue: cs, cach: "bang" };
    throw new Error("YouTube không cho tải phụ đề, mà cũng chưa mở được bảng bản chép lời của họ. "
      + "Bấm “…” dưới video → “Hiện bản chép lời” — hiện ra là chỗ này tự lấy, không cần bấm gì thêm.");
  }

  /* ---- Đường 3: đọc lại bảng bản chép lời của chính YouTube ---- */

  const doi = (ms) => new Promise((r) => setTimeout(r, ms));

  /** "1:06" -> 66; "1:02:03" -> 3723. */
  function giayTu(s) {
    const p = String(s || "").trim().split(":").map((x) => parseInt(x, 10) || 0);
    if (!p.length) return 0;
    return p.reduce((a, b) => a * 60 + b, 0);
  }

  function doanBang() { return document.querySelectorAll("ytd-transcript-segment-renderer"); }

  /** Nút mở bản chép lời của YouTube — thử theo cấu trúc trước, rồi theo nhãn. */
  function timNutChepLoi() {
    const a = document.querySelector(
      "ytd-video-description-transcript-section-renderer button, " +
      "ytd-video-description-transcript-section-renderer ytd-button-renderer button");
    if (a) return a;
    // YouTube đổi cấu trúc HTML luôn xoành xoạch, nhưng CHỮ trên nút thì bền hơn.
    const nhan = /transcript|bản chép lời|文字起こし|스크립트/i;
    const ds = document.querySelectorAll("button, tp-yt-paper-button, yt-button-shape button");
    for (const b of ds) {
      const chu = (b.getAttribute("aria-label") || "") + " " + (b.textContent || "");
      if (nhan.test(chu)) return b;
    }
    return null;
  }

  /**
   * Chờ tới khi bảng bản chép lời của YouTube CÓ CHỮ.
   *
   * Dùng MutationObserver chứ không đếm nhịp cho đủ số lần: video một tiếng thì
   * YouTube dựng bảng lâu hơn hẳn video năm phút, mà đặt sẵn một hạn cứng thì
   * kiểu gì cũng có video vượt qua — và lúc đó người dùng nhìn thấy bảng của họ
   * đầy chữ ngay trên màn hình trong khi mình báo "không mở được", vô lý.
   */
  function choDoan(han) {
    return new Promise((giai) => {
      if (doanBang().length) { giai(true); return; }
      let xong = false;
      const thoi = (v) => { if (xong) return; xong = true; qs.disconnect(); clearTimeout(h); giai(v); };
      const qs = new MutationObserver(() => { if (doanBang().length) thoi(true); });
      qs.observe(document.body, { childList: true, subtree: true });
      const h = setTimeout(() => thoi(false), han || 20000);
    });
  }

  async function capBangYouTube() {
    let taMo = false;                       // mình mở hay bảng vốn đã mở sẵn
    if (!doanBang().length) {
      // Nút "bản chép lời" nằm trong phần mô tả, mà phần mô tả thì đang thu gọn.
      const mo = document.querySelector(
        "#description-inline-expander #expand, ytd-text-inline-expander #expand, tp-yt-paper-button#expand");
      if (mo) { mo.click(); await doi(500); }
      const nut = timNutChepLoi();
      if (nut) { nut.click(); taMo = true; }
      await choDoan(20000);
    }

    const ds = [];
    doanBang().forEach((el) => {
      const ts = (el.querySelector(".segment-timestamp") || {}).textContent || "";
      const tx = (el.querySelector(".segment-text") || {}).textContent || "";
      const chu = tx.replace(/\s+/g, " ").trim();
      if (chu) ds.push({ t: giayTu(ts), d: 0, s: chu });
    });
    // Bảng của YouTube không cho biết mỗi mẩu dài bao lâu -> suy từ mốc mẩu sau.
    for (let i = 0; i < ds.length; i++) ds[i].d = (i + 1 < ds.length) ? Math.max(0, ds[i + 1].t - ds[i].t) : 4;
    // Bảng của họ không có mốc theo từ, nên mẩu nhỏ nhất ở đây là một dòng —
    // vẫn đủ để tô sáng nhỏ hơn câu.

    // Chỉ đóng bảng nếu CHÍNH MÌNH mở nó ra. Bạn tự mở để đọc mà nó tự đóng lại
    // thì khó chịu hơn nhiều so với việc bảng này bị đẩy xuống một đoạn.
    if (taMo) {
      const bang = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
      const dong = bang && bang.querySelector("#visibility-button button");
      if (dong) dong.click();
    }
    return ds;
  }

  /* ================================================================== */
  /* Ghép cue thành câu                                                  */
  /* ================================================================== */

  const CJK = /[　-ヿ㐀-䶿一-鿿＀-￯]/;
  const HET_CAU = /[。．！？!?…]$|[.!?]["'’”)]?$/;

  /** Nối hai mẩu: tiếng Nhật thì dính liền, tiếng có khoảng trắng thì thêm dấu cách. */
  function noiChu(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (/\s$/.test(a) || /^\s/.test(b)) return a + b;   // mẩu đã tự mang dấu cách
    const dinh = CJK.test(a[a.length - 1]) && CJK.test(b[0]);
    return a + (dinh ? "" : " ") + b;
  }

  /**
   * Gộp các cue rời thành câu đọc được.
   *
   * Ngắt khi gặp một trong ba điều: hết câu bằng dấu câu, có khoảng lặng đáng kể
   * trước cue sau, hoặc đã quá dài (phòng người nói một mạch không nghỉ). Không
   * làm bước này thì mọi thứ phía sau đều hỏng theo: bản dịch vụn, mục lưu vào
   * sổ tay cụt đầu cụt đuôi, tra từ thì trúng nửa từ bị cắt đôi giữa hai cue.
   */
  function ghepCau(cues, opt) {
    const LANG = (opt && opt.nghi) || 0.9;      // khoảng lặng đủ để coi là hết câu
    const DAI = (opt && opt.dai) || 140;        // trần độ dài một câu
    const out = [];
    let cur = null;
    for (let i = 0; i < cues.length; i++) {
      const c = cues[i];
      if (!cur) {
        cur = { t: c.t, tEnd: c.t + c.d, s: c.s, manh: [{ t: c.t, d: c.d, a: 0, b: c.s.length }] };
      } else {
        // Ghi lại mẩu này nằm ở đâu trong chuỗi đã ghép, để lúc phát còn tô
        // sáng đúng phần đang được nói. noiChu chỉ nối thêm vào đuôi, nên vị trí
        // bắt đầu chính là độ dài mới trừ đi độ dài mẩu.
        const moi = noiChu(cur.s, c.s);
        cur.manh.push({ t: c.t, d: c.d, a: moi.length - c.s.length, b: moi.length });
        cur.s = moi;
        cur.tEnd = c.t + c.d;
      }

      const sau = cues[i + 1];
      const khoangLang = sau ? sau.t - (c.t + c.d) : Infinity;
      if (HET_CAU.test(cur.s) || khoangLang >= LANG || cur.s.length >= DAI || !sau) {
        out.push(cur);
        cur = null;
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  /* ================================================================== */
  /* Trạng thái                                                          */
  /* ================================================================== */

  const S = {
    v: "",              // mã video đang xem
    tieuDe: "", kenh: "",
    ban: [], iBan: 0,   // các bản phụ đề + bản đang chọn
    cau: [],            // câu đã ghép
    hien: -1,           // chỉ số câu đang nói
    manh: -1,           // chỉ số mẩu đang được nói TRONG câu đó
    bam: true,          // tự cuộn theo video
    songNgu: false,
    dich: new Map(),    // chỉ số câu -> bản dịch
    host: null, root: null, oList: null, oTrong: null
  };

  const dem = (t) => {
    const g = Math.max(0, Math.floor(t));
    const gio = Math.floor(g / 3600), phut = Math.floor((g % 3600) / 60), giay = g % 60;
    const hai = (n) => (n < 10 ? "0" : "") + n;
    return (gio ? gio + ":" + hai(phut) : phut) + ":" + hai(giay);
  };

  function video() {
    return document.querySelector("video.html5-main-video") || document.querySelector("#movie_player video") || document.querySelector("video");
  }

  /** Nguồn để lưu vào sổ tay: URL + tiêu đề + MỐC GIÂY. */
  function nguon(i, chu) {
    const c = S.cau[i];
    if (!c) return null;
    const t = Math.max(0, Math.floor(c.t));
    return {
      url: "https://www.youtube.com/watch?v=" + S.v,
      title: S.tieuDe || document.title,
      sel: (chu || c.s).slice(0, 400),
      yt: { v: S.v, t: t, dur: Math.max(1, Math.round(c.tEnd - c.t)), kenh: S.kenh }
    };
  }

  /* ================================================================== */
  /* Bảng lời thoại                                                      */
  /* ================================================================== */

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .box {
      --surface: #fff; --surface-2: #f1f4f9; --ink: #131a2a;
      --ink-2: rgba(19,26,42,.68); --ink-3: rgba(19,26,42,.45);
      --line: rgba(19,26,42,.09); --accent: #2f4fb5; --accent-soft: rgba(47,79,181,.10);
      --good: #12855b; --good-soft: rgba(18,133,91,.12);
      display: flex; flex-direction: column; max-height: 72vh; margin-bottom: 16px;
      background: var(--surface); color: var(--ink);
      font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      border-radius: 18px; box-shadow: 0 1px 2px rgba(16,24,40,.05), 0 8px 28px rgba(16,24,40,.12);
      overflow: hidden;
    }
    @media (prefers-color-scheme: dark) {
      .box {
        --surface: #171b26; --surface-2: #1f2431; --ink: #f2f4f8;
        --ink-2: rgba(238,242,250,.72); --ink-3: rgba(238,242,250,.44);
        --line: rgba(255,255,255,.09); --accent: #8aa4ff; --accent-soft: rgba(138,164,255,.16);
        --good: #2fd18a; --good-soft: rgba(47,209,138,.14);
        box-shadow: 0 1px 2px rgba(0,0,0,.4), 0 10px 30px rgba(0,0,0,.5);
      }
    }
    svg { display: inline-block; vertical-align: -.18em; flex: none; fill: currentColor; }
    button { font-family: inherit; cursor: pointer; }
    .top { display: flex; align-items: center; gap: 8px; padding: 11px 13px; }
    .top .nm { font-size: 13.5px; font-weight: 750; letter-spacing: -.01em; flex: 1; min-width: 0; }
    .top .n { color: var(--ink-3); font-size: 12px; font-weight: 600; }
    .chip {
      display: inline-flex; align-items: center; gap: 4px; flex: none;
      border: 1px solid var(--line); background: var(--surface); color: var(--ink-2);
      border-radius: 999px; font-size: 11.5px; font-weight: 650; padding: 4px 9px;
    }
    .chip:hover { background: var(--surface-2); color: var(--ink); }
    .chip.on { border-color: transparent; color: var(--accent); background: var(--accent-soft); }
    .bar { display: flex; align-items: center; gap: 6px; padding: 0 13px 10px; flex-wrap: wrap; }
    select, .find {
      font: inherit; font-size: 12px; color: var(--ink); background: var(--surface-2);
      border: 1px solid var(--line); border-radius: 999px; padding: 5px 10px; outline: none;
    }
    /* Cột phải của YouTube chỉ rộng ~400px: giữ cả hàng công cụ trên MỘT dòng,
       không thì "Bám" rơi xuống dòng riêng và bảng cao thêm vô ích. */
    select { max-width: 108px; }
    .find { flex: 1 1 70px; min-width: 0; }
    .find:focus { border-color: var(--accent); }
    .list { overflow-y: auto; padding: 2px 6px 10px; scroll-behavior: smooth; }
    .ln {
      display: flex; gap: 8px; align-items: flex-start; padding: 7px 7px;
      border-radius: 12px; cursor: text;
    }
    .ln:hover { background: var(--surface-2); }
    .ln.on { background: var(--accent-soft); }
    .ln .ts {
      flex: none; font-variant-numeric: tabular-nums; font-size: 11.5px; font-weight: 700;
      color: var(--accent); background: var(--surface-2); border: none;
      border-radius: 8px; padding: 3px 6px; margin-top: 1px;
    }
    .ln.on .ts { background: var(--surface); }
    .ln .tx { flex: 1; min-width: 0; font-size: 13.5px; overflow-wrap: anywhere; }
    .ln .vi { display: block; margin-top: 3px; color: var(--ink-2); font-size: 12.5px; }
    /* Mẩu đang được nói. Chỉ tô trong dòng đang chạy — tô cả bảng thì mắt không
       biết nhìn đâu. Bo góc + nền mềm chứ không gạch chân: chữ Nhật có nhiều nét
       chạm đáy, gạch chân là dính vào chữ. */
    .pc { border-radius: 5px; padding: 0 1px; }
    .ln.on .pc.now {
      background: var(--accent-soft); color: var(--accent);
      font-weight: 700; box-shadow: 0 0 0 2px var(--accent-soft);
    }
    /* Câu đang nói thì bản dịch của nó cũng đậm lên theo. Chỉ tới mức CÂU thôi
       — xem ghi chú ở đầu file về việc vì sao không tô tới từng từ. */
    .ln.on .vi { color: var(--ink); }
    .ln .sv {
      flex: none; visibility: hidden; border: 1px solid var(--line); background: var(--surface);
      color: var(--accent); border-radius: 999px; padding: 3px 7px; font-size: 11px; font-weight: 650;
      display: inline-flex; align-items: center; gap: 3px;
    }
    .ln:hover .sv, .ln.on .sv { visibility: visible; }
    .ln .sv.done { color: var(--good); background: var(--good-soft); border-color: transparent; }
    .st { display: flex; align-items: center; gap: 8px; color: var(--ink-3); font-size: 13px; padding: 14px 13px; }
    .back {
      position: absolute; left: 50%; transform: translateX(-50%); bottom: 12px;
      border: none; background: var(--accent); color: #fff; border-radius: 999px;
      padding: 6px 13px; font-size: 12px; font-weight: 700; box-shadow: 0 4px 14px rgba(16,24,40,.25);
      display: none; align-items: center; gap: 5px;
    }
    .wrap { position: relative; display: flex; flex-direction: column; min-height: 0; }
    .hide .bar, .hide .wrap { display: none; }
  `;

  function ic(ten, size) {
    const s = document.createElement("span");
    s.style.display = "inline-flex";
    s.innerHTML = (window.Icon ? window.Icon(ten, { size: size || 15 }) : "");
    return s.firstChild || s;
  }

  function nutChip(iconTen, chu, title) {
    const b = document.createElement("button");
    b.className = "chip"; b.type = "button";
    if (title) b.title = title;
    if (iconTen) b.appendChild(ic(iconTen, 13));
    if (chu) { const t = document.createElement("span"); t.textContent = chu; b.appendChild(t); }
    return b;
  }

  /** Chỗ đặt bảng: cột phải của YouTube, ngay trên danh sách video gợi ý. */
  function choDat() {
    return document.querySelector("#secondary-inner") || document.querySelector("#secondary");
  }

  function goBang() {
    if (quanSat) { quanSat.disconnect(); quanSat = null; }
    hangCho.clear(); clearTimeout(henDich);
    if (S.host) { S.host.remove(); S.host = null; S.root = null; S.oList = null; }
  }

  function dungBang() {
    goBang();
    const noi = choDat();
    if (!noi) return false;

    const host = document.createElement("div");
    host.setAttribute("data-njdict-yt", "1");   // content.js nhìn dấu này để không cướp sự kiện
    host.style.cssText = "all:initial;display:block;margin-bottom:16px";
    const root = host.attachShadow({ mode: "open" });
    const st = document.createElement("style"); st.textContent = CSS;
    root.appendChild(st);

    const box = document.createElement("div"); box.className = "box";
    root.appendChild(box);

    /* --- thanh tiêu đề --- */
    const top = document.createElement("div"); top.className = "top";
    top.appendChild(ic("subtitles", 17));
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = "Lời thoại";
    top.appendChild(nm);
    const demCau = document.createElement("span"); demCau.className = "n";
    top.appendChild(demCau);
    const nutThu = nutChip("caret-up", "", "Thu gọn");
    top.appendChild(nutThu);
    box.appendChild(top);

    /* --- thanh công cụ --- */
    const bar = document.createElement("div"); bar.className = "bar";
    const chonBan = document.createElement("select");
    chonBan.title = "Chọn bản phụ đề";
    const oTim = document.createElement("input");
    oTim.className = "find"; oTim.type = "search"; oTim.placeholder = "Tìm…";
    oTim.title = "Tìm trong lời thoại";
    const nutSong = nutChip("translate", "Song ngữ", "Hiện kèm bản dịch tiếng Việt");
    const nutBam = nutChip("crosshair-simple", "Bám", "Tự cuộn theo dòng đang nói");
    nutSong.classList.toggle("on", S.songNgu);   // giữ lựa chọn khi chuyển video
    bar.appendChild(chonBan); bar.appendChild(oTim); bar.appendChild(nutSong); bar.appendChild(nutBam);
    box.appendChild(bar);

    /* --- danh sách --- */
    const wrap = document.createElement("div"); wrap.className = "wrap";
    const list = document.createElement("div"); list.className = "list";
    const back = document.createElement("button"); back.className = "back"; back.type = "button";
    back.appendChild(ic("arrow-down", 13));
    const bt = document.createElement("span"); bt.textContent = "Về dòng đang nói"; back.appendChild(bt);
    wrap.appendChild(list); wrap.appendChild(back);
    box.appendChild(wrap);

    noi.insertBefore(host, noi.firstChild);

    S.host = host; S.root = root; S.oList = list;

    /* --- hành vi --- */
    nutThu.addEventListener("click", () => {
      const thu = box.classList.toggle("hide");
      nutThu.innerHTML = "";
      nutThu.appendChild(ic(thu ? "caret-down" : "caret-up", 13));
      nutThu.title = thu ? "Mở ra" : "Thu gọn";
    });
    chonBan.addEventListener("change", () => { S.iBan = +chonBan.value; napCue(); });
    oTim.addEventListener("input", () => loc(oTim.value.trim()));
    nutSong.addEventListener("click", () => {
      S.songNgu = !S.songNgu;
      nutSong.classList.toggle("on", S.songNgu);
      veDanhSach();
    });
    nutBam.addEventListener("click", () => {
      S.bam = !S.bam;
      nutBam.classList.toggle("on", S.bam);
      if (S.bam) { back.style.display = "none"; cuonToi(S.hien); }
    });
    nutBam.classList.add("on");
    back.addEventListener("click", () => {
      S.bam = true; nutBam.classList.add("on"); back.style.display = "none"; cuonToi(S.hien);
    });

    /*
     * Người dùng tự cuộn -> ngừng bám, hiện nút quay lại. Thiếu chỗ này thì
     * không đọc lùi được câu nào: cứ cuộn lên là bị kéo về ngay.
     *
     * Nghe THAO TÁC của người dùng (lăn chuột, vuốt, kéo thanh cuộn) chứ KHÔNG
     * nghe sự kiện "scroll". Bản trước nghe "scroll" rồi cố lọc bỏ những lần
     * chính mình cuộn bằng một cái cờ hẹn giờ 120ms — và sai, vì danh sách này
     * cuộn mượt (scroll-behavior: smooth): sự kiện scroll của CHÍNH MÌNH còn
     * rơi rớt lại rất lâu sau khi cờ đã tắt, nên chế độ Bám cứ tự tắt dù không
     * ai đụng vào. Vẽ lại danh sách (bật/tắt Song ngữ) cũng đưa scrollTop về 0
     * và dính đúng cái bẫy đó.
     */
    const nguoiDungCuon = () => {
      if (!S.bam) return;
      S.bam = false; nutBam.classList.remove("on"); back.style.display = "flex";
    };
    list.addEventListener("wheel", nguoiDungCuon, { passive: true });
    list.addEventListener("touchmove", nguoiDungCuon, { passive: true });
    // Bấm vào vùng thanh cuộn: clientWidth không tính thanh cuộn, nên offsetX
    // vượt quá nó nghĩa là đang kéo thanh cuộn chứ không bấm vào chữ.
    list.addEventListener("mousedown", (e) => { if (e.offsetX > list.clientWidth) nguoiDungCuon(); });

    // Bôi đen trong bảng -> đúng popup ba tab quen thuộc, kèm mốc giây.
    root.addEventListener("mouseup", (e) => {
      setTimeout(() => {
        const sel = root.getSelection ? root.getSelection() : document.getSelection();
        const chu = sel ? String(sel).trim() : "";
        if (!chu || chu.length > 400) return;
        const ln = e.target && e.target.closest ? e.target.closest(".ln") : null;
        const i = ln ? +ln.dataset.i : -1;
        if (!window.__NJD_popup) return;
        window.__NJD_popup(e.clientX + 12, e.clientY + 16, chu, i >= 0 ? nguon(i, chu) : null);
      }, 10);
    });

    S.uiBan = chonBan; S.uiDem = demCau; S.uiBack = back; S.uiTim = oTim;
    return true;
  }

  /**
   * Vẽ một câu thành từng mẩu có mốc thời gian, để còn tô sáng được.
   *
   * Phần chữ nằm GIỮA hai mẩu (dấu cách do noiChu chèn) vẫn để làm text thường —
   * bọc nó vào span thì lúc tô sáng sẽ thấy nền loang sang cả khoảng trắng.
   */
  function veManh(el, c) {
    const manh = c.manh || [];
    if (!manh.length) { el.appendChild(document.createTextNode(c.s)); return; }
    let pos = 0;
    manh.forEach((m, k) => {
      if (m.a > pos) el.appendChild(document.createTextNode(c.s.slice(pos, m.a)));
      const sp = document.createElement("span");
      sp.className = "pc"; sp.dataset.k = String(k);
      sp.textContent = c.s.slice(m.a, m.b);
      el.appendChild(sp);
      pos = m.b;
    });
    if (pos < c.s.length) el.appendChild(document.createTextNode(c.s.slice(pos)));
  }

  /* --- vẽ danh sách --- */
  function veDanhSach() {
    const list = S.oList;
    if (!list) return;
    list.textContent = "";
    S.cau.forEach((c, i) => {
      const ln = document.createElement("div");
      ln.className = "ln"; ln.dataset.i = String(i);

      const ts = document.createElement("button");
      ts.className = "ts"; ts.type = "button"; ts.textContent = dem(c.t);
      ts.title = "Tua tới đây";
      ts.addEventListener("click", (e) => { e.stopPropagation(); tuaToi(i); });
      ln.appendChild(ts);

      const tx = document.createElement("div"); tx.className = "tx";
      veManh(tx, c);
      if (S.songNgu) {
        const vi = document.createElement("span"); vi.className = "vi";
        vi.textContent = S.dich.has(i) ? S.dich.get(i) : "…";
        tx.appendChild(vi);
      }
      ln.appendChild(tx);

      const sv = document.createElement("button");
      sv.className = "sv"; sv.type = "button"; sv.title = "Lưu câu này vào sổ tay";
      sv.appendChild(ic("plus", 12));
      const svt = document.createElement("span"); svt.textContent = "Lưu"; sv.appendChild(svt);
      sv.addEventListener("click", (e) => { e.stopPropagation(); luuCau(i, sv, svt); });
      ln.appendChild(sv);

      list.appendChild(ln);
    });
    S.uiDem.textContent = S.cau.length ? S.cau.length + " câu" : "";
    batQuanSat();
    danhDau(true);
  }

  /** @param {Function} [thuLai] có thì hiện kèm nút "Thử lại". */
  function trangThai(chu, iconTen, thuLai) {
    if (!S.oList) return;
    S.oList.textContent = "";
    const d = document.createElement("div"); d.className = "st";
    d.appendChild(ic(iconTen || "spinner-gap", 16));
    const s = document.createElement("span"); s.textContent = chu;
    d.appendChild(s);
    S.oList.appendChild(d);
    if (thuLai) {
      const hang = document.createElement("div");
      hang.style.cssText = "padding:0 13px 12px";
      const b = nutChip("arrows-clockwise", "Thử lại");
      b.addEventListener("click", thuLai);
      hang.appendChild(b);
      S.oList.appendChild(hang);
    }
    S.uiDem.textContent = "";
  }

  function loc(q) {
    if (!S.oList) return;
    const k = q.toLowerCase();
    S.oList.querySelectorAll(".ln").forEach((ln) => {
      ln.style.display = (!k || ln.textContent.toLowerCase().indexOf(k) >= 0) ? "" : "none";
    });
  }

  /* --- bám theo video --- */
  function timCau(t) {
    let lo = 0, hi = S.cau.length - 1, ra = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (S.cau[m].t <= t) { ra = m; lo = m + 1; } else hi = m - 1;
    }
    return ra;
  }

  function cuonToi(i) {
    if (i < 0 || !S.oList) return;
    const ln = S.oList.querySelector('.ln[data-i="' + i + '"]');
    if (!ln) return;
    // Tự tính scrollTop chứ không dùng scrollIntoView: hàm đó cuộn cả các khối
    // cha, tức là kéo luôn cả trang YouTube bên dưới.
    S.oList.scrollTop = ln.offsetTop - S.oList.clientHeight / 2 + ln.offsetHeight / 2;
  }

  /** Mẩu đang được nói trong câu i, hoặc -1. */
  function timManh(i, t) {
    const c = S.cau[i];
    if (!c || !c.manh || !c.manh.length) return -1;
    const m = c.manh;
    let lo = 0, hi = m.length - 1, ra = -1;
    while (lo <= hi) {
      const g = (lo + hi) >> 1;
      if (m[g].t <= t) { ra = g; lo = g + 1; } else hi = g - 1;
    }
    // Cố ý GIỮ mẩu cuối vừa nói khi rơi vào khoảng lặng, thay vì tắt hẳn: nhấp
    // nháy theo từng quãng nghỉ giữa các từ còn khó theo dõi hơn là không tô.
    return ra;
  }

  function danhDauManh(k) {
    if (!S.oList) return;
    const cu = S.oList.querySelector(".pc.now");
    if (cu) cu.classList.remove("now");
    if (S.hien < 0 || k < 0) return;
    const ln = S.oList.querySelector('.ln[data-i="' + S.hien + '"]');
    const sp = ln && ln.querySelector('.pc[data-k="' + k + '"]');
    if (sp) sp.classList.add("now");
  }

  function danhDau(epCuon) {
    if (!S.oList) return;
    const cu = S.oList.querySelector(".ln.on");
    if (cu) cu.classList.remove("on");
    if (S.hien < 0) return;
    const ln = S.oList.querySelector('.ln[data-i="' + S.hien + '"]');
    if (ln) ln.classList.add("on");
    danhDauManh(S.manh);
    if (S.bam || epCuon) cuonToi(S.hien);
  }

  let dongHo = null, rvfc = null;
  function batTheoDoi() {
    dungTheoDoi();
    const vd = video();
    if (!vd) return;
    const nhip = () => {
      const t = vd.currentTime;
      const i = timCau(t);
      if (i !== S.hien) {
        S.hien = i; S.manh = -1;
        danhDau(false);
        dichCauDangNoi(i);
      }
      const k = timManh(i, t);
      if (k !== S.manh) { S.manh = k; danhDauManh(k); }
    };
    if (vd.requestVideoFrameCallback) {
      const vong = () => { nhip(); rvfc = vd.requestVideoFrameCallback(vong); };
      rvfc = vd.requestVideoFrameCallback(vong);
    }
    // Vẫn giữ một nhịp đếm giờ: requestVideoFrameCallback đứng im khi video
    // tạm dừng, mà tua lúc đang dừng thì dòng sáng vẫn phải chạy theo.
    dongHo = setInterval(nhip, 150);
  }
  function dungTheoDoi() {
    if (dongHo) { clearInterval(dongHo); dongHo = null; }
    if (rvfc != null) { const vd = video(); if (vd && vd.cancelVideoFrameCallback) vd.cancelVideoFrameCallback(rvfc); rvfc = null; }
  }

  function tuaToi(i) {
    const vd = video(), c = S.cau[i];
    if (!vd || !c) return;
    vd.currentTime = Math.max(0, c.t + 0.02);
    const p = vd.play();
    if (p && p.catch) p.catch(() => {});
    S.hien = i; S.manh = -1; danhDau(true);
  }

  /* --- dịch song ngữ --- */
  /*
   * Ba thứ làm bản cũ ì ạch, sửa cả ba:
   *
   *  · Chỉ dịch thêm mỗi khi video sang câu mới. Cuộn xuống đọc trước thì cứ
   *    nằm im ở dấu "…" cho tới lúc video chạy tới — nhìn như treo. Nay dùng
   *    IntersectionObserver: dòng nào lọt vào tầm mắt là dịch dòng đó.
   *
   *  · Mỗi câu một tin nhắn riêng sang nền, mà mỗi lượt dịch lẻ lại đọc-rồi-ghi
   *    CẢ bộ đệm vào chrome.storage. Gần trăm câu thành gần trăm vòng như thế.
   *    Nay gom thành một tin nhắn cho cả loạt (TRANSLATE_MANY).
   *
   *  · Bản cũ đo offsetTop của TỪNG dòng mỗi lần chạy — bắt trình duyệt tính
   *    lại bố cục cả bảng. IntersectionObserver không phải đo gì cả.
   */

  let quanSat = null;
  const hangCho = new Set();
  let henDich = null;

  function batQuanSat() {
    if (quanSat) { quanSat.disconnect(); quanSat = null; }
    if (!S.songNgu || !S.oList || typeof IntersectionObserver !== "function") return;
    quanSat = new IntersectionObserver((mps) => {
      let co = false;
      mps.forEach((m) => {
        if (!m.isIntersecting) return;
        const i = +m.target.dataset.i;
        if (S.dich.has(i)) return;
        hangCho.add(i); co = true;
      });
      if (co) henGui();
    }, { root: S.oList, rootMargin: "400px 0px" });
    // Dịch sẵn cả phần ngay ngoài khung nhìn để cuộn tới là đã có chữ.
    S.oList.querySelectorAll(".ln").forEach((ln) => quanSat.observe(ln));
  }

  /** Gom vài nhịp rồi mới gửi: cuộn nhanh sẽ bắn ra hàng chục lượt liền nhau. */
  function henGui() {
    clearTimeout(henDich);
    henDich = setTimeout(guiDich, 120);
  }

  function guiDich() {
    const ids = [...hangCho].filter((i) => !S.dich.has(i) && S.cau[i]).slice(0, 40);
    hangCho.clear();
    if (!ids.length) return;
    ids.forEach((i) => S.dich.set(i, ""));      // giữ chỗ, khỏi gửi trùng
    const texts = ids.map((i) => S.cau[i].s.trim());
    chrome.runtime.sendMessage({ type: "TRANSLATE_MANY", texts: texts, from: "ja", to: "vi" }, (res) => {
      const ra = (!chrome.runtime.lastError && res && res.ok) ? (res.texts || []) : [];
      ids.forEach((i, k) => {
        const t = ra[k] || "—";
        S.dich.set(i, t);
        const ln = S.oList && S.oList.querySelector('.ln[data-i="' + i + '"]');
        const vi = ln && ln.querySelector(".vi");
        if (vi) vi.textContent = t;
      });
    });
  }

  /** Đảm bảo câu đang nói có bản dịch, kể cả khi bạn đã cuộn đi chỗ khác. */
  function dichCauDangNoi(i) {
    if (!S.songNgu || i < 0 || S.dich.has(i)) return;
    hangCho.add(i); henGui();
  }

  /* --- lưu một câu vào sổ tay --- */
  function luuCau(i, nut, nhan) {
    const c = S.cau[i];
    if (!c) return;
    nut.disabled = true; nhan.textContent = "…";
    const gui = (nghia) => {
      chrome.runtime.sendMessage({
        type: "SAVE_WORD",
        entry: { word: c.s, reading: "", means: nghia ? [nghia] : [], kind: "sent", src: nguon(i) },
        dict: "javi"
      }, () => {
        nut.classList.add("done"); nut.disabled = false;
        nut.textContent = ""; nut.appendChild(ic("check", 12));
        const t = document.createElement("span"); t.textContent = "Đã lưu"; nut.appendChild(t);
      });
    };
    // Lưu kèm luôn bản dịch: một câu trần trụi nằm trong sổ tay thì đến lúc ôn
    // lại chẳng có gì để lật ra cả.
    if (S.dich.get(i)) { gui(S.dich.get(i)); return; }
    chrome.runtime.sendMessage({ type: "TRANSLATE", text: c.s, from: "ja", to: "vi" }, (res) => {
      gui((!chrome.runtime.lastError && res && res.ok) ? res.text : "");
    });
  }

  /* ================================================================== */
  /* Vòng đời                                                            */
  /* ================================================================== */

  async function napCue() {
    const ban = S.ban[S.iBan];
    if (!ban) { trangThai("Video này không có phụ đề nào.", "subtitles-slash"); return; }
    trangThai("Đang tải lời thoại…");
    S.dich.clear(); hangCho.clear();
    try {
      const kq = await layCue(ban);
      S.cau = ghepCau(kq.cue);
      // Lấy qua bảng của YouTube thì bản phụ đề là do HỌ chọn, đổi ở ô này cũng
      // không có tác dụng — nói thẳng ra thay vì để bấm rồi thấy không đổi gì.
      S.uiBan.disabled = (kq.cach === "bang");
      S.uiBan.title = S.uiBan.disabled
        ? "YouTube đang chặn đường tải phụ đề, phải đọc lại từ bảng của họ — đổi bản ở đây thì hãy đổi trong bảng đó"
        : "Chọn bản phụ đề";
      if (!S.cau.length) { trangThai("Bản phụ đề này rỗng.", "warning-circle"); return; }
      veDanhSach();
      batTheoDoi();
    } catch (e) {
      trangThai((e && e.message) || "Không tải được lời thoại.", "warning-circle", napCue);
      ngongBangYouTube();
    }
  }

  /**
   * Cả ba đường tắc thì đừng bỏ cuộc hẳn: ngồi chờ bảng bản chép lời của YouTube
   * xuất hiện rồi tự nhặt lấy.
   *
   * Có hai lối dẫn tới đây, và cả hai đều kết thúc bằng việc bảng của họ hiện ra:
   * hoặc YouTube dựng bảng chậm hơn hạn chờ, hoặc bạn tự bấm "…" → "Hiện bản
   * chép lời" theo lời nhắc. Bắt bạn bấm thêm nút Thử lại trong khi chữ đã nằm
   * sờ sờ trên màn hình là thừa một bước vô duyên.
   */
  let dangNgong = false;
  async function ngongBangYouTube() {
    if (dangNgong) return;
    dangNgong = true;
    const v = S.v;
    try {
      const co = await choDoan(5 * 60000);
      if (co && S.v === v && S.host && S.host.isConnected) await napCue();
    } finally { dangNgong = false; }
  }

  async function khoiDong(v) {
    S.v = v; S.cau = []; S.hien = -1; S.dich.clear(); S.bam = true;
    if (!dungBang()) return false;
    trangThai("Đang tìm phụ đề…");
    try {
      const d = await layBanPhuDe(v);
      if (S.v !== v) return true;                       // đã chuyển video khác
      S.tieuDe = d.tieuDe; S.kenh = d.kenh; S.ban = d.ban;
      if (!S.ban.length) {
        trangThai("Video này không có phụ đề — không có gì để đọc.", "subtitles-slash");
        S.uiBan.style.display = "none";
        return true;
      }
      // Ưu tiên bản người thật làm, tiếng Nhật trước, rồi mới tới bản tự sinh.
      const diem = (b) => (b.tuDong ? 0 : 2) + (b.ma === "ja" ? 1 : 0);
      let best = 0;
      S.ban.forEach((b, i) => { if (diem(b) > diem(S.ban[best])) best = i; });
      S.iBan = best;
      S.uiBan.style.display = S.ban.length > 1 ? "" : "none";
      S.uiBan.innerHTML = "";
      S.ban.forEach((b, i) => {
        const o = document.createElement("option");
        o.value = String(i);
        o.textContent = b.ten + (b.tuDong ? " (tự động)" : "");
        S.uiBan.appendChild(o);
      });
      S.uiBan.value = String(S.iBan);
      await napCue();
    } catch (e) {
      trangThai((e && e.message) || "Không lấy được phụ đề.", "warning-circle");
    }
    return true;
  }

  function maVideo() {
    if (location.pathname !== "/watch") return "";
    return new URLSearchParams(location.search).get("v") || "";
  }

  let dangCho = null;
  function xemLai() {
    const v = maVideo();
    if (!v) { dungTheoDoi(); goBang(); S.v = ""; return; }
    if (v === S.v && S.host && S.host.isConnected) return;
    dungTheoDoi();
    // Cột phải của YouTube dựng sau khi trang đã "xong", nên thử lại vài nhịp.
    clearInterval(dangCho);
    let lan = 0;
    const thu = async () => {
      if (maVideo() !== v) { clearInterval(dangCho); return; }
      if (choDat()) { clearInterval(dangCho); await khoiDong(v); return; }
      if (++lan > 40) clearInterval(dangCho);
    };
    dangCho = setInterval(thu, 300);
    thu();
  }

  // YouTube là ứng dụng một trang: chuyển video không tải lại trang.
  document.addEventListener("yt-navigate-finish", xemLai);
  let urlCu = location.href;
  setInterval(() => {
    if (location.href !== urlCu) { urlCu = location.href; xemLai(); return; }
    // YouTube dựng lại cột phải khá tuỳ hứng và cuốn theo cả bảng này; dựng lại
    // khi thấy nó biến mất, chứ không bắt người dùng tải lại trang.
    if (S.v && (!S.host || !S.host.isConnected) && choDat()) khoiDong(S.v);
  }, 700);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", xemLai);
  else xemLai();

  // Sổ tay bảo "về đúng giây đó" -> tua, và sáng đúng dòng.
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "YT_SEEK") return;
    if (msg.v && msg.v !== maVideo()) return;
    const vd = video();
    if (!vd) return;
    vd.currentTime = Math.max(0, msg.t || 0);
    const p = vd.play(); if (p && p.catch) p.catch(() => {});
    S.bam = true;
    const i = timCau(msg.t || 0);
    if (i >= 0) { S.hien = i; danhDau(true); }
  });
})();
