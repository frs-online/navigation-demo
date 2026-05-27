/* frs/wc-shop-explorer — shared search + accordion JS for the shop-explorer
 * widget. Two consumers: the mobile-menu drawer's Sortiment panel
 * (#frs-mm-panel-shop) and the new sidebar block (frs/wc-shop-sidebar).
 *
 * Lifted from blockstudio/sections/site-header/script.js (pre-extraction
 * lines ~333–~915). The factory exported as wireShopExplorer({ rootEl,
 * layout, classes }) is a parameterized rename of the prior wireSearch
 * factory; the `classes` map is the only thing that differs between
 * sidebar and drawer instances. This module is loaded as a non-module
 * script and exposes its surface via window.frsShopExplorer (the
 * consumer scripts read from there).
 *
 * Behavioral invariants pinned by the failing tests:
 *  - Accordion-toggle handler flips aria-expanded + the children <ul>'s
 *    `hidden` attribute. Does NOT mutate aria-current or __row--active
 *    modifiers. Server-emitted active state survives every toggle.
 *  - Search-clear path is strictly visibility-only — toggling `hidden` on
 *    the accordion / results lists. No aria-* rewrites on rows. Pinned
 *    by Playwright B6 (search clear preserves pre-expanded ancestry).
 */

(function (window, document) {
	if (typeof window === 'undefined') {
		return;
	}
	if (window.frsShopExplorer && window.frsShopExplorer.wireShopExplorer) {
		// Already loaded — site-header may have included an inline copy
		// during the extraction transition; bail out cleanly.
		return;
	}

	const PRODUCT_MIN = 2;
	const PRODUCT_PAGE_SIZE = 20;

	const escapeHtml = (str) =>
		String(str || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const highlight = (text, query) => {
		const safe = escapeHtml(text);
		if (!query) return safe;
		const re = new RegExp('(' + escapeRegex(query) + ')', 'ig');
		return safe.replace(re, '<mark>$1</mark>').replace(/<\/mark><mark>/g, '');
	};

	const formatPrice = (prices) => {
		if (!prices) return '';
		const minor = parseInt(prices.currency_minor_unit, 10);
		const value = parseInt(prices.price, 10);
		if (Number.isNaN(value) || Number.isNaN(minor)) return '';
		const major = (value / Math.pow(10, minor)).toFixed(minor);
		const [int, frac] = major.split('.');
		const dec = prices.currency_decimal_separator || ',';
		const thou = prices.currency_thousand_separator || '.';
		const intGrouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, thou);
		const body = frac ? intGrouped + dec + frac : intGrouped;
		const prefix = prices.currency_prefix || '';
		const suffix = prices.currency_suffix || (' ' + (prices.currency_symbol || ''));
		return prefix + body + suffix;
	};

	const fetchProductsPage = async (query, page, signal) => {
		if (query.length < PRODUCT_MIN) return { items: [], total: 0 };
		const url =
			'/wp-json/wc/store/v1/products?per_page=' +
			PRODUCT_PAGE_SIZE +
			'&page=' +
			page +
			'&_fields=id,name,permalink,prices,images,sku' +
			'&search=' +
			encodeURIComponent(query);
		try {
			const res = await fetch(url, {
				signal,
				headers: { Accept: 'application/json' },
			});
			if (!res.ok) return { items: [], total: 0 };
			const total = parseInt(res.headers.get('X-WP-Total') || '0', 10);
			const json = await res.json();
			return {
				items: Array.isArray(json) ? json : [],
				total: Number.isNaN(total) ? 0 : total,
			};
		} catch (err) {
			return { items: [], total: 0 };
		}
	};

	// Index builder — flat list for the in-DOM category filter. The
	// `accordionRowSelector` is BEM-namespaced so the same index works
	// for both drawer (.frs-mobile-menu__row) and sidebar
	// (.frs-shop-explorer__row).
	const buildIndex = (acc, accordionRowSelector, accordionCountSelector, accordionChildrenSelector) => {
		if (!acc) return [];
		const rows = acc.querySelectorAll(accordionRowSelector);
		const out = [];
		rows.forEach((row) => {
			const nameSpan = row.querySelector(
				'[class$="__name"]'
			);
			const name =
				row.getAttribute('data-name') ||
				(nameSpan ? nameSpan.textContent : '') ||
				'';
			const url =
				row.tagName === 'A'
					? row.getAttribute('href')
					: row.getAttribute('data-url');
			const countNode = row.querySelector(accordionCountSelector);
			const count = countNode
				? countNode.textContent.replace(/[^\d]/g, '')
				: '';
			const path = [];
			let li = row.closest('li');
			let parentUl = li ? li.parentElement : null;
			while (parentUl && parentUl.matches(accordionChildrenSelector)) {
				const parentLi = parentUl.parentElement;
				if (!parentLi) break;
				const ancestorRow = parentLi.querySelector(':scope > ' + accordionRowSelector);
				const ancestorName =
					ancestorRow && ancestorRow.getAttribute('data-name');
				if (ancestorName) path.unshift(ancestorName);
				parentUl = parentLi.parentElement;
			}
			out.push({ name: name.trim(), url: url || '#', count, path });
		});
		return out;
	};

	const renderCategoryLi = (m, query, classes) => {
		const pathHtml = m.path.length
			? '<span class="' +
			  classes.path +
			  '">' +
			  m.path.map((p) => '<span>' + escapeHtml(p) + '</span>').join('') +
			  '</span>'
			: '';
		const countHtml = m.count
			? ' <span class="' +
			  classes.count +
			  '">(' +
			  escapeHtml(m.count) +
			  ')</span>'
			: '';
		return (
			'<li>' +
			'<a class="' +
			classes.result +
			'" href="' +
			escapeHtml(m.url) +
			'">' +
			'<span class="' +
			classes.name +
			'">' +
			highlight(m.name, query) +
			countHtml +
			'</span>' +
			pathHtml +
			'</a>' +
			'</li>'
		);
	};

	const renderProductLi = (p, query, classes) => {
		const thumb =
			(p.images && p.images[0] && (p.images[0].thumbnail || p.images[0].src)) ||
			'';
		const imgHtml = thumb
			? '<img class="' +
			  classes.image +
			  '" src="' +
			  escapeHtml(thumb) +
			  '" alt="" loading="lazy" decoding="async">'
			: '<span class="' + classes.image + '" aria-hidden="true"></span>';
		const price = formatPrice(p.prices);
		const priceHtml = price
			? '<span class="' + classes.price + '">' + escapeHtml(price) + '</span>'
			: '';
		return (
			'<li>' +
			'<a class="' +
			classes.result +
			' ' +
			classes.resultProduct +
			'" href="' +
			escapeHtml(p.permalink || '#') +
			'">' +
			imgHtml +
			'<span class="' +
			classes.body +
			'">' +
			'<span class="' +
			classes.name +
			'">' +
			highlight(p.name || '', query) +
			'</span>' +
			priceHtml +
			'</span>' +
			'</a>' +
			'</li>'
		);
	};

	/**
	 * wireShopExplorer({ rootEl, layout, classes })
	 *
	 *  - rootEl: the explorer's outermost containing element. The drawer
	 *    passes the Sortiment panel (#frs-mm-panel-shop); the sidebar
	 *    passes the explorer wrapper (.frs-shop-explorer).
	 *  - layout: 'single' (combined results <ul>) — the only layout this
	 *    factory supports (the modal layout 'cols' lives in the modal-
	 *    specific helper inside site-header/script.js, since it's tied to
	 *    the modal's drill-down UI).
	 *  - classes: BEM-namespaced map. Required keys (drawer / sidebar):
	 *      acc, children, results, row, search, input, clear, hint,
	 *      result, resultProduct, name, path, count, image, body, price,
	 *      sentinel, colEmpty.
	 *
	 * Idempotent: re-wiring the same rootEl is a no-op (we tag rootEl
	 * with `data-frs-explorer-wired="1"`).
	 */
	const wireShopExplorer = (opts) => {
		const { rootEl, layout, classes } = opts || {};
		if (!rootEl || rootEl.dataset.frsExplorerWired === '1') return;
		rootEl.dataset.frsExplorerWired = '1';

		const accSelector = '.' + classes.acc;
		const childrenSelector = '.' + classes.children;
		const resultsSelector = '.' + classes.results;
		const rowSelector = '.' + classes.row;
		const inputSelector = '.' + classes.input;
		const clearSelector = '.' + classes.clear;
		const hintSelector = '.' + classes.hint;
		const countSelector = '.' + classes.count;

		const acc = rootEl.querySelector(accSelector);
		const outList = rootEl.querySelector(resultsSelector);
		const field = rootEl.querySelector(inputSelector);
		const clearBtn = rootEl.querySelector(clearSelector);
		const hint = rootEl.querySelector(hintSelector);
		const scrollWrapEl =
			rootEl.querySelector('.' + classes.scroll) || rootEl;

		// --- Accordion toggle (delegated) ---
		// Flips aria-expanded + the children <ul>'s `hidden`. Does NOT touch
		// aria-current or __row--active — those are server-emitted and must
		// survive arbitrary user toggling.
		if (acc) {
			acc.addEventListener('click', (event) => {
				const trigger = event.target.closest(rowSelector + '[aria-controls]');
				if (!trigger || !acc.contains(trigger)) return;
				event.preventDefault();
				const expanded = trigger.getAttribute('aria-expanded') === 'true';
				trigger.setAttribute('aria-expanded', String(!expanded));
				const kidsId = trigger.getAttribute('aria-controls');
				const kidsUl = kidsId && rootEl.querySelector('#' + CSS.escape(kidsId));
				if (kidsUl) {
					if (expanded) kidsUl.setAttribute('hidden', '');
					else kidsUl.removeAttribute('hidden');
				}
			});
		}

		// --- Search ---
		if (!field) return;

		const searchIndex = buildIndex(acc, rowSelector, countSelector, childrenSelector);

		let lastRaw = '';
		let lastQuery = '';
		let lastCats = [];
		let lastProds = [];
		let lastProductsTotal = 0;
		let productsPage = 0;
		let productsLoading = false;
		let productsExhausted = true;
		let productSentinel = null;
		let productObserver = null;
		let productAbort = null;

		const teardownObserver = () => {
			if (productObserver) {
				productObserver.disconnect();
				productObserver = null;
			}
			if (productSentinel && productSentinel.parentNode) {
				productSentinel.parentNode.removeChild(productSentinel);
			}
			productSentinel = null;
		};

		const setupObserver = () => {
			const host = outList;
			if (!host || productsExhausted) return;
			if (!productSentinel) {
				productSentinel = document.createElement('li');
				productSentinel.className = classes.sentinel;
				productSentinel.setAttribute('aria-hidden', 'true');
			}
			if (productSentinel.parentNode !== host) host.appendChild(productSentinel);
			if (productObserver) productObserver.disconnect();
			productObserver = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) loadMore();
					}
				},
				{ root: scrollWrapEl || null, rootMargin: '200px 0px' }
			);
			productObserver.observe(productSentinel);
		};

		const loadMore = async () => {
			if (productsLoading || productsExhausted) return;
			const raw = field.value;
			const query = raw.trim();
			if (!query || query.length < PRODUCT_MIN) return;
			productsLoading = true;
			if (productAbort) productAbort.abort();
			productAbort = new AbortController();
			const signal = productAbort.signal;
			const nextPage = productsPage + 1;
			const { items } = await fetchProductsPage(query, nextPage, signal);
			if (signal.aborted || field.value !== raw) {
				productsLoading = false;
				return;
			}
			productsPage = nextPage;
			lastProds = lastProds.concat(items);
			if (items.length === 0 || lastProds.length >= lastProductsTotal)
				productsExhausted = true;
			const host = outList;
			if (host && items.length) {
				const html = items.map((p) => renderProductLi(p, query, classes)).join('');
				if (productSentinel && productSentinel.parentNode === host) {
					productSentinel.insertAdjacentHTML('beforebegin', html);
				} else {
					host.insertAdjacentHTML('beforeend', html);
				}
			}
			productsLoading = false;
			if (productsExhausted) teardownObserver();
		};

		// paint() is the ONLY place where accordion vs results visibility
		// flips. The empty-query branch (lastQuery === '') hides results
		// and unhides the accordion — visibility-only, no aria mutation.
		// This is what guards Playwright B6 (search clear preserves
		// pre-expanded ancestry).
		const paint = () => {
			if (!lastQuery) {
				if (outList) {
					outList.setAttribute('hidden', '');
					outList.innerHTML = '';
				}
				if (acc) acc.removeAttribute('hidden');
				if (hint) hint.setAttribute('hidden', '');
				return;
			}
			if (hint) {
				hint.removeAttribute('hidden');
				const total = lastCats.length + lastProductsTotal;
				const prodWord = lastProductsTotal === 1 ? 'Produkt' : 'Produkte';
				const catWord = lastCats.length === 1 ? 'Kategorie' : 'Kategorien';
				hint.textContent =
					total === 0
						? 'Keine Treffer für „' + lastRaw + '“'
						: lastCats.length +
						  ' ' +
						  catWord +
						  ' · ' +
						  lastProductsTotal +
						  ' ' +
						  prodWord +
						  ' für „' +
						  lastRaw +
						  '“';
			}
			if (acc) acc.setAttribute('hidden', '');
			if (outList) {
				outList.removeAttribute('hidden');
				if (lastCats.length === 0 && lastProductsTotal === 0) {
					outList.innerHTML =
						'<li class="' +
						classes.colEmpty +
						'">Volltextsuche probieren — Enter drücken.</li>';
				} else {
					outList.innerHTML = lastCats
						.map((m) => renderCategoryLi(m, lastQuery, classes))
						.concat(lastProds.map((p) => renderProductLi(p, lastQuery, classes)))
						.join('');
				}
			}
		};

		const runCategorySearch = () => {
			lastRaw = field.value;
			lastQuery = lastRaw.trim().toLowerCase();
			if (clearBtn) {
				if (lastRaw.length > 0) clearBtn.removeAttribute('hidden');
				else clearBtn.setAttribute('hidden', '');
			}
			if (!lastQuery) {
				lastCats = [];
				lastProds = [];
				if (productAbort) productAbort.abort();
				paint();
				return;
			}
			lastCats = searchIndex
				.filter((entry) => entry.name.toLowerCase().includes(lastQuery))
				.slice(0, 60);
			paint();
		};

		const runProductSearch = async () => {
			const raw = field.value;
			const query = raw.trim();
			teardownObserver();
			productsPage = 0;
			productsLoading = false;
			productsExhausted = true;
			if (!query || query.length < PRODUCT_MIN) {
				lastProds = [];
				lastProductsTotal = 0;
				paint();
				return;
			}
			if (productAbort) productAbort.abort();
			productAbort = new AbortController();
			const signal = productAbort.signal;
			productsLoading = true;
			const { items, total } = await fetchProductsPage(query, 1, signal);
			if (signal.aborted || field.value !== raw) {
				productsLoading = false;
				return;
			}
			lastProds = items;
			lastProductsTotal = total;
			productsPage = 1;
			productsExhausted = items.length === 0 || items.length >= total;
			productsLoading = false;
			paint();
			if (!productsExhausted) setupObserver();
		};

		let categoryTimer = 0;
		let productTimer = 0;
		field.addEventListener('input', () => {
			window.clearTimeout(categoryTimer);
			window.clearTimeout(productTimer);
			categoryTimer = window.setTimeout(runCategorySearch, 80);
			productTimer = window.setTimeout(runProductSearch, 200);
		});
		if (clearBtn) {
			clearBtn.addEventListener('click', () => {
				field.value = '';
				field.focus();
				if (productAbort) productAbort.abort();
				runCategorySearch();
				runProductSearch();
			});
		}
		// Form Enter — let the browser submit to /?s=<query> for the full
		// WP search fallback. No preventDefault here.
	};

	window.frsShopExplorer = Object.assign(window.frsShopExplorer || {}, {
		wireShopExplorer,
		// Helpers exposed for test / debugging surface and for the modal
		// instance in site-header/script.js (which still owns the cols
		// layout + drill-down).
		_internals: {
			escapeHtml,
			escapeRegex,
			highlight,
			formatPrice,
			fetchProductsPage,
			renderCategoryLi,
			renderProductLi,
			buildIndex,
		},
	});
})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : null);
