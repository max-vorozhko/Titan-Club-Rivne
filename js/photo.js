// «Фото з пробіжки»: користувач вантажить колективне фото й (за бажанням) скріншот зі Strava/Garmin, вводить цифри,
// гра виділяє зі скріншота оранжевий контур маршруту й малює брендований пост (7 пресетів). Усе в браузері, без сервера.
(function () {
  const $ = (id) => document.getElementById(id);
  const ORANGE = "#f85a0a";
  const GRAPHITE = "#33333a";
  const FEED = { w: 1080, h: 1440 };
  const STORY = { w: 1080, h: 1920 };
  const MAX_SIDE = 2000; // великі фото з телефона зменшуємо, щоб не вичерпати пам'ять

  const PRESETS = [
    { id: "collective", name: "Колективне", size: FEED },
    { id: "typo", name: "Типографіка", size: FEED },
    { id: "card", name: "Скріншот-картка", size: FEED },
    { id: "story", name: "Сторіс", size: STORY },
    { id: "sky", name: "Контур у небі", size: FEED },
    { id: "frame", name: "Фірмова рамка", size: FEED },
    { id: "story2", name: "Сторіс-контур", size: STORY },
  ];

  const state = {
    photo: null, // canvas із фото
    shot: null, // canvas зі скріншотом
    route: null, // { plain, outlined, thumb, ratio }
    preset: "collective",
    fx: 50,
    fy: 60,
    zoom: 100,
    cropTop: 33,
    cropBottom: 22,
  };

  const logo = new Image();
  logo.src = "assets/logo.png";

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

  // Знаходить на скріншоті слід маршруту (за кольором) і готує шари: plain, outlined і мініатюру карти.
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
    const pad = 26;
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(w - 1, x1 + pad);
    y1 = Math.min(h - 1, y1 + pad);
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    const sub = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) sub[y * cw + x] = mask[(y + y0) * w + (x + x0)];
    const thick = boxBlur(boxFilter(sub, cw, ch, 2, true), cw, ch, 1);
    const halo = boxBlur(boxFilter(thick, cw, ch, 7, true), cw, ch, 2);

    const layer = (alphaArr, rgb) => {
      const cv = document.createElement("canvas");
      cv.width = cw;
      cv.height = ch;
      const g = cv.getContext("2d");
      const im = g.createImageData(cw, ch);
      for (let i = 0; i < alphaArr.length; i++) {
        im.data[i * 4] = rgb[0];
        im.data[i * 4 + 1] = rgb[1];
        im.data[i * 4 + 2] = rgb[2];
        im.data[i * 4 + 3] = alphaArr[i];
      }
      g.putImageData(im, 0, 0);
      return cv;
    };
    const plain = layer(thick, [248, 90, 10]);
    const white = layer(halo, [255, 255, 255]);
    const outlined = document.createElement("canvas");
    outlined.width = cw;
    outlined.height = ch;
    const og = outlined.getContext("2d");
    og.drawImage(white, 0, 0);
    og.drawImage(plain, 0, 0);

    // Мініатюра карти: фрагмент скріншота навколо маршруту
    const thumb = document.createElement("canvas");
    thumb.width = cw;
    thumb.height = ch;
    thumb.getContext("2d").drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
    return { plain, outlined, thumb, ratio: cw / ch };
  }

  // ---------- Малювання ----------

  const fontOswald = (px) => `700 ${px}px Oswald, "Arial Narrow", sans-serif`;
  const fontMont = (px, wt) => `${wt || 700} ${px}px Montserrat, Arial, sans-serif`;

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // Текст із міжлітерним інтервалом (ls) і вирівнюванням; повертає ширину
  function text(g, s, x, y, o) {
    const str = o.upper ? String(s).toUpperCase() : String(s);
    g.save();
    g.font = o.font;
    g.fillStyle = o.color || "#fff";
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    if (o.shadow) {
      g.shadowColor = o.shadow[0];
      g.shadowBlur = o.shadow[1];
      g.shadowOffsetY = o.shadow[2] || 0;
    }
    const ls = o.ls || 0;
    const chars = [...str];
    const widths = chars.map((ch) => g.measureText(ch).width);
    const total = ls ? widths.reduce((a, b) => a + b, 0) + ls * (chars.length - 1) : g.measureText(str).width;
    let sx = x;
    if (o.align === "center") sx = x - total / 2;
    else if (o.align === "right") sx = x - total;
    if (ls) {
      let px = sx;
      chars.forEach((ch, i) => {
        g.fillText(ch, px, y);
        px += widths[i] + ls;
      });
    } else g.fillText(str, sx, y);
    g.restore();
    return total;
  }

  // «Titan Club Rivne» в один рядок: перше слово білим, друге помаранчевим (ширину міряємо, щоб не злипалось)
  function brandLine(g, x, y, px, ls, tail) {
    const f = fontOswald(px);
    const w1 = text(g, "Titan Club", x, y, { font: f, ls, upper: true });
    const w2 = text(g, "Rivne", x + w1 + ls + px * 0.28, y, { font: f, color: ORANGE, ls, upper: true });
    if (tail) text(g, "· " + tail, x + w1 + w2 + ls * 2 + px * 0.28 + px * 0.5, y, { font: f, ls, upper: true });
    return w1 + w2;
  }

  // Підбирає розмір шрифту, щоб текст влізав у maxW
  function fit(g, s, startPx, maxW, make) {
    let px = startPx;
    g.save();
    while (px > 24) {
      g.font = make(px);
      if (g.measureText(String(s).toUpperCase()).width <= maxW) break;
      px -= 6;
    }
    g.restore();
    return px;
  }

  // fx/fy — зсув у відсотках (0–100), z — додатковий масштаб (1 = лише «заповнити»); без масштабу фото тієї ж пропорції зсувати нікуди
  function cover(g, img, x, y, w, h, fx, fy, z) {
    const s = Math.max(w / img.width, h / img.height) * (z || 1);
    const dw = img.width * s;
    const dh = img.height * s;
    const dx = x - (dw - w) * (fx / 100);
    const dy = y - (dh - h) * (fy / 100);
    g.drawImage(img, dx, dy, dw, dh);
  }

  // Дешеве розмиття без ctx.filter (Safari): зменшуємо й збільшуємо
  function blurred(img, w, h, fx, fy) {
    const small = document.createElement("canvas");
    small.width = Math.round(w / 24);
    small.height = Math.round(h / 24);
    const sg = small.getContext("2d");
    sg.imageSmoothingQuality = "high";
    cover(sg, img, 0, 0, small.width, small.height, fx, fy);
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

  // Фірмова смуга-«вказівник» (помаранчево-графітова діагональ)
  function stripe(g, x, y, w, h) {
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.fillStyle = GRAPHITE;
    g.fillRect(x, y, w, h);
    g.fillStyle = ORANGE;
    for (let sx = x - h; sx < x + w + h; sx += 70) {
      g.beginPath();
      g.moveTo(sx, y + h);
      g.lineTo(sx + 46, y + h);
      g.lineTo(sx + 46 + h * 0.5, y);
      g.lineTo(sx + h * 0.5, y);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  function logoBadge(g, x, y, w) {
    if (!logo.complete || !logo.naturalWidth) return;
    const pad = Math.round(w * 0.06);
    const iw = w - pad * 2;
    const ih = iw * (logo.naturalHeight / logo.naturalWidth);
    g.save();
    g.fillStyle = "#fff";
    roundRect(g, x, y, w, ih + pad * 2, w * 0.15);
    g.fill();
    g.drawImage(logo, x + pad, y + pad, iw, ih);
    g.restore();
  }

  function drawRoute(g, layer, x, y, w, glow) {
    if (!layer) return;
    const h = w / state.route.ratio;
    g.save();
    if (glow) {
      g.shadowColor = glow;
      g.shadowBlur = 24;
    } else {
      g.shadowColor = "rgba(0,0,0,.4)";
      g.shadowBlur = 18;
      g.shadowOffsetY = 6;
    }
    g.drawImage(layer, x, y, w, h);
    g.restore();
    return h;
  }

  function mapCard(g, x, y, w, h, r, border) {
    if (!state.route) return;
    g.save();
    roundRect(g, x, y, w, h, r);
    g.fillStyle = border;
    g.fill();
    g.clip();
    roundRect(g, x + 6, y + 6, w - 12, h - 12, r - 6);
    g.clip();
    cover(g, state.route.thumb, x + 6, y + 6, w - 12, h - 12, 50, 50);
    g.restore();
  }

  function values() {
    const km = ($("ph-km").value || "").trim().replace(".", ",") || "0";
    const time = ($("ph-time").value || "").trim() || "—";
    let pace = ($("ph-pace").value || "").trim();
    if (!pace) pace = autoPace(km, time) || "—";
    return {
      km,
      time,
      pace,
      headline: ($("ph-headline").value || "").trim() || "Ми пробігли",
      sub: ($("ph-sub").value || "").trim() || "Titan Club Rivne",
    };
  }

  // Темп із км і часу: «1:15:20» (г:хв:с) або «58:36» (хв:с); два числа з першим < 10 — «год:хв»
  function autoPace(kmStr, timeStr) {
    const km = parseFloat(kmStr.replace(",", "."));
    const parts = timeStr.split(":").map((x) => parseInt(x, 10));
    if (!(km > 0) || parts.some((p) => !Number.isFinite(p))) return "";
    let sec;
    if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) sec = parts[0] < 10 ? parts[0] * 3600 + parts[1] * 60 : parts[0] * 60 + parts[1];
    else return "";
    const p = sec / km;
    return `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, "0")}`;
  }

  function headLines(s) {
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return [{ t: words[0] || "", c: ORANGE }];
    return [{ t: words.slice(0, -1).join(" "), c: "#fff" }, { t: words[words.length - 1], c: ORANGE }];
  }

  const placeholderPhoto = () => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 1600;
    const g = c.getContext("2d");
    g.fillStyle = linear(g, 0, 0, 0, 1600, [[0, "#3b6fb6"], [0.55, "#e9a35f"], [1, "#4a4a52"]]);
    g.fillRect(0, 0, 1200, 1600);
    return c;
  };

  function render(presetId, scale) {
    const p = PRESETS.find((x) => x.id === presetId);
    const { w, h } = p.size;
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * scale);
    cv.height = Math.round(h * scale);
    const g = cv.getContext("2d");
    g.scale(scale, scale);
    const v = values();
    const photo = state.photo || placeholderPhoto();
    const { fx, fy } = state;
    const zm = state.zoom / 100;
    const lines = headLines(v.headline);
    const tag = "#TitanClubRivne";

    const statBlock = (x, y, label, val, size, color) => {
      text(g, val, x, y, { font: fontOswald(size), color: color || "#fff" });
      g.save();
      g.font = fontOswald(size);
      const wv = g.measureText(val).width;
      g.restore();
      text(g, label, x, y + size * 0.36, { font: fontMont(Math.round(size * 0.34)), color: "rgba(255,255,255,.85)", ls: 2, upper: true });
      return wv;
    };
    const bigKm = (x, y, size, unitSize, maxW) => {
      const px = fit(g, v.km, size, maxW, fontOswald);
      const wv = text(g, v.km, x, y, { font: fontOswald(px), color: "#fff" });
      text(g, "км", x + wv + 10, y, { font: fontOswald(unitSize * (px / size)), color: ORANGE, upper: true });
      return px;
    };

    if (presetId === "collective") {
      withFilter(g, "contrast(1.1) saturate(1.25) brightness(1.03)", () => cover(g, photo, 0, 0, w, h, fx, fy, zm));
      g.save();
      g.globalCompositeOperation = "soft-light";
      const rg = g.createRadialGradient(w / 2, h * 0.4, h * 0.2, w / 2, h * 0.4, h * 0.85);
      rg.addColorStop(0, "rgba(255,170,90,0)");
      rg.addColorStop(1, "rgba(248,90,10,.3)");
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
      g.restore();
      g.fillStyle = linear(g, 0, 0, 0, h, [[0, "rgba(0,0,0,0)"], [0.55, "rgba(0,0,0,0)"], [0.78, "rgba(20,20,26,.65)"], [1, "rgba(20,20,26,.95)"]]);
      g.fillRect(0, 0, w, h);
      logoBadge(g, 48, 48, 180);
      const sh = ["rgba(0,0,0,.5)", 26, 4];
      text(g, v.sub, 48, 290, { font: fontOswald(30), color: "#fff", ls: 6, upper: true, shadow: sh });
      let y = 400;
      lines.forEach((l) => {
        text(g, l.t, 48, y, { font: fontOswald(fit(g, l.t, 104, 900, fontOswald)), color: l.c === "#fff" ? "#fff" : "#ffc79c", upper: true, shadow: sh });
        y += 100;
      });
      text(g, tag, 48, h - 330, { font: fontMont(26), color: "#fff", shadow: ["rgba(0,0,0,.6)", 8, 2] });
      const mapW = state.route ? 320 : 0;
      bigKm(48, h - 130, 150, 54, w - 96 - mapW - 30);
      statBlock(48, h - 62, "час", v.time, 58);
      statBlock(48 + 280, h - 62, "темп /км", v.pace, 58);
      mapCard(g, w - 48 - 320, h - 46 - 340, 320, 340, 30, "#fff");
    } else if (presetId === "typo") {
      withFilter(g, "grayscale(.35) contrast(1.15) saturate(1.1)", () => cover(g, photo, 0, 0, w, h, fx, fy, zm));
      g.save();
      g.globalCompositeOperation = "multiply";
      g.fillStyle = linear(g, 0, 0, 0, h, [[0, "rgba(248,90,10,.55)"], [0.62, "rgba(51,51,58,0)"], [1, "rgba(51,51,58,0)"]]);
      g.fillRect(0, 0, w, h);
      g.restore();
      g.fillStyle = linear(g, 0, h, 0, h * 0.66, [[0, "rgba(20,20,26,.92)"], [1, "rgba(20,20,26,0)"]]);
      g.fillRect(0, h * 0.66, w, h * 0.34);
      const px = fit(g, v.km, 360, 760, fontOswald);
      const wv = text(g, v.km, 44, 70 + px * 0.82, { font: fontOswald(px), color: "#fff", shadow: ["rgba(0,0,0,.35)", 40, 8] });
      text(g, "км", 44 + wv + 14, 70 + px * 0.82, { font: fontOswald(90), color: "#fff", upper: true });
      const sh = ["rgba(0,0,0,.5)", 14, 3];
      text(g, v.sub, 52, 70 + px * 0.82 + 70, { font: fontOswald(46), color: "#fff", ls: 7, upper: true, shadow: sh });
      statBlock(52, 70 + px * 0.82 + 160, "час", v.time, 72);
      statBlock(52 + 300, 70 + px * 0.82 + 160, "темп /км", v.pace, 72);
      logoBadge(g, w - 44 - 170, 56, 170);
      brandLine(g, 52, h - 76, 34, 4);
      text(g, `${v.headline} · ${tag}`, 52, h - 40, { font: fontMont(22, 600), color: "rgba(255,255,255,.85)" });
      if (state.route) {
        g.save();
        g.beginPath();
        g.arc(w - 52 - 105, h - 44 - 105, 105, 0, Math.PI * 2);
        g.fillStyle = ORANGE;
        g.fill();
        g.beginPath();
        g.arc(w - 52 - 105, h - 44 - 105, 98, 0, Math.PI * 2);
        g.clip();
        cover(g, state.route.thumb, w - 52 - 210, h - 44 - 210, 210, 210, 50, 50);
        g.restore();
      }
    } else if (presetId === "card") {
      withFilter(g, "contrast(1.06) saturate(1.15)", () => cover(g, photo, 0, 0, w, h, fx, fy, zm));
      logoBadge(g, 36, 36, 160);
      g.save();
      g.font = fontOswald(28);
      const pw = 330;
      g.fillStyle = "rgba(20,20,26,.82)";
      roundRect(g, w - 36 - pw, 48, pw, 62, 31);
      g.fill();
      g.restore();
      brandLine(g, w - 36 - pw + 30, 92, 28, 3);
      if (state.shot) {
        const sw = state.shot.width;
        const sy = Math.round((state.cropTop / 100) * state.shot.height);
        const sh2 = Math.max(80, Math.round(state.shot.height * (1 - (state.cropTop + state.cropBottom) / 100)));
        const cw = w - 72;
        const ch = Math.min(h * 0.6, cw * (sh2 / sw));
        const cy = h - 36 - ch;
        g.save();
        g.shadowColor = "rgba(0,0,0,.45)";
        g.shadowBlur = 50;
        g.shadowOffsetY = 16;
        g.fillStyle = "#fff";
        roundRect(g, 36, cy, cw, ch, 40);
        g.fill();
        g.restore();
        g.save();
        roundRect(g, 42, cy + 6, cw - 12, ch - 12, 34);
        g.clip();
        g.drawImage(state.shot, 0, sy, sw, sh2, 42, cy + 6, cw - 12, ch - 12);
        g.restore();
      } else {
        const cy = h - 36 - 300;
        g.fillStyle = "#fff";
        roundRect(g, 36, cy, w - 72, 300, 40);
        g.fill();
        text(g, v.sub, 80, cy + 70, { font: fontOswald(40), color: GRAPHITE, ls: 2, upper: true });
        text(g, v.km, 80, cy + 210, { font: fontOswald(110), color: ORANGE });
        text(g, "км", 80 + 330, cy + 210, { font: fontOswald(48), color: GRAPHITE, upper: true });
        text(g, v.time, 470, cy + 210, { font: fontOswald(70), color: GRAPHITE });
        text(g, v.pace, 760, cy + 210, { font: fontOswald(70), color: GRAPHITE });
      }
    } else if (presetId === "story") {
      g.fillStyle = GRAPHITE;
      g.fillRect(0, 0, w, h);
      g.drawImage(blurred(photo, w, h, fx, fy), 0, 0, w, h);
      g.fillStyle = "rgba(20,20,26,.5)";
      g.fillRect(0, 0, w, h);
      logoBadge(g, w / 2 - 115, 70, 230);
      text(g, v.sub, w / 2, 410, { font: fontOswald(34), color: "#ffb27a", ls: 8, upper: true, align: "center" });
      text(g, v.headline + "!", w / 2, 540, { font: fontOswald(fit(g, v.headline + "!", 130, 900, fontOswald)), align: "center", upper: true });
      g.save();
      g.shadowColor = "rgba(0,0,0,.5)";
      g.shadowBlur = 70;
      g.shadowOffsetY = 24;
      g.fillStyle = "#fff";
      roundRect(g, 90, 660, w - 180, 640, 44);
      g.fill();
      g.restore();
      g.save();
      roundRect(g, 98, 668, w - 196, 624, 38);
      g.clip();
      withFilter(g, "contrast(1.08) saturate(1.2)", () => cover(g, photo, 98, 668, w - 196, 624, fx, fy, zm));
      g.restore();
      const mapW = state.route ? 250 : 0;
      bigKm(90, 1530, 190, 60, w - 180 - 330);
      statBlock(w - 90 - 260, 1450, "час", v.time, 64);
      statBlock(w - 90 - 260, 1590, "темп /км", v.pace, 64);
      mapCard(g, 90, h - 110 - 220, 220, 220, 34, "#fff");
      brandLine(g, mapW ? 350 : 90, h - 190, 36, 3);
      text(g, tag, mapW ? 350 : 90, h - 140, { font: fontOswald(36), color: ORANGE, ls: 3, upper: true });
    } else if (presetId === "sky") {
      withFilter(g, "contrast(1.08) saturate(1.1)", () => cover(g, photo, 0, 0, w, h, fx, fy, zm));
      g.fillStyle = linear(g, 0, 0, 0, h, [[0, "rgba(51,51,58,0)"], [0.4, "rgba(51,51,58,0)"], [0.76, "rgba(51,51,58,.75)"], [1, "rgba(51,51,58,.97)"]]);
      g.fillRect(0, 0, w, h);
      if (state.route) drawRoute(g, state.route.outlined, 560, 90, 430);
      logoBadge(g, 48, 48, 160);
      const sh = ["rgba(0,0,0,.5)", 24, 4];
      text(g, v.sub, 52, 330, { font: fontOswald(30), color: "#ffd1b0", ls: 6, upper: true, shadow: sh });
      let y = 440;
      lines.forEach((l) => {
        text(g, l.t, 52, y, { font: fontOswald(fit(g, l.t, 112, 500, fontOswald)), color: l.c, upper: true, shadow: sh });
        y += 106;
      });
      stripe(g, 0, h - 16, w, 16);
      bigKm(52, h - 190, 190, 60, w - 104);
      statBlock(52, h - 76, "час", v.time, 64);
      statBlock(52 + 330, h - 76, "темп /км", v.pace, 64);
      text(g, "Titan Club", w - 52, h - 90, { font: fontOswald(30), ls: 4, upper: true, align: "right" });
      text(g, "Rivne Premium", w - 52, h - 54, { font: fontOswald(30), color: ORANGE, ls: 4, upper: true, align: "right" });
    } else if (presetId === "frame") {
      g.fillStyle = ORANGE;
      g.fillRect(0, 0, w, h);
      g.save();
      roundRect(g, 36, 36, w - 72, h - 36 - 330, 30);
      g.clip();
      withFilter(g, "contrast(1.08) saturate(1.1)", () => cover(g, photo, 36, 36, w - 72, h - 366, fx, fy, zm));
      g.fillStyle = linear(g, 0, h - 330, 0, h - 330 - 520, [[0, "rgba(51,51,58,.6)"], [1, "rgba(51,51,58,0)"]]);
      g.fillRect(36, h - 330 - 520, w - 72, 520);
      if (state.route) drawRoute(g, state.route.outlined, 620, 130, 330);
      logoBadge(g, 66, 66, 140);
      g.restore();
      g.fillStyle = GRAPHITE;
      roundRect(g, 36, h - 294, w - 72, 294 + 30, 30);
      g.fill();
      let x = 80;
      lines.forEach((l, i) => {
        const px = fit(g, l.t, 72, 900, fontOswald);
        const wv = text(g, l.t, x, h - 294 + 100, { font: fontOswald(px), color: l.c, upper: true });
        x += wv + 18;
      });
      statBlock(80, h - 70, "км", v.km, 96, ORANGE);
      g.save();
      g.font = fontOswald(96);
      const kw = g.measureText(v.km).width;
      g.restore();
      statBlock(80 + kw + 60, h - 70, "час", v.time, 72);
      statBlock(80 + kw + 60 + 300, h - 70, "темп /км", v.pace, 72);
      stripe(g, 36, h - 16, w - 72, 16);
    } else if (presetId === "story2") {
      g.fillStyle = GRAPHITE;
      g.fillRect(0, 0, w, h);
      const rg = g.createRadialGradient(w * 0.8, h * 0.18, 0, w * 0.8, h * 0.18, h * 0.5);
      rg.addColorStop(0, "rgba(248,90,10,.35)");
      rg.addColorStop(1, "rgba(51,51,58,0)");
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
      logoBadge(g, 60, 70, 170);
      if (state.route) drawRoute(g, state.route.plain, w - 50 - 470, 150, 470, "rgba(248,90,10,.6)");
      text(g, v.sub, 62, 590, { font: fontOswald(32), color: ORANGE, ls: 7, upper: true });
      let y = 710;
      lines.forEach((l) => {
        text(g, l.t, 62, y, { font: fontOswald(fit(g, l.t, 128, 560, fontOswald)), color: l.c, upper: true });
        y += 118;
      });
      g.save();
      g.shadowColor = "rgba(0,0,0,.5)";
      g.shadowBlur = 70;
      g.shadowOffsetY = 24;
      g.fillStyle = "#fff";
      roundRect(g, 60, 880, w - 120, 560, 36);
      g.fill();
      g.restore();
      g.save();
      roundRect(g, 68, 888, w - 136, 544, 30);
      g.clip();
      withFilter(g, "contrast(1.08) saturate(1.15)", () => cover(g, photo, 68, 888, w - 136, 544, fx, fy, zm));
      g.restore();
      const px = bigKm(62, 1700, 220, 64, 560);
      statBlock(w - 62 - 280, 1630, "час", v.time, 78);
      statBlock(w - 62 - 280, 1760, "темп /км", v.pace, 78);
      brandLine(g, 62, h - 70, 36, 5, tag);
      stripe(g, 0, h - 16, w, 16);
      void px;
    }
    return cv;
  }

  // ---------- Інтерфейс ----------

  let renderTimer;
  let thumbTimer;
  let renderSeq = 0;

  function drawMain() {
    const seq = ++renderSeq;
    const out = render(state.preset, 1);
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
      const p = PRESETS.find((x) => x.id === id);
      const out = render(id, 0.17);
      cv.width = Math.round(p.size.w * 0.1);
      cv.height = Math.round(p.size.h * 0.1);
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
    $("ph-presets").innerHTML = PRESETS.map(
      (p) => `<button type="button" class="ph-preset${p.id === state.preset ? " is-active" : ""}" data-preset="${p.id}"><canvas data-preset="${p.id}"></canvas><span>${p.name}</span></button>`
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
      await Promise.all([document.fonts.load("700 80px Oswald"), document.fonts.load("700 30px Montserrat"), document.fonts.load("600 30px Montserrat")]);
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

  function analyzeShot(target) {
    state.route = extractRoute(state.shot, target);
    $("ph-pick").hidden = !!state.route;
    if (state.route) setStatus("ph-shot-status", "✓ Маршрут знайдено й вирізаний у контур");
    else setStatus("ph-shot-status", "Не знайшов маршрут на скріншоті. Торкнись лінії маршруту нижче, і я виділю її за кольором.", true);
    $("ph-crop").hidden = !(state.shot && state.preset === "card");
    schedule();
  }

  async function onShot(file) {
    if (!file) return;
    setStatus("ph-shot-status", "Шукаю маршрут…");
    try {
      state.shot = await loadImage(file);
      const pick = $("ph-pick-canvas");
      pick.width = state.shot.width;
      pick.height = state.shot.height;
      pick.getContext("2d").drawImage(state.shot, 0, 0);
      await fontsReady();
      // Даємо браузеру перемалювати стан, потім рахуємо (аналіз важкий)
      setTimeout(() => analyzeShot(), 30);
    } catch (e) {
      setStatus("ph-shot-status", "Не вдалося відкрити скріншот 😕", true);
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
    analyzeShot([rr / 9, gg / 9, bb / 9]);
  });

  ["ph-km", "ph-time", "ph-pace", "ph-headline", "ph-sub"].forEach((id) => $(id).addEventListener("input", schedule));
  [["ph-fx", "fx"], ["ph-fy", "fy"], ["ph-zoom", "zoom"], ["ph-ct", "cropTop"], ["ph-cb", "cropBottom"]].forEach(([id, key]) =>
    $(id).addEventListener("input", (e) => {
      state[key] = Number(e.target.value);
      schedule();
    })
  );

  $("ph-presets").addEventListener("click", (e) => {
    const b = e.target.closest("[data-preset]");
    if (!b || b.tagName === "CANVAS") return;
    state.preset = b.dataset.preset;
    $("ph-presets").querySelectorAll(".ph-preset").forEach((x) => x.classList.toggle("is-active", x === b));
    $("ph-crop").hidden = !(state.shot && state.preset === "card");
    drawMain();
  });

  function toBlob() {
    return new Promise((resolve) => $("ph-canvas").toBlob(resolve, "image/jpeg", 0.92));
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
  fontsReady().then(() => {
    drawMain();
    drawThumbs();
  });

  document.querySelectorAll(".tabs__btn").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.tab === "photo") fontsReady().then(() => { drawMain(); drawThumbs(); });
    })
  );

  window.RunPhoto = { render, extractRoute, state, autoPace };
})();
