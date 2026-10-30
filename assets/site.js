(() => {
  const html = document.documentElement;
  const FIGMA = html.classList.contains('figma');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desk = matchMedia('(min-width: 1024px)');
  const phone = matchMedia('(max-width: 639px)');
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* nav */
  const nav = $('#nav'), burger = $('.burger');
  const onScroll = () => nav.classList.toggle('is-stuck', scrollY > 30);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  burger.addEventListener('click', () => burger.setAttribute('aria-expanded', nav.classList.toggle('open')));
  $$('.drawer a').forEach(a => a.addEventListener('click', () => { nav.classList.remove('open'); burger.setAttribute('aria-expanded', false); }));

  /* ROI calculator: works in every mode */
  const roles = $('#r-roles'), apps = $('#r-apps'), rate = $('#r-rate');
  const vRoi = $('#v-roi'), vHrs = $('#v-hrs');
  const fmt = n => '$' + Math.round(n).toLocaleString('en-US');
  let shown = { roi: 145800, hrs: 270 }, tween, spin = 0;
  const fill = r => r.parentElement.style.setProperty('--f', ((r.value - r.min) / (r.max - r.min)).toFixed(3));
  const calc = () => {
    [roles, apps, rate].forEach(fill);
    $('#o-roles').textContent = roles.value; $('#o-apps').textContent = apps.value; $('#o-rate').textContent = `$${rate.value}/hr`;
    // 12 minutes per resume by hand, about a tenth of that with HYRGPT
    const hrs = roles.value * apps.value * 12 * .9 / 60, roi = hrs * rate.value * 12;
    const man = hrs / .9, ai = hrs / 9;
    $('#v-man').textContent = Math.round(man).toLocaleString('en-US') + ' hrs';
    $('#v-ai').textContent = Math.round(ai).toLocaleString('en-US') + ' hrs';
    // both bars share one scale, rounded up to a clean number so the axis reads well
    const mag = Math.pow(10, Math.floor(Math.log10(man))), top = Math.ceil(man / mag * 2) / 2 * mag;
    const pct = v => (v / top * 100).toFixed(2) + '%';
    $('#b-man').style.width = pct(man); $('#b-ai').style.width = pct(ai);
    $('#b-cut').style.width = `calc(${pct(man - ai)} - 4px)`;
    $('#ax-mid').textContent = Math.round(top / 2).toLocaleString('en-US');
    $('#ax-max').textContent = Math.round(top).toLocaleString('en-US') + ' hrs';
    spin = Math.min(spin + .18, 4);
    const from = { ...shown }, t0 = performance.now();
    cancelAnimationFrame(tween);
    const step = t => {
      const k = reduce ? 1 : Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - k, 3);
      shown.roi = from.roi + (roi - from.roi) * e; shown.hrs = from.hrs + (hrs - from.hrs) * e;
      vRoi.textContent = fmt(shown.roi); vHrs.textContent = Math.round(shown.hrs).toLocaleString('en-US') + ' hrs';
      if (k < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  };
  [roles, apps, rate].forEach(r => r.addEventListener('input', calc));
  calc(); spin = 0;

  /* the sundial: its shadow walks round the dial, and races ahead whenever the inputs change */
  const hand = $('.dial-hand'), dialBox = $('.roi-plate');
  const setHand = phi => {
    // the dial is an ellipse seen from above: 18.4% of the plate wide, 12.6% of it tall
    const W = dialBox.clientWidth, H = dialBox.clientHeight;
    const dx = Math.cos(phi) * .184 * W, dy = Math.sin(phi) * .126 * H;
    hand.style.width = (Math.hypot(dx, dy) / W * 100).toFixed(2) + '%';
    hand.style.transform = `rotate(${(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(2)}deg)`;
  };

  if (FIGMA) return;

  /* testimonials: clone the set once so the rail can loop */
  const track = $('.quotes-track');
  $$('.quote', track).forEach(q => { const c = q.cloneNode(true); c.classList.add('dup'); c.setAttribute('aria-hidden', 'true'); track.append(c); });

  /* plates (and ?export, which renders their PNGs) */
  const plates = window.HyrPlates.mount();
  window.__plates = plates;

  /* smooth scroll */
  let lenis = null;
  if (window.Lenis && !reduce) {
    lenis = new Lenis({ lerp: .1, smoothWheel: true });
    const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf);
  }
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href'); if (id.length < 2) return;
    const t = $(id); if (!t) return;
    e.preventDefault();
    lenis ? lenis.scrollTo(t, { offset: -76 }) : t.scrollIntoView({ behavior: 'smooth' });
  }));

  /* entrances: nothing is hidden up front; an element only animates in as it arrives */
  const rise = (el, delay = 0) => el.animate(
    [{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }],
    { duration: 900, delay, easing: 'cubic-bezier(.2,.7,.1,1)', fill: 'backwards' });
  if (!reduce) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const sibs = [...e.target.parentElement.children].filter(c => c.hasAttribute('data-anim'));
      rise(e.target, Math.max(0, sibs.indexOf(e.target)) * 90);
    }), { rootMargin: '0px 0px 8% 0px' });
    $$('[data-anim]').forEach(el => { if (el.getBoundingClientRect().top > innerHeight) io.observe(el); });
  }

  /* sundial: about one turn every 40 seconds while it is on screen */
  let phi = .44, dialOn = false, lastT = 0;
  new IntersectionObserver(es => { dialOn = es[0].isIntersecting; }).observe(dialBox);
  if (!reduce) {
    const turn = t => {
      const dt = Math.min(64, t - (lastT || t)); lastT = t;
      if (dialOn) {
        const kick = spin * .06; spin -= kick;
        phi += dt / 1000 * (Math.PI * 2 / 40) + kick;
        setHand(phi);
      }
      requestAnimationFrame(turn);
    };
    requestAnimationFrame(turn);
  }

  /* recruitment: the module nearest the middle of the screen drives the drawing */
  const mods = $$('.mod'), modsBox = $('.mods');
  let modIdx = 0, ticking = false;
  const pickMod = () => {
    ticking = false;
    if (!desk.matches) return;
    const mid = innerHeight * .5;
    let best = 0, bd = Infinity;
    mods.forEach((m, i) => { const r = m.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - mid); if (d < bd) { bd = d; best = i; } });
    if (best === modIdx) return;
    modIdx = best;
    mods.forEach((m, i) => m.classList.toggle('is-on', i === best));
    const p = $('.mod-plate').__plate; if (p) p.show(best);
  };
  if (desk.matches) modsBox.classList.add('is-live');
  desk.addEventListener('change', () => modsBox.classList.toggle('is-live', desk.matches));
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(pickMod); } }, { passive: true });

  /* testimonials rail: slow drift, draggable */
  const rail = $('.quotes');
  let x = 0, vx = -.35, dragging = false, lastX = 0, hover = false, half = 0, railVisible = false;
  const measure = () => { half = track.scrollWidth / 2; };
  measure(); addEventListener('resize', measure);
  rail.addEventListener('pointerenter', () => hover = true);
  rail.addEventListener('pointerleave', () => { hover = false; dragging = false; });
  rail.addEventListener('pointerdown', e => { if (phone.matches) return; dragging = true; lastX = e.clientX; rail.setPointerCapture(e.pointerId); rail.style.cursor = 'grabbing'; });
  rail.addEventListener('pointermove', e => { if (!dragging) return; const d = e.clientX - lastX; lastX = e.clientX; x += d; vx = d * .5; });
  const endDrag = () => { dragging = false; rail.style.cursor = ''; };
  rail.addEventListener('pointerup', endDrag); rail.addEventListener('pointercancel', endDrag);
  new IntersectionObserver(es => { railVisible = es[0].isIntersecting; }).observe(rail);
  const drift = () => {
    if (railVisible && !phone.matches && !reduce) {
      if (!dragging) { vx += ((hover ? -.08 : -.35) - vx) * .04; x += vx; }
      if (half) { if (x < -half) x += half; if (x > 0) x -= half; }
      track.style.transform = `translate3d(${x}px,0,0)`;
    }
    requestAnimationFrame(drift);
  };
  requestAnimationFrame(drift);

  /* Rheva's verse arrives line by line, the text itself never leaves the page */
  const poem = $('.rheva-poem');
  if (poem && !reduce) {
    poem.innerHTML = poem.innerHTML.split('<br>').map(l => `<span class="ln">${l}</span>`).join('<br>');
    const pio = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return; pio.disconnect();
      $$('.ln', poem).forEach((l, i) => l.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 300 + i * 420, fill: 'backwards' }));
    }, { rootMargin: '0px 0px 8% 0px' });
    if (poem.getBoundingClientRect().top > innerHeight) pio.observe(poem);
  }
})();
