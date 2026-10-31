/* HYRGPT plates: charcoal drawings rebuilt as fields of signal dots.
   Each plate shows a pre-rendered PNG (assets/art/dither/<art>-<bp>.png), so at rest the page is a plain
   image document. A canvas sits on top only while something moves (the first scan, the cursor lens, the
   module dissolve) and is hidden again afterwards. ?export renders those PNGs from this same code.
   Options (data-*): art "a|b", text, cell, mode "dark", warm 0-1, sun "cx,cy,r", spot "x,y,r",
   edge "l,r,t,b", fade "t,r,b,l", pos "x,y", scale
   On a page with <html data-reveal>, the cursor lens swaps each drawing for its future twin
   (assets/art/future/<art>.jpg) in the same colours, instead of lighting it up. */
(() => {
  const BAYER = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,
    3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21].map(v => (v + .5) / 64);
  const N = 24;
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  function ramp(stops) {
    const out = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      let k = 0;
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const [t0, c0] = stops[k], [t1, c1] = stops[k + 1];
      const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
      const a = hex(c0), b = hex(c1);
      out.push(`rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * u)).join(',')})`);
    }
    return out;
  }
  const LIGHT = ramp([[0, '#F7C9B2'], [.2, '#FB8D63'], [.38, '#FA6033'], [.58, '#C2461F'], [.76, '#4F2D21'], [1, '#191714']]);
  const DARK = ramp([[0, '#4A2A1D'], [.32, '#93391B'], [.58, '#FA6033'], [.82, '#FDA47F'], [1, '#FFF1E4']]);
  const HOT = '#FF6B3D';
  const SIZES = [.3, .44, .58, .72, .86, .95];   // a few clean dot sizes read calmer than a continuous range
  const SIGNAL = 8;                               // ramp index of signal orange

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EXPORT = /[?&]export\b/.test(location.search);
  const REVEAL = document.documentElement.hasAttribute('data-reveal');
  const DPR = EXPORT ? 2 : Math.min(2, window.devicePixelRatio || 1);
  const bp = () => innerWidth < 640 ? 'sm' : innerWidth < 1024 ? 'md' : 'lg';
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const nums = (s, d) => (s || d).split(',').map(Number);
  const cache = new Map();
  const loadImg = src => {
    if (!cache.has(src)) cache.set(src, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }));
    return cache.get(src);
  };
  let META = {};

  class Plate {
    constructor(el) {
      this.el = el;
      const d = el.dataset;
      this.names = (d.art || '').split('|').filter(Boolean);
      this.text = d.text || null;
      this.dark = d.mode === 'dark';
      this.cellBase = +d.cell || 8;
      this.gammas = (d.warm || '0').split('|').map(w => 1.25 + (+w || 0) * 1.6);
      this.sun = d.sun ? nums(d.sun) : null;
      this.spots = (d.spot || '').split('|').map(s => s ? nums(s) : null);
      this.edge = nums(d.edge, '.06,.06,.05,.08');
      this.fade = nums(d.fade, '0,0,0,0');
      this.pos = nums(d.pos, '.5,1');
      this.scale = +d.scale || 1;
      this.idx = 0; this.from = 0; this.morph = 1; this.morphStart = 0;
      this.scanT = -1; this.scanned = false;
      this.p = { x: -1e4, y: -1e4, k: 0, tk: 0 };
      this.visible = false; this.ready = false;
      this.img = el.querySelector('img');
      this.cv = document.createElement('canvas');
      this.cv.className = 'plate-fx'; this.cv.setAttribute('aria-hidden', 'true');
      el.append(this.cv);
      this.ctx = this.cv.getContext('2d');
      this.buckets = Array.from({ length: N }, () => []); this.hot = [];
      el.addEventListener('pointermove', e => {
        if (!this.ready) return;
        if (REVEAL && !(this.alts0 && this.alts0[this.idx])) return;   // no twin: this plate stays still on the reveal page
        const r = this.cv.getBoundingClientRect();
        this.p.x = e.clientX - r.left; this.p.y = e.clientY - r.top; this.p.tk = 1; Engine.wake();
      });
      el.addEventListener('pointerleave', () => { this.p.tk = 0; Engine.wake(); });
    }
    key(i = 0) { return `${this.text ? 'wordmark' : this.names[i]}-${bp()}`; }
    async init() {
      if (this.text) await document.fonts.ready;
      else {
        this.maps0 = await Promise.all(this.names.map(n => loadImg(`assets/art/${n}.jpg`)));
        if (REVEAL) this.alts0 = await Promise.all(this.names.map(n => loadImg(`assets/art/future/${n}.jpg`).catch(() => null)));
      }
      this.layout();
    }
    layout() {
      const w = this.el.clientWidth, h = this.el.clientHeight;
      this.ready = false; this.w = w; this.h = h;
      if (!w || !h) return;
      if (!EXPORT) {
        const m = META[this.key()];
        if (!m) return;                    // no grid on record for this size: the PNG simply stays as it is
        const s = w / m.w;
        Object.assign(this, { cols: m.cols, rows: m.rows, cell: m.cell * s, ox: m.ox * s, oy: m.oy * s });
      } else {
        const b = bp();
        this.cell = Math.max(3, Math.round(this.cellBase * (b === 'sm' ? .64 : b === 'md' ? .82 : 1)));
        this.cols = Math.floor(w / this.cell); this.rows = Math.floor(h / this.cell);
        this.ox = (w - this.cols * this.cell) / 2; this.oy = (h - this.rows * this.cell) / 2;
      }
      this.cv.width = Math.round(w * DPR); this.cv.height = Math.round(h * DPR);
      this.ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      this.maps = this.text ? [this.sampleText()] : this.maps0.map(i => this.sample(i));
      this.alts = this.alts0 ? this.alts0.map(i => i && this.sample(i)) : null;
      this.ready = true;
    }
    sample(img) {
      const { cols, rows } = this;
      const c = document.createElement('canvas'); c.width = cols; c.height = rows;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#fff'; g.fillRect(0, 0, cols, rows);
      g.imageSmoothingQuality = 'high';
      const s = Math.min(cols / img.width, rows / img.height) * this.scale;
      const iw = img.width * s, ih = img.height * s;
      const x0 = (cols - iw) * this.pos[0], y0 = (rows - ih) * this.pos[1];
      g.drawImage(img, x0, y0, iw, ih);
      const px = g.getImageData(0, 0, cols, rows).data, L = new Float32Array(cols * rows);
      const [el, er, et, eb] = this.edge;
      for (let i = 0; i < L.length; i++) {
        const q = i % cols, r = i / cols | 0;
        const v = 1 - (px[i * 4] * .299 + px[i * 4 + 1] * .587 + px[i * 4 + 2] * .114) / 255;
        const ux = (q + .5 - x0) / iw, uy = (r + .5 - y0) / ih;
        const edge = Math.min(smooth(0, el, ux), smooth(0, er, 1 - ux), smooth(0, et, uy), smooth(0, eb, 1 - uy));
        const lv = Math.min(1, Math.max(0, (v - .06) / .8));
        L[i] = BAYER[((r + 3) & 7) * 8 + ((q + 5) & 7)] > edge ? 0 : lv;
      }
      return L;
    }
    sampleText() {
      const { cols, rows } = this;
      const c = document.createElement('canvas'); c.width = cols; c.height = rows;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#fff'; g.fillRect(0, 0, cols, rows);
      let fs = rows * 1.08;
      g.font = `900 ${fs}px "True Arabic"`;
      const tw = g.measureText(this.text).width;
      if (tw > cols * .98) { fs *= cols * .98 / tw; g.font = `900 ${fs}px "True Arabic"`; }
      g.fillStyle = '#000'; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText(this.text, cols / 2, rows * .54);
      const px = g.getImageData(0, 0, cols, rows).data, L = new Float32Array(cols * rows);
      for (let i = 0; i < L.length; i++) {
        const x = i % cols, y = (i / cols) | 0;
        const v = 1 - px[i * 4] / 255;
        L[i] = this.dark ? v * (.98 - .4 * (y / rows) - .08 * (x / cols)) : v * (.42 + .55 * (y / rows));
      }
      return L;
    }
    /* the resting look of one cell: [rampIndex, size] or null */
    cellAt(map, i, q, r, ai = 0) {
      const { cols, rows, dark } = this, th = BAYER[(r & 7) * 8 + (q & 7)];
      const [ft, fr, fb, fl] = this.fade, fx = q / cols, fy = r / rows;
      if (ft || fr || fb || fl) {
        const mask = Math.min(ft ? smooth(0, ft, fy) : 1, fb ? smooth(0, fb, 1 - fy) : 1, fl ? smooth(0, fl, fx) : 1, fr ? smooth(0, fr, 1 - fx) : 1);
        if (th > mask) return null;
      }
      const v = map[i];
      let sunV = 0;
      if (this.sun) {
        const [cx, cy, cr] = this.sun, R = cr * Math.min(cols, rows);
        const dd = Math.hypot(q + .5 - cx * cols, r + .5 - cy * rows) / R;
        if (dd < 1 && th < (dd > .8 ? (1 - dd) / .2 : 1)) sunV = dark ? .3 + .25 * (1 - dd) : .2 + .1 * (1 - dd);
      }
      if (v <= .03 && sunV <= 0) return null;
      let idx, sz;
      if (v > .03) {
        if (dark) { idx = (.1 + .86 * Math.pow(v, 2.2)) * (N - 1); sz = .2 + .74 * Math.pow(v, 1.2); }   // ink glows: the darker the stroke, the brighter the dot
        else { idx = Math.pow(v, this.gammas[ai] || this.gammas[0]) * (N - 1); sz = .2 + .78 * Math.pow(v, .72); }
        const spot = this.spots[ai] || (this.spots.length === 1 ? this.spots[0] : null);
        if (spot) {
          const [sx, sy, sr] = spot;
          const dd = Math.hypot(q + .5 - sx * cols, r + .5 - sy * rows) / (sr * Math.min(cols, rows));
          if (dd < 1) { idx = dark ? Math.max(idx, 17) : Math.min(idx, SIGNAL); sz = Math.max(sz, .62); }
        }
        if (!dark && sunV > 0 && v < sunV) { idx = sunV * (N - 1); sz = .5; }
      } else { idx = sunV * (N - 1); sz = dark ? .5 : .46; }
      idx = Math.max(0, Math.min(N - 1, Math.round(idx / 2) * 2));
      let k = 0; while (k < SIZES.length - 1 && sz > (SIZES[k] + SIZES[k + 1]) / 2) k++;
      return [idx, SIZES[k]];
    }
    /* mode 'rest' paints everything; 'fx' paints only the cells the scan or lens touches, over the PNG;
       'morph' paints full frames while one module drawing dissolves into the next */
    draw(mode) {
      const { cols, rows, cell, ox, oy, ctx, dark } = this;
      const ramp = dark ? DARK : LIGHT;
      const A = this.maps[this.from] || this.maps[0], B = this.maps[this.idx] || A;
      const m = this.morph * 1.12 - .06;
      const scanY = this.scanT >= 0 ? this.scanT * (rows + 16) - 8 : -1e4;
      const pk = this.p.k, lensR = 120 / cell, px = (this.p.x - ox) / cell, py = (this.p.y - oy) / cell;
      for (const b of this.buckets) b.length = 0;
      const hot = this.hot; hot.length = 0;
      const alt = mode === 'fx' && this.alts && this.alts[this.idx], cover = this.cover || (this.cover = []);
      cover.length = 0;
      for (let r = 0; r < rows; r++) {
        const ds = scanY - r, scanK = ds > 0 && ds < 7 ? Math.pow(1 - ds / 7, 1.4) : 0;
        if (mode === 'fx' && !scanK && (pk < .002 || Math.abs(r + .5 - py) > lensR)) continue;
        for (let q = 0; q < cols; q++) {
          const i = r * cols + q;
          let k = 0;
          if (pk > .002) { const dd = Math.hypot(q + .5 - px, r + .5 - py); if (dd < lensR) k = smooth(0, 1, 1 - dd / lensR) * pk; }
          if (mode === 'fx' && !scanK && !k) continue;
          const x = q * cell + cell / 2 + ox, y = r * cell + cell / 2 + oy;
          if (alt && k) {
            // reveal: inside the lens the twin replaces the drawing, its edge dissolving on the Bayer grid
            if (BAYER[(r & 7) * 8 + (q & 7)] < smooth(0, .14, k)) {
              cover.push(x, y);
              const t = this.cellAt(alt, i, q, r, this.idx);
              if (t) this.buckets[t[0]].push(x, y, cell * t[1]);
              continue;
            }
            if (!scanK) continue;
          }
          let flash = 0, c;
          if (mode === 'morph') {
            const th = BAYER[(r & 7) * 8 + (q & 7)];
            c = m > th ? this.cellAt(B, i, q, r, this.idx) : this.cellAt(A, i, q, r, this.from);
            const e = 1 - Math.abs(m - th) / .07;
            if (e > 0 && c) flash = e;
          } else c = this.cellAt(B, i, q, r, this.idx);
          if (!c) {
            if (k > .15 && !alt) hot.push(x, y, cell * .16 * k);
            continue;
          }
          let [idx, sz] = c;
          const lift = Math.max(k, scanK);
          if (lift > 0) {
            idx = Math.round(idx + ((dark ? 17 : SIGNAL) - idx) * Math.min(1, lift * 1.1));
            sz = Math.min(.98, sz * (1 + .32 * lift) + .06);   // a touch larger so it fully covers the dot beneath
          }
          if (flash > .5 || scanK > .7) { hot.push(x, y, cell * Math.min(.98, sz + .04)); continue; }
          this.buckets[idx].push(x, y, cell * sz);
        }
      }
      ctx.clearRect(0, 0, this.w, this.h);
      if (cover.length) {
        // hide the drawing beneath the lens with the colour of whatever the plate sits on
        ctx.shadowColor = 'transparent'; ctx.fillStyle = this.bg(); ctx.beginPath();
        for (let j = 0; j < cover.length; j += 2) ctx.rect(cover[j] - cell / 2 - .5, cover[j + 1] - cell / 2 - .5, cell + 1, cell + 1);
        ctx.fill();
      }
      // the glow is baked into the exported PNG, so no CSS filter is needed on the image
      const glow = mode === 'rest' || alt;
      ctx.shadowColor = glow ? (dark ? 'rgba(250,96,51,.4)' : 'rgba(250,96,51,.28)') : 'transparent';
      ctx.shadowBlur = glow ? (dark ? 8 : 6) * DPR : 0;
      const paint = (arr, color) => {
        if (!arr.length) return;
        ctx.fillStyle = color; ctx.beginPath();
        for (let j = 0; j < arr.length; j += 3) {
          const s = arr[j + 2], hs = s / 2;
          if (s > 4.5) ctx.roundRect(arr[j] - hs, arr[j + 1] - hs, s, s, s * .24);
          else ctx.rect(arr[j] - hs, arr[j + 1] - hs, s, s);
        }
        ctx.fill();
      };
      for (let j = 0; j < N; j++) paint(this.buckets[j], ramp[j]);
      paint(hot, HOT);
    }
    bg() {
      for (let e = this.el; e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c;
      }
      return '#F8F5EF';
    }
    show(i) {
      if (i === this.idx) return;
      this.from = this.idx; this.idx = i;
      if (reduce || !this.ready) { this.swap(); return; }
      this.morph = 0; this.morphStart = performance.now();
      this.el.classList.add('is-moving');
      Engine.wake();
    }
    swap() {
      const src = `assets/art/dither/${this.names[this.idx]}-${bp()}.png`;
      const done = () => { this.img.src = src; this.el.classList.remove('is-moving'); Engine.wake(); };
      loadImg(src).then(done, done);
    }
    startScan() {
      if (this.scanned || reduce || !this.ready) return;
      this.scanned = true; this.scanStart = performance.now(); this.scanT = 0; Engine.wake();
    }
    busy() { return this.scanT >= 0 || this.morph < 1 || this.p.k > .002 || this.p.tk > 0; }
    step(now) {
      if (this.scanT >= 0) { this.scanT = (now - this.scanStart) / 850; if (this.scanT > 1) this.scanT = -1; }
      this.p.k += (this.p.tk - this.p.k) * .16;
      if (this.p.tk === 0 && this.p.k < .002) this.p.k = 0;
      if (this.morph < 1) {
        this.morph = Math.min(1, (now - this.morphStart) / 900);
        this.draw('morph');
        if (this.morph >= 1) this.swap();
        return;
      }
      if (this.el.classList.contains('is-moving')) return;   // hold the last dissolve frame until the new PNG is in
      const fx = this.scanT >= 0 || this.p.k > 0;
      this.el.classList.toggle('is-fx', fx);
      if (fx) this.draw('fx'); else this.ctx.clearRect(0, 0, this.w, this.h);
    }
    exportPNG() {
      this.p.k = 0; this.scanT = -1; this.morph = 1;
      const out = [];
      const n = this.text ? 1 : this.names.length;
      for (let i = 0; i < n; i++) {
        this.from = this.idx = i; this.draw('rest');
        out.push({ key: this.key(i), data: this.cv.toDataURL('image/png'),
          meta: { cols: this.cols, rows: this.rows, w: this.w, h: this.h, cell: this.cell, ox: this.ox, oy: this.oy } });
      }
      this.idx = this.from = 0;
      return out;
    }
  }

  const Engine = {
    plates: [], running: false,
    wake() { if (!this.running) { this.running = true; requestAnimationFrame(t => this.tick(t)); } },
    tick(now) {
      let any = false;
      for (const p of this.plates) {
        if (!p.ready) continue;
        const shown = p.el.classList.contains('is-fx') || p.el.classList.contains('is-moving');
        if ((p.visible && p.busy()) || shown) { p.step(now); any = any || p.busy() || p.el.classList.contains('is-fx'); }
      }
      if (any) requestAnimationFrame(t => this.tick(t)); else this.running = false;
    },
    async mount(root = document) {
      try { META = await (await fetch('assets/art/dither/plates.json', { cache: 'no-store' })).json(); } catch (e) { META = {}; }
      const els = [...root.querySelectorAll('.plate[data-art], .plate[data-text]')];
      const io = new IntersectionObserver(entries => {
        for (const e of entries) {
          const p = e.target.__plate; if (!p) continue;
          p.visible = e.isIntersecting;
          if (e.intersectionRatio > .35) p.startScan();
        }
      }, { threshold: [0, .35] });
      const ro = new ResizeObserver(entries => {
        for (const e of entries) {
          const p = e.target.__plate;
          if (p && (p.maps0 || p.text) && (Math.round(e.contentRect.width) !== p.w || Math.round(e.contentRect.height) !== p.h)) p.layout();
        }
      });
      await Promise.all(els.map(async el => {
        const p = new Plate(el); el.__plate = p; this.plates.push(p);
        try { await p.init(); } catch (e) { return; }
        io.observe(el); ro.observe(el);
      }));
      // the module drawings swap often, so fetch their PNGs ahead of time
      for (const p of this.plates) if (p.names.length > 1) p.names.forEach(n => loadImg(`assets/art/dither/${n}-${bp()}.png`).catch(() => {}));
    },
    exportAll() { return this.plates.filter(p => p.w && p.h).flatMap(p => p.exportPNG()); }
  };
  window.HyrPlates = Engine;
})();
