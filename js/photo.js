// «Фото з пробіжки»: фото + скріншот зі Strava/Garmin → пост або сторіс у фірмовому мінімалістичному стилі.
// Усе в браузері: контур маршруту виділяється зі скріншота за кольором, цифри зчитує Tesseract.js (OCR), малює canvas.
(function () {
  const $ = (id) => document.getElementById(id);
  const ORANGE = "#f85a0a";
  const GRAPHITE = "#26262b";
  const MAX_SIDE = 2000; // великі фото з телефона зменшуємо, щоб не вичерпати пам'ять

  const FORMATS = {
    post: { w: 1080, h: 1350 }, // Instagram-стрічка 4:5
    story: { w: 1080, h: 1920 }, // сторіс 9:16
  };
  const STYLES = [
    { id: "classic", name: "Класика" },
    { id: "numbers", name: "Цифри" },
    { id: "route", name: "Маршрут" },
    { id: "frame", name: "Рамка" },
  ];

  const state = { photo: null, shot: null, route: null, style: "classic", mode: "normal", course: "13", fmt: "post", fx: 50, fy: 20, zoom: 100 };

  const logoWhite = new Image();
  logoWhite.src = "assets/logo-white.png";
  const logoColor = new Image();
  logoColor.src = "assets/logo.png";

  // ---------- Завантаження зображень ----------

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c);
      };
      img.onerror = () => reject(new Error("image"));
      img.src = url;
    });
  }

  // ---------- Контур маршруту зі скріншота ----------

  // Мінімум/максимум у квадратному вікні (роздільно по осях): ерозія й розширення маски
  function boxFilter(src, w, h, r, takeMax) {
    const tmp = new Uint8Array(w * h);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = takeMax ? 0 : 255;
        const a = Math.max(0, x - r);
        const b = Math.min(w - 1, x + r);
        for (let i = a; i <= b; i++) {
          const s = src[y * w + i];
          if (takeMax ? s > v : s < v) v = s;
        }
        tmp[y * w + x] = v;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let v = takeMax ? 0 : 255;
        const a = Math.max(0, y - r);
        const b = Math.min(h - 1, y + r);
        for (let i = a; i <= b; i++) {
          const s = tmp[i * w + x];
          if (takeMax ? s > v : s < v) v = s;
        }
        out[y * w + x] = v;
      }
    }
    return out;
  }

  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h);
    const out = new Uint8Array(w * h);
    const n = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += src[y * w + Math.min(w - 1, Math.max(0, i))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = sum / n;
        sum += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += tmp[Math.min(h - 1, Math.max(0, i)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = Math.round(sum / n);
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  // Зв'язні області маски (8 сусідів), повертає мітки й розміри
  function components(mask, w, h, thr) {
    const lab = new Int32Array(w * h);
    const sizes = [0];
    const queue = new Int32Array(w * h);
    let n = 0;
    for (let i = 0; i < w * h; i++) {
      if (mask[i] <= thr || lab[i]) continue;
      n++;
      let head = 0;
      let tail = 0;
      queue[tail++] = i;
      lab[i] = n;
      let size = 0;
      while (head < tail) {
        const p = queue[head++];
        size++;
        const px = p % w;
        const py = (p / w) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const q = ny * w + nx;
            if (mask[q] > thr && !lab[q]) {
              lab[q] = n;
              queue[tail++] = q;
            }
          }
        }
      }
      sizes.push(size);
    }
    return { lab, sizes };
  }

  // Знаходить на скріншоті слід маршруту (за кольором) і готує тонку помаранчеву лінію.
  // target — колір сліду [r,g,b]; за замовчуванням помаранчевий Strava.
  function extractRoute(shot, target) {
    const k = Math.min(1, 1300 / shot.width);
    const w = Math.round(shot.width * k);
    const h = Math.round(shot.height * k);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cx = c.getContext("2d", { willReadFrequently: true });
    cx.drawImage(shot, 0, 0, w, h);
    const data = cx.getImageData(0, 0, w, h).data;
    const [tr, tg, tb] = target || [252, 82, 0];
    const mask = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const d = Math.hypot(data[i] - tr, data[i + 1] - tg, data[i + 2] - tb);
      const a = Math.min(1, Math.max(0, 1 - (d - 40) / 70) * 1.5);
      mask[p] = a * 255;
    }
    // Великі суцільні плями (кнопки, значки) не є маршрутом: тонка лінія зникає при ерозії, пляма лишається
    const bin = mask.map((v) => (v > 128 ? 255 : 0));
    const core = boxFilter(bin, w, h, 5, false);
    const blobs = boxFilter(core, w, h, 8, true);
    for (let i = 0; i < mask.length; i++) if (blobs[i] > 0) mask[i] = 0;
    // Лишаємо найбільші частини (маршрут може бути розірваний «прихованим стартом»)
    const { lab, sizes } = components(mask, w, h, 60);
    const biggest = Math.max(0, ...sizes);
    if (biggest < 150) return null;
    const keep = sizes.map((s) => s >= Math.max(120, biggest * 0.12));
    // Сторонні помаранчеві штрихи (риска, значок, підпис) далеко від головного маршруту відкидаємо:
    // інакше вони розтягують область обрізання, і контур «з'їжджає» на фото. Лишаємо лише частини поруч із найбільшою.
    const main = sizes.indexOf(biggest);
    let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
    const box = sizes.map(() => [w, h, 0, 0]);
    for (let i = 0; i < lab.length; i++) {
      const l = lab[i];
      if (!l) continue;
      const x = i % w;
      const y = (i / w) | 0;
      const b = box[l];
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
    [bx0, by0, bx1, by1] = box[main];
    const gap = 0.18 * Math.max(bx1 - bx0, by1 - by0, 60);
    for (let l = 1; l < sizes.length; l++) {
      if (l === main || !keep[l]) continue;
      const b = box[l];
      const near = b[2] >= bx0 - gap && b[0] <= bx1 + gap && b[3] >= by0 - gap && b[1] <= by1 + gap;
      if (!near) keep[l] = false;
    }
    let x0 = w, y0 = h, x1 = 0, y1 = 0, count = 0;
    for (let i = 0; i < mask.length; i++) {
      if (lab[i] && !keep[lab[i]]) mask[i] = 0;
      if (mask[i] > 60) {
        const x = i % w;
        const y = (i / w) | 0;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        count++;
      }
    }
    if (count < 150) return null;
    const pad = 20;
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(w - 1, x1 + pad);
    y1 = Math.min(h - 1, y1 + pad);
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    const joined = boxFilter(mask, w, h, 1, true); // зашиваємо тонкі розриви
    // Маску збільшуємо (канвасом, зі згладжуванням), стоншуємо й підсилюємо: виходить тонка рівна лінія
    const S = Math.max(1, Math.min(4, Math.round(1300 / cw)));
    const small = document.createElement("canvas");
    small.width = cw;
    small.height = ch;
    const sg = small.getContext("2d");
    const sim = sg.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const v = joined[(y + y0) * w + (x + x0)];
        const o = (y * cw + x) * 4;
        sim.data[o] = sim.data[o + 1] = sim.data[o + 2] = 255;
        sim.data[o + 3] = v;
      }
    }
    sg.putImageData(sim, 0, 0);
    const big = document.createElement("canvas");
    big.width = cw * S;
    big.height = ch * S;
    const bg = big.getContext("2d", { willReadFrequently: true });
    bg.imageSmoothingQuality = "high";
    bg.drawImage(small, 0, 0, big.width, big.height);
    const bd = bg.getImageData(0, 0, big.width, big.height).data;
    const alpha = new Uint8Array(big.width * big.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = bd[i * 4 + 3];
    const thinned = boxBlur(boxFilter(alpha, big.width, big.height, Math.max(2, Math.round(S * 1.4)), false), big.width, big.height, 2);
    const out = document.createElement("canvas");
    out.width = big.width;
    out.height = big.height;
    const og = out.getContext("2d");
    const oim = og.createImageData(out.width, out.height);
    for (let i = 0; i < thinned.length; i++) {
      oim.data[i * 4] = 248;
      oim.data[i * 4 + 1] = 90;
      oim.data[i * 4 + 2] = 10;
      oim.data[i * 4 + 3] = Math.min(255, thinned[i] * 2.2);
    }
    og.putImageData(oim, 0, 0);
    return { thin: out, ratio: cw / ch };
  }

  // ---------- Розпізнавання цифр (Tesseract.js) ----------

  const TESS_VER = "7.0.0";
  const CDN = "https://cdn.jsdelivr.net/npm";
  const workers = {};
  let tessLoading = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("load"));
      document.head.appendChild(s);
    });
  }

  async function getWorker(lang) {
    if (!window.Tesseract) {
      tessLoading = tessLoading || loadScript(`${CDN}/tesseract.js@${TESS_VER}/dist/tesseract.min.js`);
      await tessLoading;
    }
    if (!workers[lang]) {
      workers[lang] = Tesseract.createWorker(lang, 1, {
        workerPath: `${CDN}/tesseract.js@${TESS_VER}/dist/worker.min.js`,
        corePath: `${CDN}/tesseract.js-core@${TESS_VER}`,
        langPath: `${CDN}/@tesseract.js-data/${lang}@1.0.0/4.0.0_best_int`,
      });
    }
    return workers[lang];
  }

  // «1h 15m» → 1:15, «58m 36s» → 58:36, «1:15:20», «1 год 15 хв»
  function parseStats(raw) {
    const t = String(raw || "").replace(/ /g, " ");
    const out = {};
    const dist = [...t.matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:km|кm|км)\b/gi)].map((m) => m[1].replace(",", "."));
    const withDec = dist.find((d) => d.includes("."));
    if (withDec || dist[0]) out.km = withDec || dist[0];
    const pace = t.match(/(\d{1,2}):(\d{2})\s*\/\s*(?:km|кm|км)/i);
    if (pace) out.pace = `${parseInt(pace[1], 10)}:${pace[2]}`;
    let m;
    if ((m = t.match(/(\d{1,2})\s*h\s*(\d{1,2})\s*m(?:in)?\b/i))) out.time = `${m[1]}:${m[2].padStart(2, "0")}`;
    else if ((m = t.match(/(\d{1,2})\s*(?:год|г)\.?\s*(\d{1,2})\s*(?:хв|х)\b/i))) out.time = `${m[1]}:${m[2].padStart(2, "0")}`;
    else if ((m = t.match(/(?:Time|Час|Тривалість)\D{0,14}(\d{1,2}:\d{2}:\d{2})/i))) out.time = m[1];
    else if ((m = t.match(/\b(\d{1,2}:\d{2}:\d{2})\b/))) out.time = m[1];
    else if ((m = t.match(/(\d{1,3})\s*m(?:in)?\s*(\d{1,2})\s*s\b/i))) out.time = `${m[1]}:${m[2].padStart(2, "0")}`;
    else if ((m = t.match(/(?:Time|Час)\D{0,14}(\d{1,3}:\d{2})\b/i))) out.time = m[1];
    return out;
  }

  async function ocrShot(canvas, onStep) {
    const k = Math.min(1, 1600 / canvas.width);
    const c = document.createElement("canvas");
    c.width = Math.round(canvas.width * k);
    c.height = Math.round(canvas.height * k);
    c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
    onStep("Завантажую модуль розпізнавання (вперше до ~20 с)…");
    let text = "";
    const w1 = await getWorker("eng");
    onStep("Читаю цифри…");
    text = (await w1.recognize(c)).data.text;
    let stats = parseStats(text);
    if (!stats.km) {
      // Інтерфейс українською: потрібна українська модель
      onStep("Читаю цифри (українська)…");
      const w2 = await getWorker("ukr");
      text += "\n" + (await w2.recognize(c)).data.text;
      stats = parseStats(text);
    }
    return stats;
  }

  // ---------- Малювання ----------

  const MONT = (px, wt) => `${wt} ${px}px Montserrat, Arial, sans-serif`;

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // Текст: top — верх рядка (як у CSS із line-height lh), ls — інтервал у em; повертає ширину
  function T(g, s, x, top, size, wt, o) {
    o = o || {};
    const lh = o.lh || 1.22;
    const base = top + ((lh - 1.22) / 2 + 0.97) * size;
    const str = o.upper ? String(s).toUpperCase() : String(s);
    g.save();
    g.font = MONT(size, wt);
    g.fillStyle = o.color || "#fff";
    g.globalAlpha = o.alpha == null ? 1 : o.alpha;
    g.textBaseline = "alphabetic";
    if (o.shadow) {
      g.shadowColor = "rgba(0,0,0,.4)";
      g.shadowBlur = o.shadow;
      g.shadowOffsetY = 2;
    }
    const ls = (o.em || 0) * size;
    const chars = [...str];
    const widths = chars.map((ch) => g.measureText(ch).width);
    const total = ls ? widths.reduce((a, b) => a + b, 0) + ls * (chars.length - 1) : g.measureText(str).width;
    let sx = x;
    if (o.align === "right") sx = x - total;
    else if (o.align === "center") sx = x - total / 2;
    if (ls) {
      let px = sx;
      chars.forEach((ch, i) => {
        g.fillText(ch, px, base);
        px += widths[i] + ls;
      });
    } else g.fillText(str, sx, base);
    g.restore();
    return total;
  }

  const CAP = { upper: true, em: 0.3, alpha: 0.82 };

  function cover(g, img, x, y, w, h, fx, fy, z) {
    const s = Math.max(w / img.width, h / img.height) * (z || 1);
    const dw = img.width * s;
    const dh = img.height * s;
    g.drawImage(img, x - (dw - w) * (fx / 100), y - (dh - h) * (fy / 100), dw, dh);
  }

  function blurred(img, w, h, fx, fy) {
    const small = document.createElement("canvas");
    small.width = Math.round(w / 24);
    small.height = Math.round(h / 24);
    const sg = small.getContext("2d");
    sg.imageSmoothingQuality = "high";
    cover(sg, img, 0, 0, small.width, small.height, fx, fy, 1);
    return small;
  }

  function withFilter(g, f, fn) {
    g.save();
    g.filter = f;
    fn();
    g.restore();
  }

  function linear(g, x0, y0, x1, y1, stops) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([p, c]) => gr.addColorStop(p, c));
    return gr;
  }

  let grainPattern = null;
  function grain(g, w, h) {
    if (!grainPattern) {
      const n = document.createElement("canvas");
      n.width = n.height = 256;
      const ng = n.getContext("2d");
      const im = ng.createImageData(256, 256);
      for (let i = 0; i < im.data.length; i += 4) {
        const v = 128 + (Math.random() - 0.5) * 140;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
        im.data[i + 3] = 255;
      }
      ng.putImageData(im, 0, 0);
      grainPattern = g.createPattern(n, "repeat");
    }
    g.save();
    g.globalAlpha = 0.07;
    g.globalCompositeOperation = "overlay";
    g.fillStyle = grainPattern;
    g.fillRect(0, 0, w, h);
    g.restore();
  }

  function logoMark(g, x, y, h, color) {
    const img = color ? logoColor : logoWhite;
    if (!img.complete || !img.naturalWidth) return;
    const w = h * (img.naturalWidth / img.naturalHeight);
    g.save();
    g.globalAlpha = 0.95;
    g.drawImage(img, x, y, w, h);
    g.restore();
  }

  // maxH — стеля висоти: контур не опускається нижче безпечної зони (щоб не заходив на людей).
  // Якщо не вміщується, стискаємо його, лишаючи прив'язку до правого краю (x + w).
  function drawRoute(g, x, y, w, shadow, maxH) {
    if (!state.route) return 0;
    let h = w / state.route.ratio;
    if (maxH && h > maxH) {
      const nw = maxH * state.route.ratio;
      x += w - nw;
      w = nw;
      h = maxH;
    }
    g.save();
    if (shadow) {
      // Темне гало, щоб помаранчева лінія читалась і на світлому тлі (стіна, небо)
      g.shadowColor = "rgba(10,12,24,.75)";
      g.shadowBlur = 10;
      g.drawImage(state.route.thin, x, y, w, h);
      g.shadowBlur = 4;
      g.shadowOffsetY = 1;
    }
    g.drawImage(state.route.thin, x, y, w, h);
    g.restore();
    return h;
  }

  function values() {
    const fix = (s) => s.trim();
    let km = fix($("ph-km").value).replace(",", ".");
    const time = fix($("ph-time").value);
    let pace = fix($("ph-pace").value);
    if (!pace) pace = autoPace(km, time);
    return {
      km: km || "—",
      time: time || "—",
      timeUnit: timeUnit(time),
      pace: pace || "—",
      elev: fix($("ph-elev").value).replace(/[^\d]/g, "") || String((COURSES[state.course] || COURSES["13"]).gain),
      course: state.course,
      headline: fix($("ph-headline").value) || "Ми пробігли",
      sub: fix($("ph-sub").value),
    };
  }

  // Двоскладовий час: «1:15» (перша частина < 10) — год:хв, інакше хв:с
  function timeUnit(t) {
    const p = String(t).split(":");
    if (p.length === 2 && /^\d+$/.test(p[0]) && /^\d+$/.test(p[1])) return parseInt(p[0], 10) < 10 ? "год" : "хв";
    return "";
  }

  function autoPace(kmStr, timeStr) {
    const km = parseFloat(String(kmStr).replace(",", "."));
    const parts = String(timeStr).split(":").map((x) => parseInt(x, 10));
    if (!(km > 0) || parts.some((p) => !Number.isFinite(p))) return "";
    let sec;
    if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) sec = parts[0] < 10 ? parts[0] * 3600 + parts[1] * 60 : parts[0] * 60 + parts[1];
    else return "";
    const p = sec / km;
    return `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, "0")}`;
  }

  const placeholderPhoto = () => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 1600;
    const g = c.getContext("2d");
    g.fillStyle = linear(g, 0, 0, 0, 1600, [[0, "#3b6fb6"], [0.55, "#9aa6b8"], [1, "#4a4a52"]]);
    g.fillRect(0, 0, 1200, 1600);
    return c;
  };

  // Фото на повну картку: пост — на всю ширину; сторіс — смуга 3:4 по центру з м'яким продовженням розмиттям
  function paintPhoto(g, fmt, photo) {
    const { w, h } = FORMATS[fmt];
    const { fx, fy } = state;
    const zm = state.zoom / 100;
    const f = "saturate(.86) contrast(1.06) brightness(.98)";
    if (fmt === "post") {
      withFilter(g, f, () => cover(g, photo, 0, 0, w, h, fx, fy, zm));
      return;
    }
    g.fillStyle = "#1b1c20";
    g.fillRect(0, 0, w, h);
    g.save();
    g.filter = "none";
    g.drawImage(blurred(photo, w, h, fx, fy), 0, 0, w, h);
    g.restore();
    g.fillStyle = "rgba(20,21,26,.62)";
    g.fillRect(0, 0, w, h);
    const strip = document.createElement("canvas");
    strip.width = w;
    strip.height = 1440;
    const sg = strip.getContext("2d");
    withFilter(sg, f, () => cover(sg, photo, 0, 0, w, 1440, fx, fy, zm));
    sg.globalCompositeOperation = "destination-in";
    sg.fillStyle = linear(sg, 0, 0, 0, 1440, [[0, "rgba(0,0,0,0)"], [220 / 1440, "#000"], [1220 / 1440, "#000"], [1, "rgba(0,0,0,0)"]]);
    sg.fillRect(0, 0, w, 1440);
    g.drawImage(strip, 0, 240);
  }

  function toneAndFade(g, fmt, strongTop) {
    const { w, h } = FORMATS[fmt];
    g.fillStyle = linear(g, 0, 0, 0, h, [[0, `rgba(12,22,48,${strongTop ? 0.55 : 0.42})`], [strongTop ? 0.5 : 0.38, "rgba(12,22,48,0)"], [1, "rgba(12,22,48,0)"]]);
    g.fillRect(0, 0, w, h);
    const top = fmt === "post" ? 1000 : 1290;
    g.fillStyle = linear(g, 0, h, 0, top, [[0, fmt === "post" ? "rgba(20,20,24,.92)" : "rgba(20,20,24,.96)"], [0.4, fmt === "post" ? "rgba(20,20,24,.55)" : "rgba(20,20,24,.6)"], [1, "rgba(20,20,24,0)"]]);
    g.fillRect(0, top, w, h - top);
  }

  function topBar(g, fmt, o) {
    const S = fmt === "story";
    const M = S ? 64 : 56;
    const { w } = FORMATS[fmt];
    logoMark(g, M, M - 6, S ? 74 : 62, o && o.colorLogo);
    T(g, "#TitanClubRivne", w - M, M + (S ? 14 : 10), S ? 20 : 17, 600, { ...CAP, align: "right", color: o && o.ink });
    g.fillStyle = (o && o.hair) || "rgba(255,255,255,.4)";
    g.fillRect(M, M + (S ? 100 : 84), w - 2 * M, 1);
  }

  function footer(g, fmt, o) {
    const S = fmt === "story";
    const M = S ? 64 : 56;
    const { w, h } = FORMATS[fmt];
    const fy = S ? h - M - 30 : h - M + 4;
    const sz = S ? 19 : 15;
    const ink = (o && o.ink) || "#fff";
    g.fillStyle = (o && o.hair) || "rgba(255,255,255,.3)";
    g.fillRect(M, fy - (S ? 22 : 18), w - 2 * M, 1);
    const w1 = T(g, "Titan Club Rivne", M, fy, sz, 600, { upper: true, em: 0.34, alpha: 0.82, color: ink });
    const w2 = T(g, " · ", M + w1 + sz * 0.34, fy, sz, 600, { em: 0.34, color: ORANGE });
    T(g, "Premium", M + w1 + w2 + sz * 0.68, fy, sz, 600, { upper: true, em: 0.34, alpha: 0.82, color: ink });
    T(g, "titan run", w - M, fy, sz, 600, { upper: true, em: 0.34, alpha: 0.6, align: "right", color: ink });
  }

  // Відстань | Час | Темп (нижній блок). Для світлих підкладок ink/hair міняються.
  function statsBlock(g, fmt, v, y0, o) {
    const S = fmt === "story";
    const M = S ? 64 : 56;
    const { w } = FORMATS[fmt];
    o = o || {};
    const ink = o.ink || "#fff";
    const hair = o.hair || "rgba(255,255,255,.32)";
    const lab = S ? 19 : 15;
    const label = (x, y, text, accent) => {
      if (accent) {
        g.fillStyle = ORANGE;
        g.fillRect(x, y + lab * 0.5, S ? 34 : 26, 3);
      }
      T(g, text, x + (accent ? (S ? 48 : 40) : 0), y, lab, 600, { upper: true, em: 0.3, alpha: 0.82, color: ink });
    };
    const k = o.scale || 1;
    if (S && !o.row) {
      const nsz = 215 * k;
      label(M, y0, "Відстань", true);
      const kw = T(g, v.km, M - 6, y0 + 50, nsz, 200, { lh: 0.8, em: -0.04, color: ink });
      T(g, "КМ", M - 6 + kw + 18, y0 + 50 + nsz * 0.76 - 44 * 0.97 - 4, 44, 600, { upper: true, em: 0.12, color: ORANGE });
      const by2 = y0 + 300 * k;
      g.fillStyle = hair;
      g.fillRect(M, by2 - 30, w - 2 * M, 1);
      label(M, by2, "Час");
      const tw = T(g, v.time, M, by2 + 40, 84, 400, { lh: 1, em: -0.02, color: ink });
      if (v.timeUnit) T(g, v.timeUnit, M + tw + 10, by2 + 40 + 84 * 0.86 - 30 * 0.97, 30, 500, { upper: true, em: 0.08, alpha: 0.75, color: ink });
      g.fillStyle = hair;
      g.fillRect(M + 420, by2, 1, 120);
      label(M + 460, by2, "Темп");
      const pw = T(g, v.pace, M + 460, by2 + 40, 84, 400, { lh: 1, em: -0.02, color: ink });
      T(g, "/км", M + 460 + pw + 10, by2 + 40 + 84 * 0.86 - 30 * 0.97, 30, 500, { upper: true, em: 0.08, alpha: 0.75, color: ink });
    } else {
      const nsz = 134 * k;
      label(M, y0, "Відстань", true);
      const kw = T(g, v.km, M - 4, y0 + 40, nsz, 200, { lh: 0.8, em: -0.04, color: ink });
      T(g, "КМ", M - 4 + kw + 12, y0 + 40 + nsz * 0.76 - 26 * 0.97 - 3, 26, 600, { upper: true, em: 0.12, color: ORANGE });
      g.fillStyle = hair;
      g.fillRect(M + 520, y0, 1, 130);
      label(M + 556, y0, "Час");
      const tw = T(g, v.time, M + 556, y0 + 46, 62, 400, { lh: 1, em: -0.02, color: ink });
      if (v.timeUnit) T(g, v.timeUnit, M + 556 + tw + 6, y0 + 46 + 62 * 0.86 - 19 * 0.97, 19, 500, { upper: true, em: 0.08, alpha: 0.75, color: ink });
      g.fillStyle = hair;
      g.fillRect(M + 756, y0, 1, 130);
      label(M + 792, y0, "Темп");
      const pw = T(g, v.pace, M + 792, y0 + 46, 62, 400, { lh: 1, em: -0.02, color: ink });
      T(g, "/км", M + 792 + pw + 6, y0 + 46 + 62 * 0.86 - 19 * 0.97, 19, 500, { upper: true, em: 0.08, alpha: 0.75, color: ink });
    }
  }

  // Заголовок: «Ми / пробігли.» (остання крапка помаранчева)
  function headline(g, fmt, v, ty) {
    const S = fmt === "story";
    const M = S ? 64 : 56;
    const size = S ? 118 : 84;
    const words = v.headline.split(/\s+/).filter(Boolean);
    const lines = words.length > 1 ? [words.slice(0, -1).join(" "), words[words.length - 1]] : [words[0] || ""];
    let y = ty;
    lines.forEach((ln, i) => {
      const last = i === lines.length - 1;
      const w1 = T(g, ln, M, y, size, 700, { lh: 0.98, em: -0.045 });
      if (last && !/[.!?…]$/.test(ln)) T(g, ".", M + w1 - size * 0.045, y, size, 700, { lh: 0.98, color: ORANGE });
      y += size * 0.98;
    });
    if (v.sub) T(g, v.sub, M, ty + (S ? 290 : 208), S ? 22 : 17, 600, { upper: true, em: 0.3, alpha: 0.85 });
  }


  // ---------- Трейл «Житомирські вертикалі» ----------

  // Профілі офіційних трас «Житомирських вертикалей» (висота, м; рівномірно по дистанції).
  // Знято з Garmin-профілю траси. Реальна дистанція й набір у бігуна можуть відрізнятись:
  // км, час і темп беруться зі скріншота бігуна, а профіль показує саму трасу.
  const COURSES = {
    "7": { km: 6.99, gain: 144, prof: [189, 187, 191, 194, 191, 187, 182, 180, 181, 182, 186, 192, 197, 203, 211, 213, 214, 212, 211, 208, 203, 199, 194, 190, 186, 181, 180, 181, 182, 185, 189, 193, 196, 199, 201, 202, 203, 204, 204, 205, 207, 208, 210, 212, 213, 214, 214, 214, 213, 212, 211, 210, 208, 206, 204, 204, 204, 204, 204, 203, 202, 198, 196, 192, 189, 186, 187, 190, 195, 201, 207, 213, 219, 224, 227, 228, 228, 228, 226, 224, 223, 219, 216, 211, 204, 198, 192, 190, 188, 187, 186, 186, 187, 188, 189, 191, 195, 197, 200, 203, 204, 203, 200, 198, 196, 196, 199, 202, 205, 206, 207, 207, 206, 203, 197, 191, 188, 186, 185, 185] },
    "13": { km: 13.48, gain: 265, prof: [188, 190, 192, 186, 181, 185, 195, 209, 214, 213, 209, 199, 189, 180, 180, 185, 193, 198, 202, 203, 204, 207, 211, 213, 214, 214, 211, 208, 205, 204, 204, 202, 196, 190, 185, 192, 206, 217, 226, 226, 221, 215, 206, 195, 191, 197, 205, 209, 210, 207, 205, 204, 206, 210, 214, 220, 224, 227, 229, 230, 230, 229, 227, 225, 220, 218, 212, 200, 190, 187, 185, 186, 189, 194, 201, 211, 219, 221, 221, 216, 210, 201, 195, 193, 193, 193, 199, 203, 204, 201, 195, 190, 188, 196, 203, 208, 207, 204, 202, 205, 208, 211, 213, 216, 218, 222, 225, 227, 225, 217, 207, 199, 196, 201, 204, 204, 200, 191, 186, 186] },
    "26": { km: 25.41, gain: 341, prof: [187, 191, 184, 193, 211, 210, 198, 182, 187, 197, 203, 208, 213, 214, 211, 206, 202, 194, 189, 206, 223, 223, 212, 196, 199, 206, 206, 207, 213, 220, 225, 224, 218, 208, 200, 192, 192, 197, 200, 206, 214, 217, 214, 211, 212, 216, 219, 220, 218, 216, 214, 209, 201, 196, 198, 202, 207, 207, 202, 204, 212, 219, 221, 223, 226, 229, 230, 230, 228, 225, 222, 217, 217, 222, 228, 235, 236, 234, 227, 221, 216, 213, 212, 211, 213, 220, 227, 230, 230, 227, 220, 209, 190, 186, 190, 201, 218, 220, 213, 199, 194, 195, 203, 201, 191, 196, 206, 206, 204, 209, 215, 219, 226, 224, 211, 199, 204, 203, 190, 186] },
  };

  const COURSE_LIST = ["7", "13", "26"]; // кнопка вмикається, якщо профіль є в COURSES

  function elevationProfile(course) {
    const pts = (COURSES[course] || COURSES["13"]).prof;
    const mn = Math.min(...pts);
    const mx = Math.max(...pts);
    return pts.map((v) => (v - mn) / (mx - mn));
  }

  function drawElevation(g, x, y, w, h, prof, S) {
    const px = (i) => x + (i / (prof.length - 1)) * w;
    const py = (v) => y + h - v * h * 0.92;
    g.save();
    g.beginPath();
    g.moveTo(x, y + h);
    prof.forEach((v, i) => g.lineTo(px(i), py(v)));
    g.lineTo(x + w, y + h);
    g.closePath();
    g.fillStyle = linear(g, 0, y, 0, y + h, [[0, "rgba(248,90,10,.55)"], [1, "rgba(248,90,10,0)"]]);
    g.fill();
    g.beginPath();
    prof.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v))));
    g.lineJoin = "round";
    g.lineWidth = S ? 5 : 4;
    g.strokeStyle = "#fff";
    g.shadowColor = "rgba(0,0,0,.45)";
    g.shadowBlur = 8;
    g.stroke();
    g.restore();
    const top = prof.indexOf(Math.max(...prof));
    return { x: px(top), y: py(prof[top]) };
  }

  function render(styleId, fmt, scale) {
    const { w, h } = FORMATS[fmt];
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * scale);
    cv.height = Math.round(h * scale);
    const g = cv.getContext("2d");
    g.scale(scale, scale);
    const v = values();
    const photo = state.photo || placeholderPhoto();
    const S = fmt === "story";
    const M = S ? 64 : 56;

    if (styleId === "frame") {
      // Світла рамка: фото у тонкому полі, цифри друкарськими літерами на кремовій підкладці
      const cream = "#efece6";
      const panel = S ? 300 : 272;
      const m = 36;
      g.fillStyle = cream;
      g.fillRect(0, 0, w, h);
      g.save();
      g.beginPath();
      g.rect(m, m, w - 2 * m, h - m - panel);
      g.clip();
      withFilter(g, "saturate(.88) contrast(1.05) brightness(.99)", () => cover(g, photo, m, m, w - 2 * m, h - m - panel, state.fx, state.fy, state.zoom / 100));
      g.fillStyle = linear(g, 0, m, 0, m + 420, [[0, "rgba(12,22,48,.38)"], [1, "rgba(12,22,48,0)"]]);
      g.fillRect(m, m, w - 2 * m, 420);
      g.restore();
      logoMark(g, m + 28, m + 24, S ? 64 : 54);
      T(g, "#TitanClubRivne", w - m - 28, m + 36, S ? 19 : 16, 600, { ...CAP, align: "right" });
      if (state.route) drawRoute(g, w - m - 28 - (S ? 200 : 150) + 6, m + (S ? 110 : 90), S ? 200 : 150, true, S ? 300 : 200);
      const ink = GRAPHITE;
      const hair = "rgba(38,38,43,.28)";
      const y0 = h - panel + (S ? 40 : 30);
      statsBlock(g, fmt, v, y0, { ink, hair, scale: 0.84, row: true });
      g.fillStyle = hair;
      g.fillRect(M, h - (S ? 62 : 50), w - 2 * M, 1);
      T(g, "Titan Club Rivne", M, h - (S ? 44 : 38), S ? 17 : 14, 600, { upper: true, em: 0.34, alpha: 0.7, color: ink });
      T(g, "Premium", w - M, h - (S ? 44 : 38), S ? 17 : 14, 600, { upper: true, em: 0.34, color: ORANGE, align: "right" });
      return cv;
    }

    paintPhoto(g, fmt, photo);
    toneAndFade(g, fmt, styleId === "numbers");
    grain(g, w, h);
    topBar(g, fmt);

    if (styleId === "classic") {
      headline(g, fmt, v, M + (S ? 190 : 150));
      drawRoute(g, w - M - (S ? 300 : 190) + 10, M + (S ? 150 : 112), S ? 300 : 190, true, S ? 440 : 280);
      statsBlock(g, fmt, v, S ? 1345 : 1100);
      footer(g, fmt);
    } else if (styleId === "numbers") {
      // Цифри вгорі, у небі: поміч для кадрів, де внизу немає місця
      const top = M + (S ? 150 : 120);
      const nsz = S ? 300 : 196;
      g.save();
      T(g, "Відстань", M + (S ? 48 : 40), top, S ? 19 : 15, 600, { upper: true, em: 0.3, alpha: 0.9, shadow: 10 });
      g.fillStyle = ORANGE;
      g.fillRect(M, top + (S ? 10 : 8), S ? 34 : 26, 3);
      const kw = T(g, v.km, M - 6, top + (S ? 52 : 42), nsz, 200, { lh: 0.8, em: -0.04, shadow: 24 });
      T(g, "КМ", M - 6 + kw + 18, top + (S ? 52 : 42) + nsz * 0.76 - 44 * 0.97, S ? 48 : 30, 600, { upper: true, em: 0.12, color: ORANGE, shadow: 10 });
      const ry = top + (S ? 52 : 42) + nsz * 0.95;
      const row = (x, label, val, suffix) => {
        T(g, label, x, ry, S ? 19 : 15, 600, { upper: true, em: 0.3, alpha: 0.9, shadow: 10 });
        const sz = S ? 86 : 58;
        const tw = T(g, val, x, ry + (S ? 40 : 30), sz, 400, { lh: 1, em: -0.02, shadow: 20 });
        if (suffix) T(g, suffix, x + tw + 8, ry + (S ? 40 : 30) + sz * 0.86 - 22 * 0.97, S ? 28 : 18, 500, { upper: true, em: 0.08, alpha: 0.85, shadow: 10 });
      };
      row(M, "Час", v.time, v.timeUnit);
      row(M + (S ? 380 : 300), "Темп", v.pace, "/км");
      g.restore();
      if (v.sub) T(g, v.sub, M, S ? 1500 : 1180, S ? 22 : 17, 600, { upper: true, em: 0.3, alpha: 0.85 });
      footer(g, fmt);
    } else if (styleId === "route") {
      // Маршрут — головний елемент: великий контур по центру неба
      const hMax = S ? 640 : 430; // висота контуру обмежена, щоб він не заходив на людей
      const ratio = state.route ? state.route.ratio : 0.7;
      const rw = Math.min(S ? 560 : 360, hMax * ratio);
      const ry = M + (S ? 190 : 150);
      T(g, v.headline, w / 2, M + (S ? 120 : 98), S ? 26 : 20, 600, { upper: true, em: 0.3, alpha: 0.9, align: "center" });
      drawRoute(g, (w - rw) / 2, ry, rw, true);
      if (!state.route) T(g, v.headline, w / 2, ry + 80, S ? 96 : 70, 700, { em: -0.045, align: "center" });
      statsBlock(g, fmt, v, S ? 1345 : 1100);
      footer(g, fmt);
    } else if (styleId === "vertical") {
      // Трейл «Житомирські вертикалі»: назва події + профіль набору висоти + цифри
      const v2 = v;
      const tsz = S ? 112 : 84;
      const ty = M + (S ? 190 : 150);
      g.fillStyle = ORANGE;
      g.fillRect(M, ty + 8, S ? 34 : 26, 3);
      T(g, "Трейл · 2026", M + (S ? 48 : 40), ty, S ? 19 : 15, 600, { upper: true, em: 0.3, alpha: 0.9, shadow: 10 });
      T(g, "Житомирські", M, ty + (S ? 40 : 32), tsz, 700, { lh: 0.98, em: -0.045, shadow: 20 });
      const vw = T(g, "вертикалі", M, ty + (S ? 40 : 32) + tsz * 0.98, tsz, 700, { lh: 0.98, em: -0.045, shadow: 20 });
      T(g, ".", M + vw - tsz * 0.045, ty + (S ? 40 : 32) + tsz * 0.98, tsz, 700, { lh: 0.98, color: ORANGE });
      T(g, v2.sub || v2.headline, M, ty + (S ? 40 : 32) + tsz * 1.96 + 14, S ? 22 : 17, 600, { upper: true, em: 0.3, alpha: 0.88, shadow: 10 });
      const ph = S ? 170 : 120; // профіль низько, у темній зоні, щоб не закривати людей на фото
      const py0 = (S ? 1345 : 1100) - ph - (S ? 40 : 34);
      const prof = elevationProfile(v2.course);
      const peak = drawElevation(g, M, py0, w - 2 * M, ph, prof, S);
      g.beginPath();
      g.arc(peak.x, peak.y, S ? 11 : 9, 0, Math.PI * 2);
      g.fillStyle = ORANGE;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = "#fff";
      g.stroke();
      if (v2.elev) {
        const lx = Math.min(Math.max(peak.x, M + 120), w - M - 120);
        T(g, "↑ +" + v2.elev + " м", lx, peak.y - (S ? 62 : 50), S ? 32 : 25, 600, { align: "center", shadow: 12 });
      }
      statsBlock(g, fmt, v, S ? 1345 : 1100);
      footer(g, fmt);
    }
    return cv;
  }

  // ---------- Інтерфейс ----------

  let renderTimer;
  let thumbTimer;
  let renderSeq = 0;

  const curStyle = () => (state.mode === "event" ? "vertical" : state.style);

  function drawMain() {
    const seq = ++renderSeq;
    const out = render(curStyle(), state.fmt, 1);
    if (seq !== renderSeq) return;
    const main = $("ph-canvas");
    main.width = out.width;
    main.height = out.height;
    main.getContext("2d").drawImage(out, 0, 0);
    $("ph-empty").hidden = !!state.photo;
  }

  function drawThumbs() {
    $("ph-presets").querySelectorAll("canvas").forEach((cv) => {
      const id = cv.dataset.preset;
      const f = FORMATS[state.fmt];
      const out = render(id, state.fmt, 0.17);
      cv.width = Math.round(f.w * 0.1);
      cv.height = Math.round(f.h * 0.1);
      cv.getContext("2d").drawImage(out, 0, 0, cv.width, cv.height);
    });
  }

  function schedule() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(drawMain, 80);
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(drawThumbs, 500);
  }

  function buildPresetPicker() {
    $("ph-presets").innerHTML = STYLES.map(
      (p) => `<button type="button" class="ph-preset${p.id === state.style ? " is-active" : ""}" data-preset="${p.id}"><canvas data-preset="${p.id}"></canvas><span>${p.name}</span></button>`
    ).join("");
  }

  function setStatus(id, text, bad) {
    const el = $(id);
    el.textContent = text || "";
    el.classList.toggle("is-bad", !!bad);
    el.hidden = !text;
  }

  async function fontsReady() {
    try {
      await Promise.all([200, 400, 500, 600, 700].map((wt) => document.fonts.load(`${wt} 40px Montserrat`)));
    } catch (e) {}
  }

  async function onPhoto(file) {
    if (!file) return;
    setStatus("ph-photo-status", "Завантажую фото…");
    try {
      state.photo = await loadImage(file);
      setStatus("ph-photo-status", "✓ Фото додано");
      await fontsReady();
      schedule();
    } catch (e) {
      setStatus("ph-photo-status", "Не вдалося відкрити це фото 😕", true);
    }
  }

  let shotSeq = 0;

  function analyzeShot(target) {
    state.route = extractRoute(state.shot, target);
    $("ph-pick").hidden = !!state.route;
    schedule();
    return !!state.route;
  }

  function fillFromStats(stats) {
    const set = (id, val) => {
      if (val) $(id).value = val;
    };
    set("ph-km", stats.km ? String(stats.km).replace(".", ",") : "");
    set("ph-time", stats.time);
    set("ph-pace", stats.pace);
    schedule();
  }

  async function onShot(file) {
    if (!file) return;
    const seq = ++shotSeq;
    setStatus("ph-shot-status", "Шукаю маршрут…");
    try {
      state.shot = await loadImage(file);
      const pick = $("ph-pick-canvas");
      pick.width = state.shot.width;
      pick.height = state.shot.height;
      pick.getContext("2d").drawImage(state.shot, 0, 0);
      await fontsReady();
    } catch (e) {
      return setStatus("ph-shot-status", "Не вдалося відкрити скріншот 😕", true);
    }
    await new Promise((r) => setTimeout(r, 30)); // даємо браузеру перемалювати стан: аналіз важкий
    const hasRoute = analyzeShot();
    if (!hasRoute) setStatus("ph-shot-status", "Маршрут не знайдено. Торкнись лінії маршруту нижче, і я виділю її за кольором. Цифри читаю…", true);
    try {
      const stats = await ocrShot(state.shot, (msg) => seq === shotSeq && setStatus("ph-shot-status", (hasRoute ? "✓ Маршрут знайдено. " : "") + msg));
      if (seq !== shotSeq) return;
      fillFromStats(stats);
      const found = [stats.km && `${stats.km} км`, stats.time && stats.time, stats.pace && `${stats.pace} /км`].filter(Boolean);
      const lost = ["км", "час", "темп"].filter((_, i) => ![stats.km, stats.time, stats.pace][i]);
      let msg = hasRoute ? "✓ Маршрут знайдено. " : "";
      msg += found.length ? `✓ Зчитано: ${found.join(" · ")}. Перевір цифри.` : "Цифри не вдалося зчитати: введи їх нижче.";
      if (found.length && lost.length) msg += ` Не знайшов: ${lost.join(", ")}.`;
      setStatus("ph-shot-status", msg, !found.length);
    } catch (e) {
      if (seq === shotSeq) setStatus("ph-shot-status", (hasRoute ? "✓ Маршрут знайдено. " : "") + "Не вдалося зчитати цифри (немає зв'язку?). Введи їх нижче.", true);
    }
  }

  $("ph-file").addEventListener("change", (e) => onPhoto(e.target.files[0]));
  $("ph-shot").addEventListener("change", (e) => onShot(e.target.files[0]));

  // Якщо маршрут не знайдено: торкнись лінії маршруту, беремо її колір
  $("ph-pick-canvas").addEventListener("click", (e) => {
    const cv = e.currentTarget;
    const r = cv.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * cv.width);
    const y = Math.round(((e.clientY - r.top) / r.height) * cv.height);
    const px = cv.getContext("2d").getImageData(Math.max(0, x - 1), Math.max(0, y - 1), 3, 3).data;
    let rr = 0, gg = 0, bb = 0;
    for (let i = 0; i < 9; i++) {
      rr += px[i * 4];
      gg += px[i * 4 + 1];
      bb += px[i * 4 + 2];
    }
    if (analyzeShot([rr / 9, gg / 9, bb / 9])) setStatus("ph-shot-status", "✓ Маршрут виділено за обраним кольором");
    else setStatus("ph-shot-status", "Усе ще не знайшов лінію. Торкнись точно по маршруту.", true);
  });

  ["ph-km", "ph-time", "ph-pace", "ph-headline", "ph-sub", "ph-elev"].forEach((id) => $(id).addEventListener("input", schedule));
  [["ph-fx", "fx"], ["ph-fy", "fy"], ["ph-zoom", "zoom"]].forEach(([id, key]) =>
    $(id).addEventListener("input", (e) => {
      state[key] = Number(e.target.value);
      schedule();
    })
  );

  $("ph-presets").addEventListener("click", (e) => {
    const b = e.target.closest("[data-preset]");
    if (!b || b.tagName === "CANVAS") return;
    state.style = b.dataset.preset;
    $("ph-presets").querySelectorAll(".ph-preset").forEach((x) => x.classList.toggle("is-active", x === b));
    drawMain();
  });

  function buildCoursePicker() {
    $("ph-course").innerHTML = COURSE_LIST.map((id) => {
      const ok = !!COURSES[id];
      return `<button type="button" data-course="${id}"${ok ? "" : " disabled"} class="${id === state.course ? "is-active" : ""}">${id} км${ok ? "" : " <small>скоро</small>"}</button>`;
    }).join("");
  }

  $("ph-course").addEventListener("click", (e) => {
    const b = e.target.closest("[data-course]");
    if (!b || b.disabled) return;
    state.course = b.dataset.course;
    $("ph-course").querySelectorAll("[data-course]").forEach((x) => x.classList.toggle("is-active", x === b));
    drawMain();
  });

  $("ph-mode").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (!b) return;
    state.mode = b.dataset.mode;
    $("ph-mode").querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("is-active", x === b));
    $("ph-presets").hidden = state.mode === "event";
    $("ph-event").hidden = state.mode !== "event";
    drawMain();
  });

  $("ph-format").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fmt]");
    if (!b) return;
    state.fmt = b.dataset.fmt;
    $("ph-format").querySelectorAll("[data-fmt]").forEach((x) => x.classList.toggle("is-active", x === b));
    drawMain();
    drawThumbs();
  });

  function toBlob() {
    return new Promise((resolve) => $("ph-canvas").toBlob(resolve, "image/jpeg", 0.93));
  }

  function event(name) {
    try {
      if (window.Analytics && Analytics.event) Analytics.event(name, "Фото з пробіжки");
    } catch (e) {}
  }

  $("ph-share").addEventListener("click", async () => {
    if (!state.photo) return setStatus("ph-share-status", "Спершу додай фото з пробіжки 📸", true);
    const blob = await toBlob();
    const file = new File([blob], "titan-run.jpg", { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: "Titan Club Rivne #TitanClubRivne" });
        event("photo-share");
        return setStatus("ph-share-status", "");
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    download(blob);
    setStatus("ph-share-status", "Цей браузер не вміє ділитись напряму: картинку збережено, додай її в Instagram вручну.");
  });

  function download(blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "titan-run.jpg";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
    event("photo-save");
  }

  $("ph-save").addEventListener("click", async () => {
    if (!state.photo) return setStatus("ph-share-status", "Спершу додай фото з пробіжки 📸", true);
    download(await toBlob());
    setStatus("ph-share-status", "Картинку збережено.");
  });

  // Додаток-оболонка Android (WebView) не вміє зберігати файли й ділитись ними
  if (/; wv\)/.test(navigator.userAgent)) $("ph-wv").hidden = false;

  buildPresetPicker();
  buildCoursePicker();
  const redraw = () => fontsReady().then(() => {
    drawMain();
    drawThumbs();
  });
  redraw();
  logoWhite.addEventListener("load", redraw);
  logoColor.addEventListener("load", redraw);
  document.querySelectorAll(".tabs__btn").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.tab === "photo") redraw();
    })
  );

  window.RunPhoto = { render, extractRoute, parseStats, state, autoPace, ocrShot };
})();
