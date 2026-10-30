/* HYRGPT plates: charcoal drawings rebuilt as a living field of signal dots.
   Each <figure class="plate" data-art="name|name2"> gets a dot canvas and a glow canvas.
   Options (data-*): cell, sun "cx,cy,r", mode "dark", scan, fade "t,r,b,l", pos "x,y", scale, text */
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
  const HOT = '#FF6B3D', GRAIN_L = '#D9CABD', GRAIN_D = '#4A3B33';
  const GLOW_FROM = 2, GLOW_TO = 15; // orange part of the light ramp feeds the glow

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const cache = new Map();
  const loadImg = name => {
    if (!cache.has(name)) cache.set(name, new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej;
      i.src = `assets/art/${name}.jpg`;
    }));
    return cache.get(name);
  };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  class Plate {
    constructor(el) {
      this.el = el;
      const d = el.dataset;
      this.names = (d.art || '').split('|').filter(Boolean);
      this.text = d.text || null;
      this.dark = d.mode === 'dark';
      this.cellBase = +d.cell || 7;
      this.sun = d.sun ? d.sun.split(',').map(Number) : null;
      this.scan = 'scan' in d;
      this.fade = (d.fade || '.06,.06,.12,.06').split(',').map(Number);
      this.pos = (d.pos || '.5,1').split(',').map(Number);
      this.scale = +d.scale || 1;
      this.gamma = +d.gamma || 1.7;
      this.edge = (d.edge || '.09,.09,.06,.14').split(',').map(Number);
      this.grain = !('nograin' in d);
      this.cur = 0; this.next = 0; this.morph = 1; this.morphStart = 0;
      this.reveal = 0; this.revealStart = 0; this.revealed = false;
      this.p = { x: -1e4, y: -1e4, k: 0, tk: 0 };
      this.visible = false; this.dirty = true;
      this.glow = document.createElement('canvas'); this.glow.className = 'plate-glow';
      this.cv = document.createElement('canvas'); this.cv.className = 'plate-dots';
      this.glow.setAttribute('aria-hidden', 'true'); this.cv.setAttribute('aria-hidden', 'true');
      el.append(this.glow, this.cv);
      this.ctx = this.cv.getContext('2d'); this.gctx = this.glow.getContext('2d');
      this.buckets = Array.from({ length: N }, () => []);
      this.hot = []; this.grainB = [];
      this.maps = [];
      el.addEventListener('pointermove', e => {
        const r = this.cv.getBoundingClientRect();
        this.p.x = e.clientX - r.left; this.p.y = e.clientY - r.top; this.p.tk = 1; Engine.wake();
      });
      el.addEventListener('pointerleave', () => { this.p.tk = 0; Engine.wake(); });
      el.classList.add('is-live');
    }
    async init() {
      if (this.text) await document.fonts.ready;
      else this.imgs = await Promise.all(this.names.map(loadImg));
      this.layout();
    }
    layout() {
      const w = this.el.clientWidth, h = this.el.clientHeight;
      if (!w || !h) return;
      this.w = w; this.h = h;
      const vw = window.innerWidth;
      this.cell = Math.max(4, Math.round(this.cellBase * (vw < 640 ? .72 : vw < 1024 ? .86 : 1)));
      this.cols = Math.floor(w / this.cell); this.rows = Math.floor(h / this.cell);
      this.ox = (w - this.cols * this.cell) / 2; this.oy = (h - this.rows * this.cell) / 2;
      for (const c of [this.cv, this.glow]) { c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); }
      this.ctx.setTransform(DPR, 0, 0, DPR, 0, 0); this.gctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      this.maps = this.text ? [this.sampleText()] : this.imgs.map(i => this.sample(i));
      this.dirty = true;
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
      for (let i = 0; i < L.length; i++) {
        const v = 1 - (px[i * 4] * .299 + px[i * 4 + 1] * .587 + px[i * 4 + 2] * .114) / 255;
        // drawings that run off the edge of their sheet thin out instead of ending in a hard cut
        const q = i % cols, r = i / cols | 0;
        const ux = (q + .5 - x0) / iw, uy = (r + .5 - y0) / ih;
        const [el, er, et, eb] = this.edge;
        const edge = Math.min(smooth(0, el, ux), smooth(0, er, 1 - ux), smooth(0, et, uy), smooth(0, eb, 1 - uy));
        const lv = Math.min(1, Math.max(0, (v - .045) / .82));
        L[i] = BAYER[((r + 3) & 7) * 8 + ((q + 5) & 7)] > edge ? 0 : this.dark ? lv : lv * (.55 + .45 * edge);
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
        // a soft light falls from the top left so the letters carry a gradient like the drawings
        L[i] = this.dark ? v * (.18 + .5 * (y / rows) + .08 * (x / cols)) : v * (.42 + .55 * (y / rows) + .12 * (1 - x / cols));
      }
      return L;
    }
    show(i) {
      if (i === this.next && this.morph >= 1) return;
      if (this.morph < 1) this.cur = this.next;
      this.next = i; this.morph = 0; this.morphStart = performance.now();
      if (reduce) { this.cur = i; this.morph = 1; }
      this.dirty = true; Engine.wake();
    }
    setSun(cx, cy, r) { this.sun = [cx, cy, r]; this.dirty = true; Engine.wake(); }
    startReveal() {
      if (this.revealed) return;
      this.revealed = true; this.revealStart = performance.now();
      if (reduce) this.reveal = 2;
      Engine.wake();
    }
    active() {
      return this.visible && (this.dirty || (this.revealed && this.reveal < 1.4) || this.morph < 1 ||
        this.p.k > .002 || this.p.tk > 0 || (this.scan && !reduce));
    }
    step(now) {
      if (!this.maps.length || !this.cols) return;
      if (this.revealed && this.reveal < 1.4) this.reveal = Math.min(1.4, (now - this.revealStart) / 1500);
      if (this.morph < 1) this.morph = Math.min(1, (now - this.morphStart) / 950);
      if (this.morph >= 1) this.cur = this.next;
      this.p.k += (this.p.tk - this.p.k) * .14;
      this.draw(now);
      this.dirty = false;
    }
    draw(now) {
      const { cols, rows, cell, ox, oy, ctx, gctx, dark } = this;
      const A = this.maps[this.cur] || this.maps[0], B = this.maps[this.next] || A;
      const morphing = this.morph < 1, m = this.morph * 1.12 - .06;
      const rv = this.revealed ? this.reveal : 0;
      const ramp = dark ? DARK : LIGHT;
      const [ft, fr, fb, fl] = this.fade;
      const sun = this.sun, sx = sun ? sun[0] * cols : 0, sy = sun ? sun[1] * rows : 0, sr = sun ? sun[2] * Math.min(cols, rows) : 1;
      const pk = this.p.k, lensR = Math.max(90, Math.min(170, this.w * .16)) / cell;
      const px = (this.p.x - ox) / cell, py = (this.p.y - oy) / cell;
      const scanY = this.scan && !reduce ? ((now / 7000) % 1) * rows * 1.5 - rows * .25 : -1e4;
      const bk = this.buckets; for (const b of bk) b.length = 0;
      const hot = this.hot, grain = this.grainB; hot.length = 0; grain.length = 0;

      for (let r = 0; r < rows; r++) {
        const fy = r / rows;
        const ey = Math.min(ft ? smooth(0, ft, fy) : 1, fb ? smooth(0, fb, 1 - fy) : 1);
        for (let q = 0; q < cols; q++) {
          const i = r * cols + q, th = BAYER[(r & 7) * 8 + (q & 7)];
          const fx = q / cols;
          const mask = Math.min(ey, fl ? smooth(0, fl, fx) : 1, fr ? smooth(0, fr, 1 - fx) : 1);
          if (th > mask) continue;
          let flash = 0, v;
          if (morphing) {
            v = m > th ? B[i] : A[i];
            const e = 1 - Math.abs(m - th) / .07;
            if (e > 0 && (A[i] > .05 || B[i] > .05)) flash = e;
          } else v = B[i];
          // reveal: a diagonal front climbs from the lower left, lighting dots as it passes
          if (rv < 1.4) {
            const front = fx * .55 + (1 - fy) * .45 + th * .16;
            if (rv < front) continue;
            if (rv - front < .07) flash = Math.max(flash, 1 - (rv - front) / .07);
          }
          let sunV = 0;
          if (sun) {
            const dd = Math.hypot(q + .5 - sx, r + .5 - sy) / sr;
            if (dd < 1) {
              const edge = dd > .8 ? (1 - dd) / .2 : 1;
              if (th < edge) sunV = dark ? .16 + .2 * (1 - dd) : .16 + .1 * (1 - dd) + .08 * ((r + .5 - sy) / sr);
            }
          }
          let dxp = 0, dyp = 0, k = 0;
          if (pk > .002) {
            const dx = q + .5 - px, dy = r + .5 - py, dd = Math.hypot(dx, dy);
            if (dd < lensR) {
              k = smooth(0, 1, 1 - dd / lensR) * pk;
              const push = k * .7 / (dd || 1);
              dxp = dx * push; dyp = dy * push;
            }
          }
          let scanK = 0;
          if (scanY > -1e3) {
            const ds = scanY - r;
            if (ds > 0 && ds < 14) scanK = Math.pow(1 - ds / 14, 1.6);
          }
          const isFig = v > .03;
          if (!isFig && sunV <= 0) {
            if (k > .08 || (this.grain && th < .22 && ((q + r) & 1) === 0 && mask > .9 && sun && Math.hypot(q - sx, r - sy) < sr * 1.5)) {
              const s = cell * (.12 + .14 * k);
              grain.push(q * cell + cell / 2 + ox + dxp * cell, r * cell + cell / 2 + oy + dyp * cell, s);
            }
            continue;
          }
          let idx, size;
          if (isFig) {
            if (dark) {
              idx = Math.round(Math.min(1, Math.pow(1 - v, 1.2)) * (N - 1));
              size = cell * (.26 + .66 * Math.pow(v, .55));
            } else {
              idx = Math.round(Math.min(1, Math.pow(v, this.gamma)) * (N - 1));
              size = cell * (.2 + .78 * Math.pow(v, .72));
            }
            if (sunV > 0 && !dark && v < sunV) { idx = Math.round(sunV * (N - 1)); size = cell * .5; }
          } else {
            idx = Math.round(sunV * (N - 1)) + (dark ? 6 : 0);
            size = cell * (dark ? .34 + sunV : .42 + sunV * .6);
          }
          if (k > 0) {
            idx = Math.round(idx + ((dark ? 15 : 9) - idx) * Math.min(1, k * 1.2));
            size *= 1 + .38 * k;
          }
          // the scan beam warms what it passes over rather than drawing a line
          if (scanK > 0 && isFig) {
            idx = Math.round(idx + ((dark ? 17 : 8) - idx) * scanK * .85);
            size *= 1 + .16 * scanK;
          }
          size = Math.min(size, cell * .94);
          const x = q * cell + cell / 2 + ox + dxp * cell, y = r * cell + cell / 2 + oy + dyp * cell;
          const hk = flash;
          if (hk > .55) { hot.push(x, y, Math.min(cell * .96, size * (1 + .2 * hk))); continue; }
          bk[Math.max(0, Math.min(N - 1, idx))].push(x, y, size);
        }
      }
      ctx.clearRect(0, 0, this.w, this.h); gctx.clearRect(0, 0, this.w, this.h);
      const paint = (g, arr, color) => {
        if (!arr.length) return;
        g.fillStyle = color; g.beginPath();
        for (let j = 0; j < arr.length; j += 3) {
          const s = arr[j + 2], hs = s / 2;
          if (s > 4.5) g.roundRect(arr[j] - hs, arr[j + 1] - hs, s, s, s * .26);
          else g.rect(arr[j] - hs, arr[j + 1] - hs, s, s);
        }
        g.fill();
      };
      paint(ctx, grain, dark ? GRAIN_D : GRAIN_L);
      for (let j = 0; j < N; j++) {
        paint(ctx, bk[j], ramp[j]);
        if (dark ? j >= 8 : j >= GLOW_FROM && j <= GLOW_TO) paint(gctx, bk[j], ramp[j]);
      }
      paint(ctx, hot, HOT); paint(gctx, hot, HOT);
    }
  }

  const Engine = {
    plates: [], running: false,
    wake() { if (!this.running) { this.running = true; requestAnimationFrame(t => this.tick(t)); } },
    tick(now) {
      let any = false;
      for (const p of this.plates) if (p.active()) { p.step(now); any = true; }
      if (any) requestAnimationFrame(t => this.tick(t)); else this.running = false;
    },
    async mount(root = document) {
      const els = [...root.querySelectorAll('.plate[data-art], .plate[data-text]')];
      const io = new IntersectionObserver(entries => {
        for (const e of entries) {
          const p = e.target.__plate; if (!p) continue;
          p.visible = e.isIntersecting;
          if (e.isIntersecting && e.intersectionRatio > .12) p.startReveal();
          if (p.visible) { p.dirty = true; this.wake(); }
        }
      }, { threshold: [0, .12, .3] });
      for (const el of els) {
        const p = new Plate(el); el.__plate = p; this.plates.push(p);
        p.init().then(() => { io.observe(el); this.wake(); });
      }
      const ro = new ResizeObserver(entries => {
        for (const e of entries) {
          const p = e.target.__plate;
          if (!p || (p.imgs === undefined && !p.text)) continue;
          if (Math.round(e.contentRect.width) !== p.w || Math.round(e.contentRect.height) !== p.h) { p.layout(); this.wake(); }
        }
      });
      els.forEach(el => ro.observe(el));
    }
  };
  window.HyrPlates = Engine;
})();
