[21st.dev/@zanwei/components/status-indicator](https://21st.dev/@zanwei/components/status-indicator)

You are given a task to integrate an existing React component in the codebase

The codebase should support:

- shadcn project structure
- Tailwind CSS
- Typescript

If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.

Determine the default path for components and styles.
If default path for components is not /components/ui, provide instructions on why it's important to create this folder
Copy-paste this component to /components/ui folder:

```tsx
status-indicator.tsx
import * as React from "react";

/*
 * <status-indicator> — a status page-indicator Web Component.
 *
 * Five states (Backlog / In progress / Needs Review / Done / Cancel).
 * The selected dot morphs into a labeled pill: a single progress spring per
 * item drives dot ↔ pill continuously, so switches are interruptible and
 * retarget mid-flight.
 *
 * Geometry (design px, rendered rem-based):
 *   dot ø6 in a 26×26 hit box · pill h28 · icon 18 @ x8 · label x34 (Inter 500 14/20)
 *   right pad 12 · gap between items 8 · radius full
 */

const DESIGN = {
  HIT: 26,      // unselected item width/height basis (dot hit area)
  DOT: 6,       // dot diameter
  PILL_H: 28,   // pill height
  ICON: 18,     // icon box
  PAD_L: 8,     // pill left padding
  GAP_ICON: 8,  // icon → label gap (label sits at x = 8 + 18 + 8 = 34)
  PAD_R: 12,    // pill right padding
};
const LABEL_X = DESIGN.PAD_L + DESIGN.ICON + DESIGN.GAP_ICON;

// Morph spring (response ~0.42s, mild bounce).
const OMEGA = (2 * Math.PI) / 0.42;
const ZETA = 0.86;
const K = OMEGA * OMEGA;
const C = 2 * ZETA * OMEGA;

// Lucide glyphs (24 viewBox, stroke 2 → 1.5 @ 18px).
const ICONS = {
  'circle-dashed':
    '<path d="M10.1 2.182a10 10 0 0 1 3.8 0"/><path d="M13.9 21.818a10 10 0 0 1-3.8 0"/><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"/><path d="M2.182 13.9a10 10 0 0 1 0-3.8"/><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"/><path d="M21.818 10.1a10 10 0 0 1 0 3.8"/><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"/><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/>',
  loader:
    '<path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  'circle-x': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
};

const DEFAULT_STATUSES = [
  { id: 'backlog', label: 'Backlog', color: '#7e8186', icon: 'circle-dashed' },
  { id: 'in-progress', label: 'In progress', color: '#7e8186', icon: 'loader', spin: true },
  { id: 'needs-review', label: 'Needs Review', color: '#eaaa08', icon: 'info' },
  { id: 'done', label: 'Done', color: '#079455', icon: 'circle-check' },
  { id: 'cancel', label: 'Cancel', color: '#f04438', icon: 'circle-x' },
];

const DRAG_THRESHOLD = 4; // px before a press becomes a scrub

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;

const STYLE = `
:host {
  display: inline-block;
  font-family: "Inter", "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --si-pill-bg: #efeff1;
  --si-label: #1a1b1e;
  --si-dot: #d5d7da;
  --si-dot-hover: #c9ccd1;
  --si-dot-hover-bg: rgba(26, 27, 30, 0.06);
  --si-duration-in: 120ms;
  --si-duration-out: 160ms;
  --si-ease-color: ease;
  --si-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --si-ease-return: cubic-bezier(0.34, 1.36, 0.64, 1);
}
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 1.75rem;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}
.item {
  position: relative;
  height: 1.75rem;
  flex: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  appearance: none;
  font: inherit;
  cursor: pointer;
  border-radius: 624.9375rem;
  -webkit-tap-highlight-color: transparent;
  /* contain the ::after's z-index: -1 so the hover bg stays inside the item */
  isolation: isolate;
}
.item::before { /* generous hit area, no layout impact */
  content: "";
  position: absolute;
  inset: -0.25rem;
}
.item::after {
  /* dot hover background: same height as the active pill (28px), width =
     height, radius-full, centered on the dot. Margin-centered (not
     transform) so reduced-motion can zero the transform safely. */
  content: "";
  position: absolute;
  z-index: -1;
  left: 50%;
  top: 50%;
  width: 1.75rem;
  height: 1.75rem;
  margin: -0.875rem 0 0 -0.875rem;
  border-radius: 624.9375rem;
  background: var(--si-dot-hover-bg);
  opacity: 0;
  transform: scale(0.9);
  transition: opacity var(--si-duration-out) var(--si-ease-color),
              transform var(--si-duration-out) var(--si-ease-return);
}
@media (hover: hover) and (pointer: fine) {
  .item[aria-checked="false"]:hover::after {
    opacity: 1;
    transform: scale(1);
    transition: opacity var(--si-duration-in) var(--si-ease-color),
                transform var(--si-duration-in) var(--si-ease-out);
  }
}
.item[aria-checked="false"]:active::after {
  opacity: 1;
  transform: scale(0.94);
  transition: opacity var(--si-duration-in) var(--si-ease-color),
              transform var(--si-duration-in) var(--si-ease-out);
}
.item:focus-visible {
  outline: 0.125rem solid var(--si-focus-ring, #1a1b1e);
  outline-offset: 0.125rem;
}
.pill {
  position: absolute;
  overflow: hidden;
  border-radius: 624.9375rem;
  /* Surface alpha is driven per-frame via --_pill-a (element opacity would
     hide the dot). color-mix keeps --si-pill-bg a pass-through token that
     accepts any CSS color and retargets live on theme changes. */
  background: color-mix(in srgb, var(--si-pill-bg) var(--_pill-a, 0%), transparent);
}
.glyph {
  position: absolute;
  width: 1.125rem;
  height: 1.125rem;
}
.dotc {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--si-dot);
  /* resting rule = return direction: soft bounce back */
  transition: background-color var(--si-duration-out) var(--si-ease-color),
              transform var(--si-duration-out) var(--si-ease-return);
}
@media (hover: hover) and (pointer: fine) {
  .item[aria-checked="false"]:hover .dotc {
    background: var(--si-dot-hover);
    /* enter direction: fast, decisive */
    transition: background-color var(--si-duration-in) var(--si-ease-color),
                transform var(--si-duration-in) var(--si-ease-out);
  }
}
.item[aria-checked="false"]:active .dotc {
  transform: scale(0.85);
  transition: background-color var(--si-duration-in) var(--si-ease-color),
              transform var(--si-duration-in) var(--si-ease-out);
}
/* While scrubbing, pointer capture pins :hover/:active to the item where the
   press started. Suppress those stale states so the highlight follows the
   selection (the morphing capsule) instead of the initial dot. */
