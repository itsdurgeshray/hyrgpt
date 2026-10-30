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
  burger.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    burger.setAttribute('aria-expanded', open); $('.drawer').setAttribute('aria-hidden', !open);
  });
  $$('.drawer a').forEach(a => a.addEventListener('click', () => { nav.classList.remove('open'); burger.setAttribute('aria-expanded', false); }));

  /* testimonials: clone the set once so the rail can loop */
  const track = $('.quotes-track');
  $$('.quote', track).forEach(q => { const c = q.cloneNode(true); c.classList.add('dup'); c.setAttribute('aria-hidden', 'true'); track.append(c); });

  if (FIGMA) { html.classList.add('loaded'); return; }

  /* plates */
  window.HyrPlates.mount();
  const plateOf = el => el && el.__plate;

  /* smooth scroll */
  let lenis = null;
  if (window.Lenis && !reduce) {
    lenis = new Lenis({ lerp: .1, smoothWheel: true });
    if (window.gsap) {
      lenis.on('scroll', () => window.ScrollTrigger && ScrollTrigger.update());
      gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0);
    } else { const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
  }
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href'); if (id.length < 2) return;
    const t = $(id); if (!t) return;
    e.preventDefault();
    lenis ? lenis.scrollTo(t, { offset: -70 }) : t.scrollIntoView({ behavior: 'smooth' });
  }));

  /* reveals */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach((el, i) => {
    const sib = el.parentElement ? [...el.parentElement.children].filter(c => c.classList.contains('reveal')).indexOf(el) : 0;
    el.style.transitionDelay = `${Math.max(0, sib) * 90}ms`;
    io.observe(el);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => html.classList.add('loaded')));

  /* recruitment modules */
  const mods = $$('.mod'), modPlate = plateOf($('.mod-plate'));
  const count = $('.mod-count b'), bar = $('.mod-meter');
  let modIdx = 0, modST = null;
  const setMod = (i, fromScroll) => {
    if (i === modIdx && fromScroll) return;
    modIdx = i;
    mods.forEach((m, j) => m.classList.toggle('is-on', j === i));
    count.textContent = String(i + 1).padStart(2, '0');
    const p = plateOf($('.mod-plate')); if (p) p.show(i);
  };
  mods.forEach((m, i) => $('.mod-head', m).addEventListener('click', () => {
    if (desk.matches && modST) {
      const y = modST.start + (modST.end - modST.start) * ((i + .5) / mods.length);
      lenis ? lenis.scrollTo(y) : scrollTo({ top: y, behavior: 'smooth' });
    } else {
      const on = m.classList.contains('is-on');
      mods.forEach(x => x.classList.remove('is-on'));
      if (!on) m.classList.add('is-on');
    }
  }));

  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px)', () => {
      modST = ScrollTrigger.create({
        trigger: '.mod-pin', start: 'center center', end: () => '+=' + innerHeight * 3.2,
        pin: true, anticipatePin: 1,
        onUpdate: s => {
          bar.style.setProperty('--mp', s.progress);
          setMod(Math.min(mods.length - 1, Math.floor(s.progress * mods.length)), true);
        }
      });
      return () => { modST = null; };
    });
    /* thesis: the three levels light up as the lever scene passes */
    ScrollTrigger.create({
      trigger: '.levels', start: 'top 85%', end: 'top 35%', scrub: true,
      onUpdate: s => $('.levels').style.setProperty('--lv', s.progress)
    });
    /* hero drawing drifts slower than the page */
    gsap.to('.hero-plate', { yPercent: 10, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    addEventListener('load', () => ScrollTrigger.refresh());
  }

  /* testimonials rail: slow drift, draggable */
  const rail = $('.quotes');
  let x = 0, vx = -.35, dragging = false, lastX = 0, hover = false, half = 0;
  const measure = () => { half = track.scrollWidth / 2; };
  measure(); addEventListener('resize', measure);
  rail.addEventListener('pointerenter', () => hover = true);
  rail.addEventListener('pointerleave', () => { hover = false; dragging = false; });
  rail.addEventListener('pointerdown', e => { if (phone.matches) return; dragging = true; lastX = e.clientX; rail.setPointerCapture(e.pointerId); rail.style.cursor = 'grabbing'; });
  rail.addEventListener('pointermove', e => { if (!dragging) return; const d = e.clientX - lastX; lastX = e.clientX; x += d; vx = d * .5; });
  const endDrag = () => { dragging = false; rail.style.cursor = ''; };
  rail.addEventListener('pointerup', endDrag); rail.addEventListener('pointercancel', endDrag);
  let railVisible = false;
  new IntersectionObserver(es => { railVisible = es[0].isIntersecting; }).observe(rail);
  const drift = () => {
    if (railVisible && !phone.matches && !reduce) {
      if (!dragging) { const target = hover ? -.08 : -.35; vx += (target - vx) * .04; x += vx; }
      if (half) { if (x < -half) x += half; if (x > 0) x -= half; }
      track.style.transform = `translate3d(${x}px,0,0)`;
    }
    requestAnimationFrame(drift);
  };
  requestAnimationFrame(drift);

  /* ROI */
  const roles = $('#r-roles'), apps = $('#r-apps'), rate = $('#r-rate');
  const vRoi = $('#v-roi'), vHrs = $('#v-hrs');
  const fmt = n => '$' + Math.round(n).toLocaleString('en-US');
  let shown = { roi: 145800, hrs: 270 }, tween;
  const fill = r => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%');
  const calc = () => {
    [roles, apps, rate].forEach(fill);
    $('#o-roles').textContent = roles.value; $('#o-apps').textContent = apps.value; $('#o-rate').textContent = `$${rate.value}/hr`;
    // 12 minutes per resume by hand, about a tenth of that with HYRGPT
    const hrs = roles.value * apps.value * 12 * .9 / 60;
    const roi = hrs * rate.value * 12;
    const from = { ...shown }, t0 = performance.now();
    cancelAnimationFrame(tween);
    const step = t => {
      const k = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - k, 3);
      shown.roi = from.roi + (roi - from.roi) * e; shown.hrs = from.hrs + (hrs - from.hrs) * e;
      vRoi.textContent = fmt(shown.roi); vHrs.textContent = Math.round(shown.hrs).toLocaleString('en-US') + ' hrs';
      if (k < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
    const man = hrs / .9, ai = man - hrs;
    $('#v-man').textContent = Math.round(man).toLocaleString('en-US') + ' hrs';
    $('#v-ai').textContent = Math.round(ai).toLocaleString('en-US') + ' hrs';
    // the sun behind the sundial climbs as more hours come back
    const p = plateOf($('.roi-plate'));
    if (p) { const f = Math.min(1, Math.log10(1 + hrs) / Math.log10(1 + 9000)); p.setSun(.6 + .3 * f, .62 - .42 * f, .26 + .1 * f); }
  };
  [roles, apps, rate].forEach(r => r.addEventListener('input', calc));
  calc();

  /* Rheva writes her verse when she comes into view */
  const poem = $('[data-poem]');
  if (poem && !reduce) {
    const full = poem.innerHTML.split('<br>');
    poem.style.minHeight = poem.offsetHeight + 'px';
    poem.innerHTML = '<span class="caret"></span>';
    const pio = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return; pio.disconnect();
      let li = 0, ci = 0, out = [];
      const type = () => {
        if (li >= full.length) return;
        const line = full[li];
        out[li] = line.slice(0, ++ci);
        poem.innerHTML = out.join('<br>') + '<span class="caret"></span>';
        if (ci >= line.length) { li++; ci = 0; setTimeout(type, 260); } else setTimeout(type, 26);
      };
      setTimeout(type, 500);
    }, { threshold: .6 });
    pio.observe(poem);
  }
})();
