/**
 * frs-splide-init — declarative Splide registrar (Phase 5.1, D-28; extended
 * for slider-chrome-08 with chrome relocation + overflow detection).
 *
 * Scans all `.frs-splide[data-splide]` elements on DOMContentLoaded, parses
 * the JSON config from `data-splide`, and mounts a Splide instance per
 * element. Skips elements already initialized (Splide adds `.is-initialized`
 * on mount).
 *
 * Post-mount, for sliders with chrome bands (`chrome="header-progress"` or
 * `chrome="footer-progress-arrows"`), the script relocates Splide's emitted
 * `.splide__arrow--{prev,next}` buttons into the per-band hosts the slider's
 * PHP template emits ([data-arrows-host] for v08, [data-arrow-prev-host] +
 * [data-arrow-next-host] for v11). It also wires a progress-bar updater +
 * an `is-static` toggle that fires on `splide.on('mounted move moved resize')`.
 *
 * Porter-emitted blocks carry the `data-splide='{...}'` attribute; this
 * script is the sole Splide init path. Do NOT call `new Splide(...)` from
 * anywhere else.
 */
(function () {
  'use strict';

  /**
   * Move Splide's emitted prev / next buttons from the default
   * `.splide__arrows` wrapper into the chrome bands' custom hosts,
   * then remove the now-empty default wrapper from the DOM.
   *
   * Two host shapes:
   *   - `[data-arrows-host]`         → v08 single host (both arrows together).
   *   - `[data-arrow-prev-host]` + `[data-arrow-next-host]` → v11 split hosts.
   *
   * After relocation, the destination host gets `splide__arrows--custom`
   * so prod-verbatim's `.brxe-slider-nested .splide__arrows:not(.custom)`
   * flip rule misses gracefully. The scoped CSS re-applies the chevron
   * flip on the relocated prev button.
   *
   * The default `.splide__arrows` wrapper is removed once its buttons land
   * in the custom host(s) — it's empty and would otherwise sit in the
   * slider root's flex flow as a 0×0 sibling of `.splide__track`. Splide
   * v4's Arrows component holds button refs after `mount`, so subsequent
   * `move` / `resize` events keep working without the wrapper.
   */
  function relocateChrome(splideEl) {
    var defaultArrows = splideEl.querySelector('.splide__arrows');
    if (!defaultArrows) {
      return;
    }
    var prev = defaultArrows.querySelector('.splide__arrow--prev');
    var next = defaultArrows.querySelector('.splide__arrow--next');

    var combinedHost = splideEl.querySelector('[data-arrows-host]');
    if (combinedHost && prev && next) {
      combinedHost.appendChild(prev);
      combinedHost.appendChild(next);
      combinedHost.classList.add('splide__arrows--custom');
      defaultArrows.remove();
      return;
    }

    var prevHost = splideEl.querySelector('[data-arrow-prev-host]');
    var nextHost = splideEl.querySelector('[data-arrow-next-host]');
    if (prevHost && nextHost && prev && next) {
      prevHost.appendChild(prev);
      nextHost.appendChild(next);
      prevHost.classList.add('splide__arrows--custom');
      nextHost.classList.add('splide__arrows--custom');
      defaultArrows.remove();
    }
  }

  /**
   * Wire the progress-bar fill + the `is-static` toggle.
   *
   *   - `splide.length <= splide.options.perPage`  → not overflowing
   *     → add `is-static` to the slider root, hide chrome via CSS.
   *   - Otherwise, set the `[data-progress] .frs-slider__progress-bar`
   *     `style.width` to the position of the current FIRST visible
   *     item, 1-indexed against the slide count:
   *
   *       pct = clamp( ((index + 1) / length) * 100, 0, 100 )
   *
   *     Matches the playground reference (`pageNum / total * 100`,
   *     where `pageNum = idx + 1`). The "current first item" framing
   *     means the bar reaches 100% only when the first visible item is
   *     the LAST slide — not when the *last* visible item is the last
   *     slide (the prior `(index + perPage) / length` formula jumped
   *     to 100% at index 1 on a 6-slide loop, which felt off).
   *
   * Listeners: 'mounted', 'move', 'moved', 'resize'. Splide fires
   * 'resize' AFTER its breakpoint resolution mutates `options.perPage`,
   * so the static check stays in sync with the active breakpoint.
   */
  function wireExtras(splideEl, splide) {
    var bar = splideEl.querySelector('[data-progress] .frs-slider__progress-bar');

    function update() {
      var length = splide.length;
      var perPage = (splide.options && splide.options.perPage) || 1;
      var overflowing = length > perPage;

      splideEl.classList.toggle('is-static', !overflowing);

      if (overflowing && bar) {
        var pct = ((splide.index + 1) / length) * 100;
        if (pct < 0) pct = 0;
        if (pct > 100) pct = 100;
        bar.style.width = pct + '%';
      }
    }

    splide.on('mounted move moved resize', update);
    update();
  }

  function initAll() {
    if (typeof window.Splide === 'undefined') return;
    var nodes = document.querySelectorAll('.frs-splide[data-splide]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.classList.contains('is-initialized')) continue;
      var raw = el.getAttribute('data-splide') || '{}';
      var cfg;
      try {
        cfg = JSON.parse(raw);
      } catch (err) {
        console.warn('[frs-splide-init] Invalid JSON in data-splide:', err, el);
        continue;
      }
      try {
        var splide = new window.Splide(el, cfg);
        // Pre-mount listener so relocateChrome + wireExtras run inside
        // Splide's own `mounted` callback chain. Avoids any race between
        // the DOM-ready handler and Splide's class injection.
        (function (boundEl, boundSplide) {
          boundSplide.on('mounted', function () {
            relocateChrome(boundEl);
            wireExtras(boundEl, boundSplide);
          });
        })(el, splide);
        splide.mount();
      } catch (err) {
        console.warn('[frs-splide-init] Splide mount failed:', err, el);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
