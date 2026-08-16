/**
 * Cắt các mẩu phụ đề rời thành CÂU.
 *
 * Vì sao tách hẳn ra một tệp: đây là chỗ quyết định chất lượng của mọi thứ phía
 * sau. Bản dịch, mục lưu vào sổ tay, việc tra từ — tất cả đều nhận đầu vào là
 * kết quả của tệp này. Cắt sai một chỗ thì hỏng cả ba.
 *
 * NGUYÊN TẮC BẤT DI BẤT DỊCH: không thêm, không bớt, không sửa một chữ nào của
 * YouTube. Nối các mẩu lại thì vẫn đúng y nguyên lời gốc; thứ duy nhất tệp này
 * được phép chọn là NGẮT Ở ĐÂU. (Ngoại lệ duy nhất: các nhãn tiếng động kiểu
 * "[音楽]" / "[Applause]" — đó là chú thích do YouTube chèn, không phải lời ai
 * nói, nên gỡ đi. Xem `locNhieu`.)
 *
 * Vì sao phải tự cắt thay vì dùng luôn cách chia dòng của YouTube: phụ đề tự
 * sinh nhận từng chữ rất chuẩn nhưng chia dòng theo bề rộng khung hình và nhịp
 * thở, không theo câu. Một câu bị xé làm ba, hai câu dính làm một — đưa nguyên
 * như vậy sang máy dịch thì bản dịch sai ngay từ đầu vào.
 *
 * Cách làm, ba lớp chồng lên nhau:
 *
 *   1. KHOẢNG LẶNG, đo tương đối. Ngưỡng cứng (kiểu "nghỉ 0,9 giây là hết câu")
 *      không dùng được: bản tin đọc nhanh thì 0,5 giây đã là nghỉ dài, người kể
 *      chuyện chậm thì 1,2 giây vẫn là giữa câu. Nên ở đây lấy trung vị các
 *      khoảng lặng QUANH ĐÓ làm mốc, rồi đo mọi khoảng lặng theo tỉ lệ với mốc
 *      ấy. Xem `nhipNghi`.
 *
 *   2. HÌNH THÁI. Tiếng Nhật có một ưu thế lớn: chỗ kết câu nhận ra được bằng
 *      luật chứ không cần đoán. Câu gần như luôn kết bằng vị ngữ (です／ます／
 *      だ／ない…), và ngược lại có một tập chữ TUYỆT ĐỐI không thể đứng cuối câu
 *      (の／に／を／は／が／て／ので／けど…). Vế phủ định này mới là vế ăn tiền:
 *      người ta lấy hơi giữa câu suốt, và chính chỗ đó là chỗ YouTube hay cắt
 *      bậy nhất.
 *
 *   3. CHẤM ĐIỂM thay vì luật cứng. Mỗi ranh giới được cộng trừ điểm từ mọi tín
 *      hiệu, ngắt khi tổng vượt ngưỡng. Nhờ vậy tín hiệu yếu biết cộng dồn với
 *      nhau, và khi buộc phải cắt vì câu quá dài thì cắt ở chỗ ĐIỂM CAO NHẤT
 *      trong đoạn chứ không cắt bừa ở ký tự thứ N như trước.
 *
 * Đầu vào : [{t, d, s}] — mẩu nhỏ nhất còn giữ mốc thời gian (thường là từng từ)
 * Đầu ra  : [{t, tEnd, s, manh:[{t, d, a, b}]}] — `manh` cho biết mẩu gốc nằm ở
 *           quãng [a,b) nào trong câu, để còn tô sáng và tua đúng chỗ.
 */
