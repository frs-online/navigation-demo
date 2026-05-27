/*
 * link-guard.js — neutralise dead internal links in the static demo.
 *
 * Internal links still point at the dev host (https://frs-online.test/…) or are
 * root-relative (/shop/, /mein-konto/…); none of them work in a static copy.
 * Instead of letting clicks fail or leave the demo, intercept them and show a
 * short toast. Left alone: in-modal `#` drill-down links, tel:/mailto:, the
 * landing page's relative file links, and the real off-site links (Impressum,
 * Datenschutz, socials). Delegated + capture phase, so dynamically-rendered
 * search results are covered too.
 */
(function () {
	'use strict';

	var TOAST_MSG = 'Demo-Ansicht – dieser Link ist deaktiviert.';

	var style = document.createElement('style');
	style.textContent =
		'.frs-demo-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(10px);' +
		'background:#1f1f1f;color:#fff;padding:.7rem 1.15rem;border-radius:8px;' +
		'font:500 14px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.28);' +
		'opacity:0;transition:opacity .22s ease,transform .22s ease;z-index:2147483647;' +
		'pointer-events:none;max-width:90vw;text-align:center}' +
		'.frs-demo-toast.is-visible{opacity:1;transform:translateX(-50%) translateY(0)}';
	(document.head || document.documentElement).appendChild(style);

	var toast, hideTimer;
	function showToast(msg) {
		if (!toast) {
			toast = document.createElement('div');
			toast.className = 'frs-demo-toast';
			toast.setAttribute('role', 'status');
			toast.setAttribute('aria-live', 'polite');
			document.body.appendChild(toast);
		}
		toast.textContent = msg;
		// reflow so re-trigger re-animates
		void toast.offsetWidth;
		toast.classList.add('is-visible');
		clearTimeout(hideTimer);
		hideTimer = setTimeout(function () { toast.classList.remove('is-visible'); }, 2500);
	}

	function isDeadInternal(href) {
		if (!href) return false;
		var t = href.trim();
		if (t === '' || t.charAt(0) === '#') return false;            // in-page / in-modal anchors
		if (/^(tel:|mailto:|javascript:)/i.test(t)) return false;      // real protocols
		if (t.charAt(0) === '/' && t.charAt(1) !== '/') return true;   // root-relative internal (/shop/, …)
		try { return new URL(t, location.href).hostname === 'frs-online.test'; }
		catch (e) { return false; }
	}

	document.addEventListener('click', function (e) {
		var a = e.target.closest && e.target.closest('a[href]');
		if (!a) return;
		if (isDeadInternal(a.getAttribute('href'))) {
			e.preventDefault();
			e.stopPropagation();
			showToast(TOAST_MSG);
		}
	}, true);
})();
