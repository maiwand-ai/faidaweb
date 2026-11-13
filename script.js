/* FAIDA website interactions. No libraries; everything degrades to a
   readable static page if JavaScript is off or motion is reduced. */
(() => {
  "use strict";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  $("#year").textContent = new Date().getFullYear();

  /* ---------- nav: background on scroll, progress bar, mobile menu ---------- */
  const nav = $(".nav");
  const progress = $(".scroll-progress");
  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle("is-scrolled", y > 20);
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const toggle = $(".nav__toggle");
  const mobile = $(".nav__mobile");
  const setMenu = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    mobile.hidden = !open;
  };
  setMenu(false);
  toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
  $$("a", mobile).forEach((a) => a.addEventListener("click", () => setMenu(false)));
  // close on Escape, on tapping outside the header, and when resizing up to desktop
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !mobile.hidden) { setMenu(false); toggle.focus(); } });
  document.addEventListener("click", (e) => { if (!mobile.hidden && !nav.contains(e.target)) setMenu(false); });
  matchMedia("(min-width: 861px)").addEventListener("change", (e) => { if (e.matches) setMenu(false); });

  /* ---------- reveal on scroll, with a stagger between siblings ---------- */
  $$(".reveal").forEach((el) => {
    const siblings = $$(":scope > .reveal", el.parentElement);
    const i = siblings.indexOf(el);
    if (i > 0) el.style.setProperty("--d", `${Math.min(i, 6) * 0.08}s`);
  });
  const onEnter = new Map();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in");
      io.unobserve(e.target);
      (onEnter.get(e.target) || []).forEach((fn) => fn());
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -40px 0px" });
  const whenVisible = (el, fn) => {
    if (!el) return;
    onEnter.set(el, [...(onEnter.get(el) || []), fn]);
    io.observe(el);
  };
  $$(".reveal, .steps").forEach((el) => io.observe(el));

  /* ---------- rotating headline word ---------- */
  const words = $$(".rotator__word");
  if (words.length > 1 && !reduceMotion) {
    let current = 0;
    setInterval(() => {
      const prev = words[current];
      current = (current + 1) % words.length;
      prev.classList.remove("is-active");
      prev.classList.add("is-leaving");
      words[current].classList.remove("is-leaving");
      words[current].classList.add("is-active");
      setTimeout(() => prev.classList.remove("is-leaving"), 650);
    }, 2800);
  }

  /* ---------- counters ---------- */
  $$("[data-count]").forEach((el) => {
    const target = Number(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    if (reduceMotion) { el.textContent = target + suffix; return; }
    whenVisible(el.closest(".stat"), () => {
      const start = performance.now();
      const dur = 1400;
      const tick = (now) => {
        const t = Math.min(1, (now - start) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3))) + suffix;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });

  /* ---------- hero: live candlestick chart with robot trades (sample data) ---------- */
  const canvas = $(".hero__chart");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    const W = 16;            // px per candle
    const CANDLE_MS = 1000;  // one new candle per second
    const R = 3.0;           // price units per 1R of risk
    const GREEN = "rgba(111,220,140,1)", RED = "rgba(240,138,138,1)", BLUE = "rgba(138,180,240,1)";
    let w = 0, h = 0, dpr = 1, running = true;
    let candles = [], trades = [], idx = 0, progress = 0, nextTick = 0, last = 0, sinceTrade = 6;
    let lo = 0, hi = 1, scaleReady = false, anchor = 0;
    const visual = $(".hero__visual");

    const drift = (i) => Math.sin(i / 26) * 0.1 + Math.sin(i / 9) * 0.05 + 0.012;
    const live = () => candles[candles.length - 1];
    const fmt = (v) => (2350 + v * 1.8).toFixed(2);

    const spawn = () => {
      const prev = live();
      const o = prev ? prev.c : 0;
      candles.push({ i: idx++, o, h: o, l: o, c: o });
      if (candles.length > 300) candles.shift();
    };
    const tick = (c) => {
      c.c += (Math.random() - 0.5 + drift(c.i)) * 0.55;
      c.h = Math.max(c.h, c.c + Math.random() * 0.12);
      c.l = Math.min(c.l, c.c - Math.random() * 0.12);
    };
    const buildCandle = () => { spawn(); const c = live(); for (let k = 0; k < 8; k++) tick(c); };

    // ---- trades: open on a fresh candle, trail the stop into profit, close on stop or target
    const openTrade = (now) => {
      const c = live();
      const back = candles[Math.max(0, candles.length - 9)];
      const dir = c.c >= back.c ? 1 : -1;
      trades.push({ dir, entry: c.c, entryI: c.i, stop: c.c - dir * R, best: 0, born: now, exitI: null, exit: null, closedAt: 0 });
      sinceTrade = 0;
    };
    const manageTrades = (now, quiet) => {
      const c = live();
      trades.forEach((t) => {
        if (t.exitI !== null) return;
        const r = (t.dir * (c.c - t.entry)) / R;
        t.best = Math.max(t.best, r);
        if (t.best >= 1) t.stop = Math.max(t.dir * t.stop, t.dir * (t.entry + t.dir * (t.best - 0.6) * R)) * t.dir; // profit lock
        const hitStop = t.dir * (c.c - t.stop) <= 0;
        if (hitStop || r >= 2.5) {
          t.exitI = c.i; t.exit = hitStop ? t.stop : c.c; t.closedAt = quiet ? now - 1000 : now;
          sinceTrade = 0;
        }
      });
    };

    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // live edge: just left of the device mockups on desktop, near the right edge on mobile
      const cr = canvas.getBoundingClientRect(), vr = visual && visual.getBoundingClientRect();
      const gap = vr ? vr.left - cr.left : 0;
      anchor = gap > w * 0.4 ? gap - 110 : w - 120;
      // pre-fill history so the chart starts full, with a few trades already on it
      const need = Math.ceil(anchor / W) + 8;
      while (candles.length < need) {
        buildCandle(); sinceTrade++;
        manageTrades(0, true);
        if (sinceTrade > 10 && !trades.some((t) => t.exitI === null) && Math.random() < 0.3) { openTrade(-1000); }
      }
    };

    const roundRect = (x, y, rw, rh, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + rw, y, x + rw, y + rh, r); ctx.arcTo(x + rw, y + rh, x, y + rh, r); ctx.arcTo(x, y + rh, x, y, r); ctx.arcTo(x, y, x + rw, y, r); ctx.closePath(); };
    const tag = (text, x, y, color, alpha = 1, scale = 1, filled = false) => {
      ctx.save();
      ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(scale, scale);
      ctx.font = "600 11px Inter, system-ui, sans-serif";
      const tw = ctx.measureText(text).width + 16;
      roundRect(-tw / 2, -11, tw, 22, 11);
      ctx.fillStyle = filled ? color : "rgba(0,0,0,.8)"; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = filled ? "#04110a" : color; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 0, 0.5);
      ctx.restore();
      return tw;
    };
    const easeBack = (t) => { const s = 1.70158; t -= 1; return t * t * ((s + 1) * t + s) + 1; };

    const draw = (now) => {
      ctx.clearRect(0, 0, w, h);
      const lastI = live().i;
      const xOf = (i) => anchor + (i - lastI) * W + W * (1 - progress);
      const first = lastI - Math.ceil(anchor / W) - 3;
      const vis = candles.filter((c) => c.i >= first);

      // smooth auto-scale so the chart never jumps
      let tlo = Infinity, thi = -Infinity;
      vis.forEach((c) => { tlo = Math.min(tlo, c.l); thi = Math.max(thi, c.h); });
      const pad = (thi - tlo) * 0.3 + 1;
      tlo -= pad; thi += pad;
      if (!scaleReady) { lo = tlo; hi = thi; scaleReady = true; }
      lo += (tlo - lo) * 0.06; hi += (thi - hi) * 0.06;
      const y = (v) => h * 0.34 + (1 - (v - lo) / (hi - lo)) * h * 0.56; // lower band, keeps the headline clear

      // moving average glow
      ctx.beginPath();
      vis.forEach((c, k) => {
        const from = Math.max(0, k - 9);
        const avg = vis.slice(from, k + 1).reduce((s, q) => s + q.c, 0) / (k - from + 1);
        const x = xOf(c.i) + W / 2;
        k ? ctx.lineTo(x, y(avg)) : ctx.moveTo(x, y(avg));
      });
      ctx.strokeStyle = "rgba(138,180,240,.5)"; ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(138,180,240,.8)"; ctx.shadowBlur = 14; ctx.stroke(); ctx.shadowBlur = 0;

      // candles (the live one is brighter)
      vis.forEach((c) => {
        const x = xOf(c.i), up = c.c >= c.o, isLive = c.i === lastI;
        const a = isLive ? 0.95 : 0.5;
        ctx.strokeStyle = ctx.fillStyle = up ? `rgba(111,220,140,${a})` : `rgba(240,138,138,${a - 0.05})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + W / 2, y(c.h)); ctx.lineTo(x + W / 2, y(c.l)); ctx.stroke();
        const top = y(Math.max(c.o, c.c));
        ctx.fillRect(x + 3, top, W - 6, Math.max(1.5, y(Math.min(c.o, c.c)) - top));
      });

      // trades
      trades = trades.filter((t) => t.exitI === null || t.exitI >= first - 2);
      trades.forEach((t) => {
        const open = t.exitI === null;
        const x1 = xOf(t.entryI) + W / 2, y1 = y(t.entry);
        const xEnd = open ? xOf(lastI) + W / 2 : xOf(t.exitI) + W / 2;
        const pEnd = open ? live().c : t.exit;
        const r = (t.dir * (pEnd - t.entry)) / R;
        const col = r >= 0 ? GREEN : RED;
        const pop = easeBack(Math.min(1, Math.max(0, (now - t.born) / 450)));

        // shaded P/L zone between entry and current/exit price
        ctx.fillStyle = r >= 0 ? "rgba(111,220,140,.07)" : "rgba(240,138,138,.07)";
        ctx.fillRect(x1, Math.min(y1, y(pEnd)), xEnd - x1, Math.abs(y(pEnd) - y1));

        // entry level
        ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = BLUE; ctx.globalAlpha = .55; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(xEnd, y1); ctx.stroke(); ctx.restore();

        // protective stop (red, turns green once locked in profit)
        if (open) {
          const locked = t.dir * (t.stop - t.entry) > 0;
          ctx.save(); ctx.strokeStyle = locked ? GREEN : RED; ctx.globalAlpha = .8; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x1, y(t.stop)); ctx.lineTo(xEnd + 8, y(t.stop)); ctx.stroke(); ctx.restore();
          ctx.font = "600 10px Inter, system-ui, sans-serif"; ctx.fillStyle = locked ? GREEN : RED; ctx.textAlign = "left"; ctx.textBaseline = "middle";
          ctx.fillText(locked ? "profit locked" : "stop", xEnd + 12, y(t.stop));
        }

        // entry arrow + BUY/SELL tag (pops in)
        const ay = y1 + t.dir * 8;
        ctx.save(); ctx.translate(x1, ay); ctx.scale(pop, pop);
        ctx.fillStyle = BLUE; ctx.beginPath();
        ctx.moveTo(0, -t.dir * 4); ctx.lineTo(-6, t.dir * 7); ctx.lineTo(6, t.dir * 7); ctx.closePath(); ctx.fill();
        ctx.restore();
        tag(t.dir > 0 ? "BUY" : "SELL", x1, y1 + t.dir * 32, BLUE, Math.min(1, pop), pop, true);

        // exit / live result
        const label = `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}R`;
        if (open) {
          tag(`${t.dir > 0 ? "Buy" : "Sell"} open ${label}`, xEnd - 10, y(pEnd) - t.dir * 34, col);
        } else {
          const since = (now - t.closedAt) / 400;
          const ring = Math.min(1, since);
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(xEnd, y(pEnd), 4, 0, Math.PI * 2); ctx.fill();
          if (ring < 1) { ctx.strokeStyle = col; ctx.globalAlpha = 1 - ring; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(xEnd, y(pEnd), 4 + ring * 18, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
          tag(`Closed ${label}`, xEnd, y(pEnd) - t.dir * 34, col, 1, easeBack(Math.min(1, since)));
        }
      });

      // live price line + tag on the right edge
      const pc = live(), py = y(pc.c), up = pc.c >= pc.o, pcol = up ? GREEN : RED;
      ctx.save(); ctx.setLineDash([2, 4]); ctx.strokeStyle = pcol; ctx.globalAlpha = .6; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(anchor + W + 14, py); ctx.stroke(); ctx.restore();
      ctx.font = "600 11px Inter, system-ui, sans-serif";
      const txt = fmt(pc.c), tw = ctx.measureText(txt).width + 14;
      const tx = anchor + W + 14;
      roundRect(tx, py - 11, tw, 22, 6); ctx.fillStyle = pcol; ctx.fill();
      ctx.fillStyle = "#04110a"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, tx + tw / 2, py + .5);
    };

    const step = (now) => {
      const dt = Math.min(100, now - (last || now)); last = now;
      if (running) {
        progress += dt / CANDLE_MS;
        if (now >= nextTick) { tick(live()); manageTrades(now); nextTick = now + 70 + Math.random() * 90; }
        if (progress >= 1) {
          progress -= 1; spawn(); sinceTrade++;
          if (sinceTrade > 6 && !trades.some((t) => t.exitI === null) && Math.random() < 0.35) openTrade(now);
        }
        draw(now);
      }
      requestAnimationFrame(step);
    };

    resize(); draw(performance.now());
    addEventListener("resize", () => { resize(); draw(performance.now()); });
    if (!reduceMotion) {
      new IntersectionObserver(([e]) => { running = e.isIntersecting; }).observe(canvas);
      requestAnimationFrame(step);
    }
  }

  /* ---------- live markets strip: sample prices tick with sparklines ---------- */
  const mkts = $$(".mkt");
  if (mkts.length) {
    const state = mkts.map((el) => {
      const price = Number(el.dataset.price), dec = Number(el.dataset.dec), chg = Number(el.dataset.chg);
      const prevClose = price / (1 + chg / 100);
      // build a 40-point history that ends at the current price
      const pts = [price];
      for (let k = 1; k < 40; k += 1) pts.unshift(pts[0] - (Math.random() - 0.5 + chg * 0.04) * price * 0.0012);
      return { el, dec, prevClose, pts, priceEl: $(".mkt__price", el), chgEl: $(".mkt__chg", el), line: $(".mkt__line", el), area: $(".mkt__area", el) };
    });
    const render = (m) => {
      const lo = Math.min(...m.pts), hi = Math.max(...m.pts), span = hi - lo || 1;
      const d = m.pts.map((v, k) => `${k ? "L" : "M"}${((k / (m.pts.length - 1)) * 100).toFixed(2)} ${(27 - ((v - lo) / span) * 24).toFixed(2)}`).join(" ");
      m.line.setAttribute("d", d);
      m.area.setAttribute("d", `${d} L100 30 L0 30Z`);
      const p = m.pts[m.pts.length - 1];
      const pct = ((p - m.prevClose) / m.prevClose) * 100;
      m.priceEl.textContent = p.toLocaleString("en-US", { minimumFractionDigits: m.dec, maximumFractionDigits: m.dec });
      m.chgEl.textContent = `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%`;
      m.el.classList.toggle("is-down", pct < 0);
    };
    state.forEach(render);
    if (!reduceMotion) {
      let visible = true;
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe($(".markets"));
      const step = () => {
        if (visible && !document.hidden) {
          const m = state[Math.floor(Math.random() * state.length)];
          const p = m.pts[m.pts.length - 1];
          const next = p + (Math.random() - 0.48) * p * 0.0009;
          m.pts.push(next); m.pts.shift();
          render(m);
          const cls = next >= p ? "flash-up" : "flash-down";
          m.priceEl.classList.remove("flash-up", "flash-down");
          void m.priceEl.offsetWidth; // restart the flash
          m.priceEl.classList.add(cls);
          setTimeout(() => m.priceEl.classList.remove(cls), 120);
        }
        setTimeout(step, 350 + Math.random() * 500);
      };
      setTimeout(step, 800);
    }
  }

  /* ---------- product tour player + looping reel ---------- */
  const tour = $(".tour");
  if (tour) {
    const video = $(".tour__video", tour);
    const closeBtn = $(".tour__close", tour);
    let opener = null;
    const close = () => {
      video.pause();
      tour.hidden = true;
      document.body.classList.remove("is-locked");
      if (opener) opener.focus();
    };
    $$("[data-tour]").forEach((btn) => btn.addEventListener("click", (e) => {
      e.preventDefault();
      opener = btn;
      tour.hidden = false;
      document.body.classList.add("is-locked");
      closeBtn.focus();
      video.play().catch(() => {}); // the browser may require a second tap on some phones
    }));
    $$("[data-close]", tour).forEach((el) => el.addEventListener("click", close));
    addEventListener("keydown", (e) => { if (e.key === "Escape" && !tour.hidden) close(); });
  }

  const reel = $(".reel__video");
  if (reel) {
    if (reduceMotion) {
      reel.controls = true; // no autoplay; let people press play themselves
    } else {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) reel.play().catch(() => { reel.controls = true; });
        else reel.pause();
      }, { threshold: 0.35 }).observe(reel);
    }
  }

  /* ---------- 3D tilt, magnetic buttons, spotlight cards (mouse only) ---------- */
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  if (finePointer && !reduceMotion) {
    $$("[data-tilt]").forEach((el) => {
      el.style.transition = "transform .2s ease-out";
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const yv = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `rotateY(${x * 8}deg) rotateX(${-yv * 6}deg)`;
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
    $$(".magnetic").forEach((btn) => {
      btn.addEventListener("mousemove", (e) => {
        const r = btn.getBoundingClientRect();
        btn.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.3}px)`;
      });
      btn.addEventListener("mouseleave", () => { btn.style.transform = ""; });
    });
    $$(".robot, .card, .step, .feed-point, .control__item").forEach((card) => {
      card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    });
  }

  /* ---------- validation checklist ticks itself off ---------- */
  const checks = $$(".checks li");
  whenVisible($(".gauge-card")?.closest(".reveal"), () => {
    checks.forEach((li, i) => setTimeout(() => li.classList.add("is-done"), reduceMotion ? 0 : 450 + i * 420));
  });

  /* ---------- profit-lock demo: the stop follows price into profit ---------- */
  const demo = $("#lockDemo");
  if (demo) {
    const path = $(".ld-price", demo), dot = $(".ld-dot", demo), stop = $(".ld-stop", demo);
    const stopLabel = $(".ld-stop-label", demo), status = $(".lock-demo__status", demo);
    const ENTRY = 230, TARGET = 60, R = 70; // px: 1R = entry - initial stop distance
    const LOCK_START = 0.5, KEEP = 0.5;
    const total = path.getTotalLength();
    let raf = 0;
    const setStop = (yv, inProfit) => {
      stop.setAttribute("y1", yv); stop.setAttribute("y2", yv);
      stopLabel.setAttribute("y", yv - 8);
      const r = (ENTRY - yv) / R;
      stopLabel.textContent = `Stop: ${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}R`;
      stop.classList.toggle("is-profit", inProfit);
      stopLabel.classList.toggle("is-profit", inProfit);
    };
    const say = (text, good) => { status.textContent = text; status.classList.toggle("is-good", !!good); };
    const play = () => {
      cancelAnimationFrame(raf);
      path.style.strokeDasharray = total; path.style.strokeDashoffset = total;
      setStop(ENTRY + R, false); say("Trade opened");
      let stopY = ENTRY + R, best = ENTRY, locked = false;
      const dur = reduceMotion ? 1 : 6500, start = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - start) / dur);
        const len = total * t;
        const p = path.getPointAtLength(len);
        path.style.strokeDashoffset = total - len;
        dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y);
        best = Math.min(best, p.y);
        const moved = ENTRY - best;
        if (moved >= LOCK_START * (ENTRY - TARGET)) {
          const lockY = ENTRY - KEEP * moved;
          if (lockY < stopY) {
            if (!locked) say("Halfway to target: stop moved into profit", true);
            locked = true; stopY = lockY; setStop(stopY, true);
            if (moved > 0.72 * (ENTRY - TARGET)) say("Stop keeps rising with price", true);
          }
        }
        if (locked && p.y >= stopY && t > 0.55) {
          say(`Price fell back: closed at the locked stop, ${stopLabel.textContent.replace("Stop: ", "")} profit`, true);
          return;
        }
        if (t < 1) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };
    whenVisible(demo, play);
    $("#replayLock").addEventListener("click", play);
  }

  /* ---------- pricing: monthly / yearly ---------- */
  const billing = $(".billing");
  const animateNumber = (el, to) => {
    const from = Number(el.textContent) || 0;
    if (reduceMotion) { el.textContent = to; return; }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 500);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  $$(".billing__opt").forEach((btn) => btn.addEventListener("click", () => {
    const period = btn.dataset.period;
    $$(".billing__opt").forEach((b) => b.classList.toggle("is-active", b === btn));
    billing.classList.toggle("is-yearly", period === "yearly");
    $$(".price__num").forEach((el) => animateNumber(el, Number(el.dataset[period])));
    $$(".price__per").forEach((el) => { el.textContent = period === "yearly" ? "/year" : "/month"; });
    $$(".price__note").forEach((el) => { el.textContent = el.dataset[period]; });
  }));

  /* ---------- mockups: sample profits tick like a live screen ---------- */
  const pnls = $$("[data-live-pnl]");
  if (pnls.length && !reduceMotion) {
    const money = (v) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const values = pnls.map((el) => Number(el.dataset.livePnl));
    const baseOpen = values.reduce((a, b) => a + b, 0);
    setInterval(() => {
      const i = Math.floor(Math.random() * pnls.length);
      values[i] = Math.max(5, values[i] + (Math.random() - 0.45) * 6);
      pnls[i].textContent = money(values[i]);
      pnls[i].classList.add("is-tick");
      setTimeout(() => pnls[i].classList.remove("is-tick"), 350);
      const open = values.reduce((a, b) => a + b, 0) - baseOpen;
      $$("[data-live-equity]").forEach((el) => { el.textContent = `$${Math.round(25480 + open).toLocaleString("en-US")}`; });
      $$("[data-live-today]").forEach((el) => {
        el.textContent = money(270.4 + open) + (el.tagName === "EM" ? " today" : "");
      });
    }, 1300);
  }

  /* ---------- live feed of robot decisions (sample messages) ---------- */
  const feed = $(".feed__list");
  if (feed) {
    const items = [
      ["bot", "DCA · Gold", "Opened a BUY trade: 3 of 3 indicators agreed"],
      ["lock", "DCA · Gold", "Profit locked: stop moved to +0.6R", true],
      ["clock", "Grid · EURUSD", "Range market: 1 of 3 indicators agreed, 2 needed"],
      ["news", "All robots", "US news in 10 minutes: pausing new trades"],
      ["target", "Reversal · US Tech", "Closed at take profit: +1.5R", true],
      ["pause", "Range · EURJPY", "Cooling off after a losing trade (45 min left)"],
      ["trend-up", "Momentum · DAX", "Uptrend confirmed, waiting for a pullback"],
      ["lock", "Six-Signal · FTSE", "Stop raised again: now +0.9R", true],
      ["check-circle", "DCA · Gold", "Closed at the locked stop, in profit: +0.8R", true],
      ["send", "FAIDA", "Daily summary sent to Telegram"],
    ];
    let n = 0;
    const push = () => {
      const [ic, who, text, good] = items[n % items.length];
      n += 1;
      const li = document.createElement("li");
      li.className = `feed__item${good ? " feed__item--good" : ""}`;
      li.innerHTML = `<span class="feed__ic"><svg class="i"><use href="#i-${ic}"/></svg></span><span><b>${who} · just now</b>${text}</span>`;
      feed.prepend(li);
      while (feed.children.length > 6) feed.lastElementChild.remove();
    };
    for (let k = 0; k < 4; k += 1) push();
    if (!reduceMotion) {
      let timer = 0;
      new IntersectionObserver(([e]) => {
        clearInterval(timer);
        if (e.isIntersecting) timer = setInterval(push, 2200);
      }).observe(feed);
    }
  }

  /* ---------- checkout: not connected yet ---------- */
  const toast = $(".toast");
  let toastTimer = 0;
  const showToast = (text) => {
    toast.textContent = text; toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add("is-show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.classList.remove("is-show"); setTimeout(() => { toast.hidden = true; }, 300); }, 3800);
  };
  // Replace these links with the payment provider's checkout URLs when it is set up.
  $$(".checkout").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    showToast(`Checkout isn't connected yet. This is where the ${a.dataset.plan} free trial will start.`);
  }));
})();