(function (goc) {
  "use strict";

  /* ================================================================== */
  /* Nối chữ                                                             */
  /* ================================================================== */

  const CJK = /[぀-ヿ㐀-䶿一-鿿＀-￯]/;

  /** Nối hai mẩu: tiếng Nhật thì dính liền, tiếng có khoảng trắng thì thêm dấu cách. */
  function noiChu(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (/\s$/.test(a) || /^\s/.test(b)) return a + b;   // mẩu đã tự mang dấu cách
    const dinh = CJK.test(a[a.length - 1]) && CJK.test(b[0]);
    return a + (dinh ? "" : " ") + b;
  }

  /* ================================================================== */
  /* Lọc nhãn tiếng động                                                 */
  /* ================================================================== */

  /**
   * YouTube chèn vào bản chép lời những nhãn KHÔNG phải lời người nói:
   * "[音楽]", "[拍手]", "[Applause]", "[âm nhạc]", "♪♪"… Để nguyên thì máy dịch
   * coi chúng là một phần câu và dịch méo cả đoạn, còn lưu vào sổ tay thì được
   * một mục vô nghĩa.
   *
   * Chỉ gỡ thứ nằm trong ngoặc VUÔNG (［］【】 cũng vậy) và dấu ♪. Ngoặc tròn thì
   * không đụng tới, vì lời nói thật vẫn có thể có ngoặc tròn.
   */
  const NHAN = /[\[［【][^\]］】]{0,40}[\]］】]|[♪♬🎵🎶]+/g;

  function locNhieu(cues) {
    const ra = [];
    for (const c of cues) {
      const s = String(c.s == null ? "" : c.s);
      const sach = s.replace(NHAN, " ").replace(/[ \t]{2,}/g, " ");
      // Mẩu chỉ có mỗi nhãn thì bỏ hẳn, đừng để lại khoảng trắng mồ côi.
      if (!sach.trim()) continue;
      ra.push(sach === s ? c : { t: c.t, d: c.d, s: sach, ev: c.ev });
    }
    return ra;
  }

  /* ================================================================== */
  /* Tín hiệu ngắt câu                                                   */
  /* ================================================================== */

  const HET_CAU = /[。．！？!?…]$|[.!?]["'’”)]?$/;
  const PHAY = /[、，,]\s*$/;

  // Tiểu từ cuối câu, được phép bám sau đuôi vị ngữ: 〜ですね、〜ますか、〜だよ…
  const TIEU_TU = "(?:よね|ですね|ますね|かな|かね|わね|[かねよなわぞさ])?";

  /**
   * Đuôi CHẮC CHẮN kết câu. Đây là thể lịch sự và thể kết định — gặp là gần như
   * chắc chắn hết câu, nhất là trong bản tin và bài giảng.
   */
  const KET_MANH = new RegExp(
    "(?:でした|でしょう|です|ました|ませんでした|ません|ましょう|ます|" +
    "ください|なさい|であった|である|じゃない|ではない|ありません|いません)" +
    TIEU_TU + "$");

  /**
   * Đuôi CÓ THỂ kết câu: thể thường. Cho điểm nhẹ thôi, vì những đuôi này cũng
   * hay đứng giữa câu (thể liên thể đứng trước danh từ). Để nó cộng dồn với
   * khoảng lặng rồi mới đủ ngắt.
   */
  const KET_YEU = new RegExp(
    "(?:なかった|ない|たい|らしい|[うくぐすつぬぶむる]|た|だ)" + TIEU_TU + "$");

  /**
   * Đuôi KHÔNG THỂ kết câu. Gặp là chặn, dù có nghỉ bao lâu — vì đây đích thị là
   * người ta lấy hơi giữa chừng. Đây là luật quan trọng nhất trong cả tệp.
   *
   * Cố ý KHÔNG có か (kết câu hỏi), ね／よ／な／わ (tiểu từ cuối câu).
   */
  /**
   * Bẫy: vài chữ KẾT câu lại tình cờ kết thúc bằng một tiểu từ (「こんにちは」
   * kết bằng は). Chặn trước, kẻo luật TREO bên dưới hiểu nhầm.
   */
  const KHONG_TREO = /(?:こんにちは|こんばんは|おはようございます|おはよう|さようなら)$/;

  const TREO = new RegExp(
    "(?:けれども|けれど|けど|ので|のに|から|まで|より|ながら|つつ|ため|" +
    "という|といった|とか|って|たら|なら|ば|ず|し|て|で|" +
    "[のにをはがへともやで])$");

  /**
   * Mẩu KẾ TIẾP nguyên vẹn là một tiểu từ → chắc chắn chưa hết câu. Với phụ đề
   * tự sinh mỗi mẩu là một từ, nên phép so khớp nguyên mẩu này rất sắc.
   */
  const HAT_TREO = new RegExp(
    // Đuôi vị ngữ đứng riêng thành một mẩu (「ありません」+「でした」) cũng không
    // thể mở câu mới — đây chỉ là phần đuôi bị tách rời của câu đang dở.
    "^(?:ませんでした|でしょう|でした|です|ました|ません|ます|だった|である|ください|" +
    "けれども|けれど|けど|ので|のに|から|まで|より|など|ながら|つつ|ため|" +
    "という|ということ|といった|とか|って|たら|なら|ように|ような|" +
    "ぐらい|くらい|ほど|だけ|しか|ば|ず|し|て|" +
    "[はがをにへともやかで])$");

  /** Mở đầu câu mới: liên từ chuyển ý. Gặp là nên ngắt TRƯỚC nó. */
  const MO_DAU = new RegExp(
    "^(?:そして|しかし|ですから|だから|それでも|それから|それで|そのため|そこで|" +
    "つまり|また|まず|次に|最後に|では|じゃあ|さて|ところで|一方|ただし|ただ|" +
    "とにかく|実は|例えば|なぜなら|ちなみに|しかも|さらに|やはり|もちろん|でも)");

  // Tiếng có khoảng trắng (Anh…): không có hình thái để bám, nhưng vài chữ thì
  // chắc chắn không kết câu được, và vài chữ thì hay mở câu.
  const LA_TREO = /\b(?:a|an|the|of|to|in|on|at|for|and|or|but|with|from|by|as|that|which|who|is|are|was|were|be|been|being|has|have|had|will|would|can|could|should|not|very|my|your|his|her|its|our|their|this|these|those|some|any|no|if|when|while|about|into|than|then)$/i;
  const LA_MO = /^(?:but|and|so|however|then|now|well|okay|ok|actually|because|although|therefore|meanwhile|first|second|finally|anyway|besides)\b/i;

  /* ---- trọng số ---- */

  const D_HET_CAU   = 8.0;    // có dấu chấm thật thì khỏi bàn
  const D_PHAY      = -1.5;   // dấu phẩy: đích thị đang giữa câu
  const D_KET_MANH  = 1.6;
  const D_KET_YEU   = 0.5;
  const D_TREO      = -3.0;   // chặn mạnh
  const D_HAT_TREO  = -2.5;
  const D_MO_DAU    = 1.2;
  const D_HET_SK    = 0.35;   // hết một sự kiện phụ đề: gợi ý yếu thôi
  const H_NGHI      = 1.10;   // hệ số cho khoảng lặng đã chuẩn hoá
  const TRAN_NGHI   = 3.0;    // trần, kẻo một khoảng lặng 30 giây nuốt hết mọi luật
  const D_NGHI_HAN  = 1.2;    // nghỉ hẳn (≥2,5 lần nhịp thường) thì cộng thêm

  const NGUONG = 1.0;         // tổng điểm từ đây trở lên thì ngắt

  const NGAN = 14;            // dưới ngần này ký tự thì chưa đáng gọi là câu
  const D_NGAN = -2.0;

  /* ================================================================== */
  /* Nhịp nghỉ                                                           */
  /* ================================================================== */

  const LANG_TOI_THIEU = 0.15;   // dưới mức này coi như nói liền, không phải nghỉ
  const CUA = 30;                // ±30 mẩu quanh chỗ đang xét

  function trungVi(xs) {
    if (!xs.length) return 0;
    const a = xs.slice().sort((x, y) => x - y);
    const g = a.length >> 1;
    return a.length % 2 ? a[g] : (a[g - 1] + a[g]) / 2;
  }

  /**
   * Với mỗi ranh giới, trả về "một khoảng nghỉ bình thường ở đoạn này dài bao
   * nhiêu giây" — để rồi đo mọi khoảng lặng theo tỉ lệ với nó.
   *
   * Lấy trung vị (không lấy trung bình) vì một khoảng lặng 20 giây giữa video
   * sẽ kéo lệch trung bình, còn trung vị thì không nhúc nhích.
   */
  function nhipNghi(lang) {
    const n = lang.length;
    const ra = new Array(n);
    const dang = [];
    for (let i = 0; i < n; i++) if (lang[i] >= LANG_TOI_THIEU) dang.push(lang[i]);
    // Ít mẫu quá thì đừng tin: trung vị của một hai khoảng lặng chính là khoảng
    // lặng đó, đo theo nó thì mọi chỗ nghỉ đều hoá ra "bình thường". Lúc ấy quay
    // về một con số tuyệt đối cho lành.
    const chung = dang.length >= 4 ? trungVi(dang) : 0.6;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - CUA), b = Math.min(n, i + CUA + 1);
      const m = [];
      for (let j = a; j < b; j++) if (lang[j] >= LANG_TOI_THIEU) m.push(lang[j]);
      const v = m.length >= 8 ? trungVi(m) : chung;
      ra[i] = Math.min(1.6, Math.max(0.30, v));
    }
    return ra;
  }

  /* ================================================================== */
  /* Chấm điểm                                                           */
  /* ================================================================== */

  /**
   * Điểm "tĩnh" của ranh giới sau mẩu thứ i: mọi thứ không phụ thuộc vào việc
   * câu hiện tại đã dài bao nhiêu (phần đó tính sau, vì nó phụ thuộc vào các
   * chỗ ngắt đã chọn trước đó).
   *
   * @param duoi  chữ tính tới hết mẩu i (chỉ cần cái đuôi)
   * @param sau   mẩu kế tiếp, null nếu hết
   */
  function diemTinh(duoi, mauSau, lang, nhip, nhat, coCJK) {
    let d = 0;

    // 1. Khoảng lặng, đo theo nhịp của chính đoạn này.
    const ti = lang / nhip;
    d += Math.min(TRAN_NGHI, ti) * H_NGHI;
    if (ti >= 2.5 && lang >= 1.0) d += D_NGHI_HAN;

    // 2. Dấu câu — bản phụ đề do người làm mới có, mà có thì tin tuyệt đối.
    if (HET_CAU.test(duoi)) return d + D_HET_CAU;
    if (PHAY.test(duoi)) d += D_PHAY;

    // 3. Hình thái đuôi câu.
    if (coCJK) {
      if (KHONG_TREO.test(duoi)) d += D_KET_MANH;
      else if (KET_MANH.test(duoi)) d += D_KET_MANH;
      else if (TREO.test(duoi)) d += D_TREO;
      else if (KET_YEU.test(duoi)) d += D_KET_YEU;
    } else if (LA_TREO.test(duoi)) {
      d += D_TREO;
    }

    // 4. Mẩu kế tiếp nói gì về chỗ này.
    if (mauSau) {
      if (coCJK) {
        if (HAT_TREO.test(mauSau)) d += D_HAT_TREO;
        else if (MO_DAU.test(mauSau)) d += D_MO_DAU;
      } else if (LA_MO.test(mauSau)) {
        d += D_MO_DAU;
      }
    }

    // 5. Hết một sự kiện phụ đề của YouTube. Chỗ xuống dòng của họ không đáng
    //    tin để làm ranh giới câu — đó chính là thứ mình đang sửa — nhưng nó
    //    cũng không rơi hoàn toàn ngẫu nhiên, nên nhận một tí điểm.
    if (nhat) d += D_HET_SK;

    return d;
  }

  /** Áp lực độ dài: quá ngắn thì ghì lại, quá dài thì đẩy cho ngắt. */
  function apLuc(L, dai) {
    if (L < NGAN) return D_NGAN * (1 - L / NGAN);
    if (L > dai) return Math.min(2.5, (L - dai) / (dai * 0.75));
    return 0;
  }

  /* ================================================================== */
  /* Ghép                                                                */
  /* ================================================================== */

  function ghepCau(cues, opt) {
    const o = opt || {};
    const cs = locNhieu(cues || []);
    const n = cs.length;
    if (!n) return [];

    // Nối một lần cho cả bản, ghi lại mỗi mẩu nằm ở quãng nào. Cắt câu về sau
    // chỉ là chọn ranh giới trên chuỗi này, nên chữ chắc chắn không xê dịch.
    let chu = "";
    const viTri = new Array(n);
    for (let i = 0; i < n; i++) {
      const moi = noiChu(chu, cs[i].s);
      viTri[i] = { a: moi.length - cs[i].s.length, b: moi.length };
      chu = moi;
    }

    const coCJK = CJK.test(chu);
    const DAI = o.dai || (coCJK ? 60 : 110);      // ngưỡng bắt đầu ép ngắt
    const NG = o.nguong == null ? NGUONG : o.nguong;

    // Khoảng lặng trước mẩu kế tiếp.
    const lang = new Array(n);
    for (let i = 0; i < n; i++) {
      const sau = cs[i + 1];
      lang[i] = sau ? Math.max(0, sau.t - (cs[i].t + cs[i].d)) : Infinity;
    }
    const nhip = nhipNghi(lang.map((g) => (g === Infinity ? 0 : g)));

    // Lượt 1: điểm tĩnh.
    const diem = new Array(n);
    for (let i = 0; i < n; i++) {
      diem[i] = diemTinh(
        chu.slice(Math.max(0, viTri[i].b - 24), viTri[i].b),
        cs[i + 1] ? cs[i + 1].s.trim() : null,
        lang[i] === Infinity ? 99 : lang[i],
        nhip[i],
        !!cs[i].ev,
        coCJK);
    }

    // Lượt 2: chọn chỗ ngắt. Khi câu chạm trần mà chưa gặp chỗ nào đủ điểm thì
    // QUAY LUI, cắt ở chỗ điểm cao nhất trong đoạn — đây là điều mà cách cắt cũ
    // (chặt đúng ký tự thứ N) không làm được.
    const TRAN = DAI * 3;
    const moc = [];
    let dau = 0, tot = -1, diemTot = -Infinity;
    for (let i = 0; i < n; i++) {
      const L = viTri[i].b - viTri[dau].a;
      const d = diem[i] + apLuc(L, DAI);
      if (d > diemTot) { diemTot = d; tot = i; }
      if (i === n - 1) { moc.push(i); break; }
      if (d >= NG) {
        moc.push(i);
        dau = i + 1; tot = -1; diemTot = -Infinity;
        continue;
      }
      if (L >= TRAN) {
        const c = tot >= 0 ? tot : i;
        moc.push(c);
        dau = c + 1; i = c; tot = -1; diemTot = -Infinity;
      }
    }

    // Lượt 3: dựng câu.
    const ra = [];
    let k = 0;
    for (const het of moc) {
      const c0 = viTri[k].a, c1 = viTri[het].b;
      let s = chu.slice(c0, c1);
      // Mẩu đầu câu có thể mang sẵn dấu cách ở đầu (phụ đề tiếng có khoảng
      // trắng); gạt đi rồi dời mốc theo, chứ không đụng vào chữ.
      const bo = s.length - s.replace(/^\s+/, "").length;
      s = s.slice(bo);
      const goc0 = c0 + bo;
      const manh = [];
      for (let i = k; i <= het; i++) {
        const a = Math.max(0, viTri[i].a - goc0);
        const b = Math.max(a, viTri[i].b - goc0);
        if (b > a) manh.push({ t: cs[i].t, d: cs[i].d, a, b });
      }
      if (s.trim()) {
        ra.push({ t: cs[k].t, tEnd: cs[het].t + cs[het].d, s, manh });
      }
      k = het + 1;
    }
    return ra;
  }

  goc.CatCau = { ghepCau, noiChu, locNhieu };
})(typeof self !== "undefined" ? self : this);
