/*
 * search-stub.js — offline backend shim for the static Startseite demo.
 *
 * The live header search modal and the drawer's Sortiment accordion both call
 *   GET /wp-json/wc/store/v1/products?per_page=…&search=…
 * (public WooCommerce Store API). A static copy has no backend, so this shim
 * wraps window.fetch and answers that one endpoint from a captured fixture
 * (window.__FRS_FIXTURE → data/products-<state>.json). The fixture IS a real
 * Store-API response, so site-header / wc-shop-explorer render it unchanged.
 *
 * It also no-ops WooCommerce cart-fragment polling so the console stays clean.
 * Everything else passes through to the native fetch untouched.
 *
 * Loaded as a plain (non-module) script in <head>, before the block scripts,
 * so the wrapper is installed before any handler can fire. No theme edits.
 */
(function () {
	'use strict';

	var FIXTURE = window.__FRS_FIXTURE || 'data/products.json';
	var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
	var cache = null;

	function loadFixture() {
		if (cache) return Promise.resolve(cache);
		return nativeFetch(FIXTURE)
			.then(function (r) { return r.json(); })
			.then(function (json) {
				cache = Array.isArray(json) ? json : (json && json.products) || [];
				return cache;
			})
			.catch(function () { cache = []; return cache; });
	}

	function param(url, name) {
		var m = url.match(new RegExp('[?&]' + name + '=([^&]*)'));
		return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
	}

	function jsonResponse(data, extraHeaders) {
		var headers = { 'Content-Type': 'application/json' };
		if (extraHeaders) for (var k in extraHeaders) headers[k] = extraHeaders[k];
		return new Response(JSON.stringify(data), { status: 200, headers: headers });
	}

	function urlOf(input) {
		if (typeof input === 'string') return input;
		if (input && typeof input.url === 'string') return input.url;
		return '';
	}

	window.fetch = function (input, init) {
		var url = urlOf(input);

		// 1. Product search → serve filtered fixture.
		if (url.indexOf('/wp-json/wc/store/v1/products') !== -1) {
			var q = param(url, 'search').toLowerCase().trim();
			var per = parseInt(param(url, 'per_page'), 10) || 12;
			return loadFixture().then(function (all) {
				var hits = !q ? all : all.filter(function (p) {
					var name = (p && p.name ? String(p.name) : '').toLowerCase();
					var sku = (p && p.sku ? String(p.sku) : '').toLowerCase();
					var sh = (p && p.short_description ? String(p.short_description) : '').toLowerCase();
					return name.indexOf(q) !== -1 || sku.indexOf(q) !== -1 || sh.indexOf(q) !== -1;
				});
				var slice = hits.slice(0, per);
				return jsonResponse(slice, {
					'X-WP-Total': String(hits.length),
					'X-WP-TotalPages': '1'
				});
			});
		}

		// 2. Cart-fragment polling → benign empty payload (no backend).
		if (url.indexOf('get_refreshed_fragments') !== -1) {
			return Promise.resolve(jsonResponse({ fragments: {}, cart_hash: '', cart: null }));
		}

		// 3. Everything else → native (most will simply no-op offline).
		if (nativeFetch) return nativeFetch(input, init);
		return Promise.reject(new Error('fetch unavailable'));
	};
})();
