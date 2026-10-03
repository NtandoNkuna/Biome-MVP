/* ============================================================
   BIOME V2 - Property Listings Page
   ============================================================ */

(function() {
    'use strict';

    // Prevent multiple initialization
    if (window._biomeListingsInitialized) {
        console.warn('[Listings] Already initialized, skipping.');
        return;
    }
    window._biomeListingsInitialized = true;

    console.log('[Listings] Initializing...');

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================================
    // STATE
    // ============================================================

    const SearchState = {
        searchText: '',
        propertyTypeId: null,
        minPrice: null,
        maxPrice: null,
        bedrooms: null,
        bathrooms: null,
        province: '',
        city: '',
        suburb: '',
        sortBy: 'newest',
        page: 1,
        pageSize: 12,
        totalCount: 0,
        requestId: 0
    };

    const DEBOUNCE_MS = 300;

    // ============================================================
    // DOM CACHE — populated after the DOM is ready
    // ============================================================
    // IMPORTANT: this object must be populated AFTER the DOM is ready.
    // Caching at module-evaluation time captures `null` whenever the
    // script is parsed before the markup exists (e.g. loaded from <head>).
    //
    // The cache is also defensive:
    //   • Detects duplicate IDs and prefers the visible node
    //   • Clears stray `disabled` / `readonly` on the search input
    //   • Walks ancestors to unset any `pointer-events: none`
    //
    // Note: the property-type <select> has been removed from the markup.
    // Property type is now chosen only through the category buttons.

    let dom = {};

    const DOM_IDS = [
        'searchInput', 'filterToggleBtn', 'extendedFilters', 'closeFiltersBtn',
        'categoryButtons', 'minPrice', 'maxPrice', 'bedroomsFilter', 'bathroomsFilter',
        'provinceFilter', 'cityFilter', 'suburbFilter', 'sortBy',
        'applyFiltersBtn', 'resetFiltersBtn', 'listingsGrid', 'resultsCount',
        'loadingState', 'emptyState', 'errorState', 'pagination',
        'prevPageBtn', 'nextPageBtn', 'pageInfo',
    ];

    function cacheDom() {
        dom = {};
        const missing = [];

        DOM_IDS.forEach(id => {
            const matches = document.querySelectorAll(`#${id}`);

            if (matches.length > 1) {
                // Duplicate IDs are a common cause of "listener attached to the wrong element".
                console.warn(`[Listings] Duplicate #${id} (${matches.length} found) — using the visible one.`);
                dom[id] = Array.from(matches).find(el => {
                    const r = el.getBoundingClientRect();
                    return r.width > 0 && r.height > 0;
                }) || matches[0];
            } else if (matches.length === 1) {
                dom[id] = matches[0];
            } else {
                dom[id] = null;
                missing.push(id);
            }
        });

        if (missing.length) {
            console.warn('[Listings] Missing DOM nodes:', missing.join(', '));
        }

        // --- Defensive: make sure the search input is actually usable ---
        if (dom.searchInput) {
            if (dom.searchInput.disabled) {
                console.warn('[Listings] searchInput was disabled — clearing.');
                dom.searchInput.disabled = false;
                dom.searchInput.removeAttribute('disabled');
            }
            if (dom.searchInput.readOnly) {
                console.warn('[Listings] searchInput was readOnly — clearing.');
                dom.searchInput.readOnly = false;
                dom.searchInput.removeAttribute('readonly');
            }

            // If any ancestor has pointer-events: none, clicks never reach the input.
            for (let el = dom.searchInput; el && el !== document.body; el = el.parentElement) {
                if (getComputedStyle(el).pointerEvents === 'none') {
                    console.warn('[Listings] Ancestor has pointer-events:none — re-enabling:', el);
                    el.style.pointerEvents = 'auto';
                }
            }
        }
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================
    // Listeners are registered FIRST (critical path). Optional async
    // work is isolated so a failure in one subsystem can't take the
    // whole page — and the search bar in particular — down with it.

    async function init() {
        // --- Critical path: must never be skipped -----------------
        cacheDom();
        registerEventListeners();

        // --- Enhancements: each isolated --------------------------
        try { await initNavbar(); }
        catch (e) { console.error('[Listings] Navbar init failed:', e); }

        try { await loadPropertyTypes(); }
        catch (e) { console.error('[Listings] Property types failed:', e); }

        try { applyUrlParams(); }
        catch (e) { console.error('[Listings] URL params failed:', e); }

        try { await fetchAndRenderListings(); }
        catch (e) {
            console.error('[Listings] Initial fetch failed:', e);
            hideLoading();
            showError();
        }

        // On mobile, start with filters collapsed
        if (window.innerWidth <= 768) collapseFilters();

        console.log('[Listings] Ready.');
    }

    // ============================================================
    // NAVBAR
    // ============================================================

    async function initNavbar() {
        await window.Biome.Components.Navbar.init({
            containerId: 'navbarContainer',
            activeLink: 'home'  // 'home' = Browse
        });
    }

    // ============================================================
    // URL PARAMS (pre-processed search from the landing page)
    // ============================================================

    function applyUrlParams() {
        const params = window.Biome.Utils.getUrlParams();
        if (!params || Object.keys(params).length === 0) return;

        // Search keyword
        if (params.search) {
            dom.searchInput.value = params.search;
            SearchState.searchText = params.search.trim();
        }

        // Property type (category buttons are the only UI for this now;
        // the highlight is applied further down once the buttons exist)
        if (params.type) {
            SearchState.propertyTypeId = params.type;
        }

        // Price range
        if (params.minPrice) {
            dom.minPrice.value = params.minPrice;
            SearchState.minPrice = parseFloat(params.minPrice);
        }
        if (params.maxPrice) {
            dom.maxPrice.value = params.maxPrice;
            SearchState.maxPrice = parseFloat(params.maxPrice);
        }

        // Bedrooms / bathrooms
        if (params.bedrooms) {
            dom.bedroomsFilter.value = params.bedrooms;
            SearchState.bedrooms = parseInt(params.bedrooms, 10);
        }
        if (params.bathrooms) {
            dom.bathroomsFilter.value = params.bathrooms;
            SearchState.bathrooms = parseInt(params.bathrooms, 10);
        }

        // Location
        if (params.province) {
            dom.provinceFilter.value = params.province;
            SearchState.province = params.province.trim();
        }
        if (params.city) {
            dom.cityFilter.value = params.city;
            SearchState.city = params.city.trim();
        }
        if (params.suburb) {
            dom.suburbFilter.value = params.suburb;
            SearchState.suburb = params.suburb.trim();
        }

        // Sort order
        if (params.sortBy) {
            dom.sortBy.value = params.sortBy;
            SearchState.sortBy = params.sortBy;
        }

        // Highlight the matching category button, if the property type
        // came in via the URL (e.g. the "Explore" links on the homepage).
        if (params.type) {
            document.querySelectorAll('.categories button').forEach(b => b.classList.remove('active'));
            const matchingBtn = document.querySelector(`.categories button[data-type-id="${params.type}"]`);
            if (matchingBtn) matchingBtn.classList.add('active');
        }

        // Make sure filters are visible when arriving with pre-set values,
        // so the user can see exactly what was carried over from search.
        const hasExtendedFilters = params.minPrice || params.maxPrice || params.bedrooms ||
            params.bathrooms || params.province || params.city || params.suburb;
        if (hasExtendedFilters) {
            expandFilters();
        }
    }

    // ============================================================
    // PROPERTY TYPES
    // ============================================================

    async function loadPropertyTypes() {
        try {
            const { data: types, error } = await window.Biome.Core.supabase
                .from('property_types')
                .select('property_type_id, property_name')
                .order('property_name');

            if (error) throw error;

            if (!types || types.length === 0) return;

            // Category buttons (the only property-type control in the UI now)
            dom.categoryButtons.innerHTML = '';
            const allBtn = document.createElement('button');
            allBtn.className = 'active';
            allBtn.dataset.typeId = '';
            allBtn.innerHTML = '<i class="fa-solid fa-border-all"></i> All';
            dom.categoryButtons.appendChild(allBtn);

            types.forEach(type => {
                const btn = document.createElement('button');
                btn.dataset.typeId = type.property_type_id;
                btn.innerHTML = `<i class="fa-solid fa-building"></i> ${type.property_name}`;
                dom.categoryButtons.appendChild(btn);
            });

        } catch (e) {
            console.error('[Listings] Failed to load property types:', e);
        }
    }

    // ============================================================
    // FETCH & RENDER
    // ============================================================

    async function fetchAndRenderListings() {
        const currentRequestId = ++SearchState.requestId;

        dom.listingsGrid.innerHTML = '';
        hideEmpty();
        hideError();
        showLoading();
        dom.pagination.style.display = 'none';

        try {
            const result = await window.Biome.Services.Listings.searchListings({
                search: SearchState.searchText,
                propertyTypeId: SearchState.propertyTypeId,
                minPrice: SearchState.minPrice,
                maxPrice: SearchState.maxPrice,
                bedrooms: SearchState.bedrooms,
                bathrooms: SearchState.bathrooms,
                province: SearchState.province,
                city: SearchState.city,
                suburb: SearchState.suburb,
                sortBy: SearchState.sortBy,
                page: SearchState.page,
                pageSize: SearchState.pageSize
            });

            // Check for stale request
            if (currentRequestId !== SearchState.requestId) {
                console.log('[Listings] Stale request ignored.');
                return;
            }

            SearchState.totalCount = result.count;
            hideLoading();

            if (!result.data || result.data.length === 0) {
                dom.listingsGrid.innerHTML = '';
                dom.pagination.style.display = 'none';
                showEmpty();
                updateResultsSummary();
                return;
            }

            hideEmpty();
            const cards = await window.Biome.Services.Properties.getPropertyCardsWithMedia(
                result.data.map(l => l.listing_id)
            );
            renderCards(cards);
            updateResultsSummary();
            updatePagination();

        } catch (e) {
            if (currentRequestId !== SearchState.requestId) return;
            console.error('[Listings] Query failed:', e);
            hideLoading();
            showError();
        }
    }

    function renderCards(cards) {
        dom.listingsGrid.innerHTML = '';
        window.Biome.Components.PropertyCard.renderMultiple(cards, {}, dom.listingsGrid);
    }

    // ============================================================
    // UI HELPERS
    // ============================================================

    function showLoading() {
        dom.loadingState.style.display = 'block';
    }

    function hideLoading() {
        dom.loadingState.style.display = 'none';
    }

    function showEmpty() {
        dom.emptyState.style.display = 'block';
    }

    function hideEmpty() {
        dom.emptyState.style.display = 'none';
    }

    function showError() {
        dom.errorState.style.display = 'block';
    }

    function hideError() {
        dom.errorState.style.display = 'none';
    }

    function updateResultsSummary() {
        const total = SearchState.totalCount;
        if (total === 0) {
            dom.resultsCount.textContent = '0 properties found';
            return;
        }
        const start = (SearchState.page - 1) * SearchState.pageSize + 1;
        const end = Math.min(SearchState.page * SearchState.pageSize, total);
        dom.resultsCount.textContent = `Showing ${start}–${end} of ${total} properties`;
    }

    function updatePagination() {
        const total = SearchState.totalCount;
        const totalPages = Math.ceil(total / SearchState.pageSize);

        if (total === 0 || totalPages <= 1) {
            dom.pagination.style.display = 'none';
            return;
        }

        dom.pagination.style.display = 'flex';
        dom.prevPageBtn.disabled = SearchState.page <= 1;
        dom.nextPageBtn.disabled = SearchState.page >= totalPages;
        dom.pageInfo.textContent = `Page ${SearchState.page} of ${totalPages}`;
    }

    // ============================================================
    // FILTER PANEL
    // ============================================================

    function collapseFilters() {
        dom.extendedFilters.classList.add('collapsed');
        dom.filterToggleBtn.style.display = 'flex';
        dom.filterToggleBtn.setAttribute('aria-expanded', 'false');
    }

    function expandFilters() {
        dom.extendedFilters.classList.remove('collapsed');
        if (window.innerWidth <= 768) {
            dom.filterToggleBtn.style.display = 'none';
        }
        dom.filterToggleBtn.setAttribute('aria-expanded', 'true');
    }

    // ============================================================
    // FILTER LOGIC
    // ============================================================

    function collectSearchState() {
        SearchState.searchText = dom.searchInput.value.trim();

        // Property type now comes from whichever category button is active
        const activeCategoryBtn = document.querySelector('.categories button.active');
        SearchState.propertyTypeId = (activeCategoryBtn && activeCategoryBtn.dataset.typeId) || null;

        SearchState.minPrice = dom.minPrice.value ? parseFloat(dom.minPrice.value) : null;
        SearchState.maxPrice = dom.maxPrice.value ? parseFloat(dom.maxPrice.value) : null;
        SearchState.bedrooms = dom.bedroomsFilter.value ? parseInt(dom.bedroomsFilter.value) : null;
        SearchState.bathrooms = dom.bathroomsFilter.value ? parseInt(dom.bathroomsFilter.value) : null;
        SearchState.province = dom.provinceFilter.value.trim();
        SearchState.city = dom.cityFilter.value.trim();
        SearchState.suburb = dom.suburbFilter.value.trim();
        SearchState.sortBy = dom.sortBy.value;
        SearchState.page = 1;
    }

    function applyFilters() {
        collectSearchState();
        fetchAndRenderListings();
    }

    function resetFilters() {
        dom.searchInput.value = '';
        dom.minPrice.value = '';
        dom.maxPrice.value = '';
        dom.bedroomsFilter.value = '';
        dom.bathroomsFilter.value = '';
        dom.provinceFilter.value = '';
        dom.cityFilter.value = '';
        dom.suburbFilter.value = '';
        dom.sortBy.value = 'newest';

        document.querySelectorAll('.categories button').forEach(b => b.classList.remove('active'));
        const allBtn = document.querySelector('.categories button[data-type-id=""]');
        if (allBtn) allBtn.classList.add('active');

        SearchState.searchText = '';
        SearchState.propertyTypeId = null;
        SearchState.minPrice = null;
        SearchState.maxPrice = null;
        SearchState.bedrooms = null;
        SearchState.bathrooms = null;
        SearchState.province = '';
        SearchState.city = '';
        SearchState.suburb = '';
        SearchState.sortBy = 'newest';
        SearchState.page = 1;

        fetchAndRenderListings();
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================

    // Single debounced handler reused for the search input. Kept at
    // module level so we never create duplicate closures.
    const debouncedSearch = window.Biome.Utils.debounce(() => {
        SearchState.searchText = dom.searchInput.value.trim();
        SearchState.page = 1;
        fetchAndRenderListings();
    }, DEBOUNCE_MS);

    function registerEventListeners() {
        // --- Search input -------------------------------------------------
        if (dom.searchInput) {
            dom.searchInput.addEventListener('input', debouncedSearch);

            // Clicking anywhere inside .search-bar (icon, padding, gaps)
            // focuses the input — protects against a collapsed hit area.
            const searchBar = dom.searchInput.closest('.search-bar');
            if (searchBar) {
                searchBar.addEventListener('click', (e) => {
                    if (e.target === dom.searchInput) return;                 // native focus
                    if (e.target.closest('button, a, select, input, textarea, label')) return;
                    e.preventDefault();
                    dom.searchInput.focus();
                });

                const icon = searchBar.querySelector('i');
                if (icon) {
                    icon.style.cursor = 'text';
                    icon.addEventListener('click', () => dom.searchInput.focus());
                }
            }
        } else {
            console.error('[Listings] searchInput not found — search will not work.');
        }

        // --- Filter toggle ------------------------------------------------
        if (dom.filterToggleBtn) dom.filterToggleBtn.addEventListener('click', toggleFilters);
        if (dom.closeFiltersBtn) dom.closeFiltersBtn.addEventListener('click', collapseFilters);

        // --- Category buttons (sole source of the property-type filter) ---
        if (dom.categoryButtons) {
            dom.categoryButtons.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;

                document.querySelectorAll('.categories button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const typeId = btn.dataset.typeId || '';
                SearchState.propertyTypeId = typeId || null;
                SearchState.page = 1;
                fetchAndRenderListings();
            });
        }

        // --- Sort dropdown -----------------------------------------------
        if (dom.sortBy) {
            dom.sortBy.addEventListener('change', () => {
                SearchState.sortBy = dom.sortBy.value;
                SearchState.page = 1;
                fetchAndRenderListings();
            });
        }

        // --- Apply / Reset -----------------------------------------------
        if (dom.applyFiltersBtn) dom.applyFiltersBtn.addEventListener('click', applyFilters);
        if (dom.resetFiltersBtn) dom.resetFiltersBtn.addEventListener('click', resetFilters);

        const emptyResetBtn = document.getElementById('emptyResetBtn');
        if (emptyResetBtn) emptyResetBtn.addEventListener('click', resetFilters);

        // --- Pagination ---------------------------------------------------
        if (dom.prevPageBtn) {
            dom.prevPageBtn.addEventListener('click', () => {
                if (SearchState.page > 1) {
                    SearchState.page--;
                    fetchAndRenderListings();
                }
            });
        }

        if (dom.nextPageBtn) {
            dom.nextPageBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(SearchState.totalCount / SearchState.pageSize);
                if (SearchState.page < totalPages) {
                    SearchState.page++;
                    fetchAndRenderListings();
                }
            });
        }

        // --- Mobile: click outside collapses filters ---------------------
        document.addEventListener('click', (e) => {
            if (window.innerWidth > 768) return;
            const container = document.getElementById('filtersContainer');
            if (container && !container.contains(e.target)) collapseFilters();
        });
    }

    function toggleFilters() {
        if (dom.extendedFilters.classList.contains('collapsed')) {
            expandFilters();
        } else {
            collapseFilters();
        }
    }
})();