.row.is-dragging .item .dotc {
  background: var(--si-dot);
  transform: none;
}
.row.is-dragging .item::after {
  opacity: 0;
  transform: scale(0.9);
}
.icon {
  position: absolute;
  inset: 0;
}
.icon svg {
  display: block;
  width: 100%;
  height: 100%;
}
.icon svg path.check {
  stroke-dasharray: var(--check-len, none);
  stroke-dashoffset: var(--check-len, 0);
  transition: stroke-dashoffset 200ms cubic-bezier(0.23, 1, 0.32, 1) 120ms;
}
.item[aria-checked="true"] .icon svg path.check {
  stroke-dashoffset: 0;
}
/* Loader spokes carry a clockwise opacity tail so the steps(8) rotation reads
   as a chase (a plain rotation of 8 identical spokes maps onto itself). */
.glyph--spin svg path:nth-child(1) { opacity: 1; }
.glyph--spin svg path:nth-child(2) { opacity: 0.91; }
.glyph--spin svg path:nth-child(3) { opacity: 0.82; }
.glyph--spin svg path:nth-child(4) { opacity: 0.73; }
.glyph--spin svg path:nth-child(5) { opacity: 0.64; }
.glyph--spin svg path:nth-child(6) { opacity: 0.55; }
.glyph--spin svg path:nth-child(7) { opacity: 0.46; }
.glyph--spin svg path:nth-child(8) { opacity: 0.37; }
.glyph--spin svg {
  animation: si-spin 0.8s steps(8, end) infinite;
}
.item[aria-checked="false"] .glyph--spin svg {
  animation-play-state: paused;
}
@keyframes si-spin {
  to { transform: rotate(360deg); }
}
.label {
  position: absolute;
  white-space: nowrap;
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--si-label);
}
.measure {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
  white-space: nowrap;
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
  letter-spacing: -0.01em;
}
@media (prefers-reduced-motion: reduce) {
  .dotc { transition: background-color var(--si-duration-out) var(--si-ease-color); }
  .item[aria-checked="false"]:hover .dotc,
  .item[aria-checked="false"]:active .dotc { transform: none; }
  .item::after,
  .item[aria-checked="false"]:hover::after,
  .item[aria-checked="false"]:active::after {
    transform: none;
    transition: opacity var(--si-duration-out) var(--si-ease-color);
  }
  .glyph--spin svg { animation: none; }
  .icon svg path.check {
    transition: none;
    stroke-dashoffset: 0;
  }
}
`;

// Safe to import outside the browser (SSR, Node test runners): fall back to a
// plain class base and skip registration when the DOM APIs are absent.
const Base = globalThis.HTMLElement ?? class {};

export class StatusIndicator extends Base {
  static get observedAttributes() { return ['value', 'aria-label']; }
  /** Debug: slow every spring down, e.g. StatusIndicator.timeScale = 0.2 */
  static timeScale = 1;

  #statuses = DEFAULT_STATUSES;
  #items = [];        // { el, pill, glyph, dot, icon, label, spring: {p, v, target}, pillW }
  #index = 0;
  #raf = 0;
  #lastT = 0;
  #rem = 16;
  #pointerId = null;
  #dragStartX = 0;
  #dragged = false;
  #downIndex = -1;
  #dragCenters = null;
  #everConnected = false;
  #springResponse = 0.42;
  #springZeta = ZETA;
  #k = K;
  #c = C;
  #checkLenMeasured = false;
  #visibilityObserver = null;
  #measuredVisible = false;
  // Guarded for DOM-less test environments (jsdom lacks matchMedia).
  #reducedMotion = typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    root.append(style);
    this.#build();
  }

  connectedCallback() {
    this.#rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    this.#syncAriaLabel();
    this.#measure();
    // One-time per build: measure the true check-path length for the draw-in.
    if (!this.#checkLenMeasured) {
      this.#checkLenMeasured = true;
      for (const item of this.#items) {
        const check = item.icon.querySelector('path.check');
        if (check) {
          check.parentElement.parentElement.style.setProperty(
            '--check-len', `${Math.ceil(check.getTotalLength()) + 1}`);
        }
      }
    }
    this.#renderAll();
    // Resume a morph that was interrupted by a reparent mid-flight.
    if (this.#items.some((it) => it.spring.p !== it.spring.target || it.spring.v !== 0)) {
      if (this.#reducedMotion.matches) {
        for (const it of this.#items) { it.spring.p = it.spring.target; it.spring.v = 0; }
        this.#renderAll();
      } else {
        this.#startLoop();
      }
    }
    document.fonts?.ready.then(() => {
      if (!this.isConnected) return;
      this.#measure();
      this.#renderAll();
    });
    window.addEventListener('resize', this.#onResize);
    // Connected inside a hidden container (inactive tab, closed <details>,
    // unshown dialog): labels measure 0 there — re-measure once visible.
    if (typeof ResizeObserver !== 'undefined' && !this.#visibilityObserver) {
      this.#visibilityObserver = new ResizeObserver(() => {
        if (!this.#measuredVisible && this.isConnected) {
          this.#measure();
          if (this.#measuredVisible) this.#renderAll();
        }
      });
      this.#visibilityObserver.observe(this);
    }
    this.#everConnected = true;
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    window.removeEventListener('resize', this.#onResize);
    this.#visibilityObserver?.disconnect();
    this.#visibilityObserver = null;
    this.#resetGesture();
  }

  attributeChangedCallback(name, oldV, newV) {
    if (name === 'value' && newV !== oldV) {
      const i = this.#statuses.findIndex((s) => s.id === newV);
      if (i >= 0 && i !== this.#index) this.#select(i, { emit: false });
      else if (i < 0 && newV !== null) {
        console.warn(`<status-indicator> unknown value "${newV}" ignored — ` +
          `known ids: ${this.#statuses.map((s) => s.id).join(', ')}.`);
      }
    } else if (name === 'aria-label') {
      this.#syncAriaLabel();
    }
  }

  #syncAriaLabel() {
    this.shadowRoot.querySelector('.row')
      ?.setAttribute('aria-label', this.getAttribute('aria-label') || 'Status');
  }

  #resetGesture() {
    this.#pointerId = null;
    this.#dragged = false;
    this.#downIndex = -1;
    this.#dragCenters = null;
    this.shadowRoot.querySelector('.row')?.classList.remove('is-dragging');
  }

  #onResize = () => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    if (rem !== this.#rem) {
      this.#rem = rem;
      this.#measure();
      this.#renderAll();
    }
  };

  get value() { return this.#statuses[this.#index]?.id; }
  set value(v) {
    const i = this.#statuses.findIndex((s) => s.id === v);
    if (i >= 0) this.#select(i, { emit: false });
    else {
      console.warn(`<status-indicator> unknown value "${v}" ignored — ` +
        `known ids: ${this.#statuses.map((s) => s.id).join(', ')}.`);
    }
  }
  /** Spring tuning: { response: seconds, zeta: dampingRatio }. */
  get spring() { return { response: this.#springResponse, zeta: this.#springZeta }; }
  set spring(cfg) {
    if (!cfg) return;
    const r = Number(cfg.response);
    const z = Number(cfg.zeta);
    if (Number.isFinite(r)) this.#springResponse = Math.min(Math.max(r, 0.05), 3);
    if (Number.isFinite(z)) this.#springZeta = Math.min(Math.max(z, 0.05), 1.5);
    const omega = (2 * Math.PI) / this.#springResponse;
    this.#k = omega * omega;
    this.#c = 2 * this.#springZeta * omega;
  }

  get index() { return this.#index; }
  set index(i) {
    if (Number.isInteger(i) && i >= 0 && i < this.#statuses.length) this.#select(i, { emit: false });
  }
  get statuses() { return this.#statuses.map((s) => ({ ...s })); }
  set statuses(list) {
    if (!Array.isArray(list)) return;
    const cleaned = list.filter((s) => {
      const ok = s && typeof s.id === 'string' && s.id !== '' && typeof s.label === 'string';
      if (!ok) console.warn('<status-indicator> ignoring status without string id/label:', s);
      return ok;
    });
    if (cleaned.length === 0) return;
    const prevId = this.#statuses[this.#index]?.id;
    const hadFocus = this.shadowRoot.activeElement?.classList.contains('item');
    this.#statuses = cleaned.map((s) => ({ ...s }));
    const kept = this.#statuses.findIndex((s) => s.id === prevId);
    this.#index = kept >= 0 ? kept : Math.min(this.#index, this.#statuses.length - 1);
    this.#build();
    if (this.isConnected) { this.#measure(); this.#renderAll(); }
    if (hadFocus) this.#items[this.#index].el.focus();
    const id = this.#statuses[this.#index].id;
    if (this.getAttribute('value') !== id) this.setAttribute('value', id);
    if (kept < 0 && prevId !== undefined) {
      this.dispatchEvent(new CustomEvent('change', {
        bubbles: true, composed: true,
        detail: { value: id, index: this.#index, label: this.#statuses[this.#index].label },
      }));
    }
  }

  #build() {
    const root = this.shadowRoot;
    this.#resetGesture();
    this.#checkLenMeasured = false;
    root.querySelector('.row')?.remove();
    root.querySelector('.measure')?.remove();

    const row = document.createElement('div');
    row.className = 'row';
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', this.getAttribute('aria-label') || 'Status');

    this.#items = this.#statuses.map((status, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'item';
      el.setAttribute('role', 'radio');
      el.dataset.index = i;

      const pill = document.createElement('span');
      pill.className = 'pill';

      const glyph = document.createElement('span');
      glyph.className = 'glyph' + (status.spin ? ' glyph--spin' : '');
      glyph.style.color = status.color;

      const dot = document.createElement('span');
      dot.className = 'dotc';

      const icon = document.createElement('span');
      icon.className = 'icon';
      // status.icon accepts a built-in name, raw SVG inner markup for the
      // 24x24 viewBox (e.g. '<path d="..."/>'), or a complete <svg> element.
      const iconSource = typeof status.icon === 'string' ? status.icon : '';
      if (iconSource.trimStart().startsWith('<svg')) {
        icon.innerHTML = iconSource;
      } else {
        let glyphMarkup = ICONS[iconSource] ?? '';
        if (glyphMarkup && iconSource === 'circle-check') {
          glyphMarkup = glyphMarkup.replace('<path', '<path class="check"');
        } else if (!glyphMarkup && iconSource.trimStart().startsWith('<')) {
          glyphMarkup = iconSource;
        } else if (!glyphMarkup && iconSource) {
          console.warn(
            `<status-indicator> unknown icon "${iconSource}" — use one of ` +
            `${Object.keys(ICONS).join(', ')}, raw SVG inner markup, or a full <svg>.`,
          );
        }
        icon.innerHTML =
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
          `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphMarkup}</svg>`;
      }

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = status.label;

      glyph.append(dot, icon);
      pill.append(glyph, label);
      el.append(pill);
      row.append(el);

      return {
        el, pill, glyph, dot, icon, label,
        spring: { p: i === this.#index ? 1 : 0, v: 0, target: i === this.#index ? 1 : 0 },
        pillW: 0,
      };
    });

    const measure = document.createElement('span');
    measure.className = 'measure';
    row.append(measure);

    row.addEventListener('pointerdown', this.#onPointerDown);
    row.addEventListener('pointermove', this.#onPointerMove);
    row.addEventListener('pointerup', this.#onPointerEnd);
    row.addEventListener('pointercancel', this.#onPointerEnd);
    // Capture can be lost without a pointerup reaching us (row removed,
    // element reparented mid-drag) — never leave the gesture machine stuck.
    row.addEventListener('lostpointercapture', () => this.#resetGesture());
    row.addEventListener('click', this.#onClick);
    row.addEventListener('keydown', this.#onKeyDown);

    root.append(row);
    this.#syncChecked();
  }

  #measure() {
    const k = this.#rem / 16;
    const measure = this.shadowRoot.querySelector('.measure');
    this.#measuredVisible = true;
    for (const item of this.#items) {
      measure.textContent = item.label.textContent;
      const w = measure.getBoundingClientRect().width;
      if (w === 0 && item.label.textContent) this.#measuredVisible = false;
      item.pillW = (LABEL_X + DESIGN.PAD_R) * k + Math.ceil(w);
    }
    measure.textContent = '';
  }

  #syncChecked() {
    this.#items.forEach((item, i) => {
      const on = i === this.#index;
      item.el.setAttribute('aria-checked', String(on));
      item.el.tabIndex = on ? 0 : -1;
    });
  }

  #select(i, { emit = true } = {}) {
    if (i === this.#index || !this.#statuses[i]) return;
    this.#index = i;
    this.#items.forEach((item, j) => { item.spring.target = j === i ? 1 : 0; });
    this.#syncChecked();

    const status = this.#statuses[i];
    if (this.getAttribute('value') !== status.id) this.setAttribute('value', status.id);
    if (emit) {
      this.dispatchEvent(new CustomEvent('change', {
        bubbles: true, composed: true,
        detail: { value: status.id, index: i, label: status.label },
      }));
    }

    // Snap when never connected (initial value=… attribute during upgrade)
    // or under reduced motion; spring otherwise.
    if (!this.#everConnected || this.#reducedMotion.matches) {
      for (const item of this.#items) { item.spring.p = item.spring.target; item.spring.v = 0; }
      if (this.#everConnected) this.#renderAll();
    } else {
      this.#startLoop();
    }
  }

  #advance(dt) {
    let active = false;
    for (const item of this.#items) {
      const s = item.spring;
      if (s.p === s.target && s.v === 0) continue;
      s.v += (-this.#k * (s.p - s.target) - this.#c * s.v) * dt;
      s.p += s.v * dt;
      if (Math.abs(s.p - s.target) < 0.001 && Math.abs(s.v) < 0.005) {
        s.p = s.target; s.v = 0;
      } else {
        active = true;
      }
      this.#renderItem(item);
    }
    return active;
  }

  #startLoop() {
    if (this.#raf) return;
    this.#lastT = 0;
    const tick = (t) => {
      const dt = Math.min((this.#lastT ? t - this.#lastT : 16.7) / 1000, 0.032) *
        StatusIndicator.timeScale;
      this.#lastT = t;
      this.#raf = this.#advance(dt) ? requestAnimationFrame(tick) : 0;
    };
    this.#raf = requestAnimationFrame(tick);
  }

  /** Debug/testing only: advance springs synchronously, bypassing rAF. */
  _step(ms) {
    let remaining = Math.min(Math.max(ms, 0), 10000) / 1000;
    while (remaining > 0) {
      this.#advance(Math.min(remaining, 0.016));
      remaining -= 0.016;
    }
  }

  #renderAll() {
    for (const item of this.#items) this.#renderItem(item);
  }

  // All geometry derives from one progress value p (0 = dot, 1 = pill).
  #renderItem(item) {
    const k = this.#rem / 16;
    const p = Math.max(-0.08, Math.min(1.12, item.spring.p));
    const t = clamp01(p);

    const itemW = lerp(DESIGN.HIT * k, item.pillW, p);
    const bgW = Math.max(3, lerp(DESIGN.DOT * k, item.pillW, p));
    const bgH = Math.max(3, lerp(DESIGN.DOT * k, DESIGN.PILL_H * k, p));
    const bgL = ((DESIGN.HIT - DESIGN.DOT) * k * (1 - p)) / 2;

    item.el.style.width = `${itemW}px`;
    const pill = item.pill.style;
    pill.width = `${bgW}px`;
    pill.height = `${bgH}px`;
    pill.left = `${bgL}px`;
    pill.top = `${(DESIGN.PILL_H * k - bgH) / 2}px`;
    pill.setProperty('--_pill-a', `${smooth(t / 0.4) * 100}%`);
    // Clip only while morphing (label wipe); at rest the 6px box must not
    // clip the dot's hover/press scale.
    pill.overflow = t < 0.02 ? 'visible' : 'hidden';

    // Matched element: the dot lives inside the 18×18 glyph box and the box
    // itself scales 6→18 while traveling from the item center to icon position.
    const glyphCx = lerp(DESIGN.DOT / 2, DESIGN.PAD_L + DESIGN.ICON / 2, p) * k;
    const glyphS = lerp(DESIGN.DOT / DESIGN.ICON, 1, p);
    const glyph = item.glyph.style;
    glyph.left = `${glyphCx - (DESIGN.ICON / 2) * k}px`;
    glyph.top = `${bgH / 2 - (DESIGN.ICON / 2) * k}px`;
    glyph.transform = `scale(${glyphS})`;

    // Overlapping ramps keep the matched element's combined coverage near 1
    // through the crossfade — the dot may never vanish before the icon lands.
    const dotOpacity = 1 - smooth((t - 0.25) / 0.3);
    item.dot.style.opacity = dotOpacity;

    const iconIn = smooth((t - 0.2) / 0.4);
    const icon = item.icon.style;
    icon.opacity = iconIn;
    icon.filter = iconIn < 1 ? `blur(${(1 - iconIn) * 2}px)` : '';

    // Label rides the pill-edge wipe — opacity only, blur on clipped text
    // paints badly and the wipe already masks the entrance.
    const labelIn = smooth((t - 0.5) / 0.45);
    const label = item.label.style;
    label.left = `${lerp(DESIGN.DOT / 2, LABEL_X, p) * k}px`;
    label.top = `${(bgH - 20 * k) / 2}px`;
    label.opacity = labelIn;
  }

  #itemFromEvent(e) {
    const el = e.composedPath().find(
      (n) => n instanceof HTMLElement && n.classList?.contains('item'),
    );
    return el ? Number(el.dataset.index) : -1;
  }

  #onPointerDown = (e) => {
    if (!e.isPrimary || e.button !== 0 || this.#pointerId !== null) return;
    this.#pointerId = e.pointerId;
    this.#dragStartX = e.clientX;
    this.#dragged = false;
    // Pointer capture retargets the trailing click to the row, so remember
    // which item was pressed — the tap is committed on pointerup instead.
    this.#downIndex = this.#itemFromEvent(e);
    // Freeze scrub hit zones for the whole gesture: one layout read here,
    // none per move, and targets don't shift under the finger mid-morph.
    this.#dragCenters = this.#items.map((item) => {
      const r = item.el.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    // Synthetic events (tests) carry pointer ids the browser doesn't know;
    // capture is an enhancement, never let it abort the gesture.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };

  #onPointerMove = (e) => {
    if (e.pointerId !== this.#pointerId) return;
    if (e.buttons === 0) { this.#resetGesture(); return; } // lost pointerup
    if (!this.#dragged && Math.abs(e.clientX - this.#dragStartX) < DRAG_THRESHOLD) return;
    if (!this.#dragged) e.currentTarget.classList.add('is-dragging');
    this.#dragged = true;

    // Scrub: select whichever item center is nearest the pointer.
    let best = 0;
    let bestDist = Infinity;
    this.#dragCenters.forEach((cx, i) => {
      const d = Math.abs(e.clientX - cx);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    if (best !== this.#index) this.#select(best);
  };

  #onPointerEnd = (e) => {
    if (e.pointerId !== this.#pointerId) return;
    const tap = !this.#dragged && e.type === 'pointerup' && this.#downIndex >= 0;
    const tapIndex = this.#downIndex;
    this.#resetGesture();
    if (tap) this.#select(tapIndex);
  };

  // Keyboard activation (Enter/Space) arrives as a click with no pointerdown.
  #onClick = (e) => {
    if (this.#dragged || e.detail !== 0) return;
    const i = this.#itemFromEvent(e);
    if (i >= 0) this.#select(i);
  };

  #onKeyDown = (e) => {
    const n = this.#statuses.length;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (this.#index + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (this.#index - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next === null) return;
    e.preventDefault();
    this.#select(next);
    this.#items[next].el.focus();
  };
}

if (typeof customElements !== 'undefined' && !customElements.get('status-indicator')) {
  customElements.define('status-indicator', StatusIndicator);
}

export type StatusIndicatorValue =
  | "backlog"
  | "in-progress"
  | "needs-review"
  | "done"
  | "cancel";

export type StatusIndicatorProps = {
  value?: StatusIndicatorValue;
  ariaLabel?: string;
  className?: string;
};

const StatusIndicatorComponent = React.forwardRef<
  HTMLElement,
  StatusIndicatorProps
>(function StatusIndicatorComponent(
  { value = "backlog", ariaLabel = "Status", className },
  ref,
) {
  return React.createElement("status-indicator", {
    ref,
    className,
    value,
    "aria-label": ariaLabel,
  });
});

export default StatusIndicatorComponent;


demo.tsx
import StatusIndicator from "@/components/ui/status-indicator";

export default function StatusIndicatorDemo() {
  return <StatusIndicator value="backlog" ariaLabel="Status" />;
}
```
