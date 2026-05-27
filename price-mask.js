/*
 * price-mask.js — public-demo price masker (member page only).
 *
 * The static product cards are scrubbed at build time, but the search modal /
 * drawer render prices at runtime from the (9-filled) fixture via
 * formatPrice(prices.price). This wrapper masks every DISPLAYED price to the
 * XXX,XX shape so no real B2B value is ever shown, regardless of how it was
 * rendered. Render-agnostic and idempotent (already-masked text has no digits).
 *
 * Loaded after search-stub.js. Only injected into home-member.html — the guest
 * page has no real prices (login-walled) and stays untouched.
 */
(function () {
	'use strict';

	var SEL = [
		'.woocommerce-Price-amount',
		'.frs-product-card-alpha__price',
		'.frs-mobile-menu__result-price',
		'[class*="result-price"]'
	].join(', ');

	function maskEl(el) {
		var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
		var n;
		while ((n = walker.nextNode())) {
			if (/[0-9]/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/[0-9]/g, 'X');
		}
	}

	function maskWithin(root) {
		if (root.nodeType === 1 && root.matches && root.matches(SEL)) maskEl(root);
		if (root.querySelectorAll) root.querySelectorAll(SEL).forEach(maskEl);
	}

	function run() {
		maskWithin(document);
		new MutationObserver(function (muts) {
			for (var i = 0; i < muts.length; i++) {
				var added = muts[i].addedNodes;
				for (var j = 0; j < added.length; j++) {
					if (added[j].nodeType === 1) maskWithin(added[j]);
				}
			}
		}).observe(document.body, { childList: true, subtree: true });
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
	else run();
})();
