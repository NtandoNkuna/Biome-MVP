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
    // DOM CACHE
    // ============================================================
    // IMPORTANT: this object must be populated AFTER the DOM is ready.
    // Caching at module-evaluation time captures `null` whenever the
    // script is parsed before the markup exists (e.g. loaded from <head>).
    // That stale null was the cause of the search bar not responding:
    // registerEventListeners() threw on `dom.searchInput.addEventListener`
    // and init() aborted before any listener was attached.
    //
    // Note: the property-type <select> has been removed from the markup.
    // Property type is now chosen only through the category buttons.

    let dom = {};

    function cacheDom() {
        dom = {
            searchInput:      document.getElementById('searchInput'),
            filterToggleBtn:  document.getElementById('filterToggleBtn'),
            extendedFilters:  document.getElementById('extendedFilters'),
            closeFiltersBtn:  document.getElementById('closeFiltersBtn'),
            categoryButtons:  document.getElementById('categoryButtons'),
            minPrice:         document.getElementById('minPrice'),
            maxPrice:         document.getElementById('maxPrice'),
            bedroomsFilter:   document.getElementById('bedroomsFilter'),
            bathroomsFilter:  document.getElementById('bathroomsFilter'),
            provinceFilter:   document.getElementById('provinceFilter'),
            cityFilter:       document.getElementById('cityFilter'),
            suburbFilter:     document.getElementById('suburbFilter'),
            sortBy:           document.getElementById('sortBy'),
            applyFiltersBtn:  document.getElementById('applyFiltersBtn'),
            resetFiltersBtn:  document.getElementById('resetFiltersBtn'),
            listingsGrid:     document.getElementById('listingsGrid'),
            resultsCount:     document.getElementById('resultsCount'),
            loadingState:     document.getElementById('loadingState'),
            emptyState:       document.getElementById('emptyState'),
            errorState:       document.getElementById('errorState'),
            pagination:       document.getElementById('pagination'),
            prevPageBtn:      document.getElementById('prevPageBtn'),
            nextPageBtn:      document.getElementById('nextPageBtn'),
            pageInfo:         document.getElementById('pageInfo'),
        };

        // Surface missing nodes explicitly instead of failing silently later.
        const missing = Object.entries(dom)
            .filter(([, el]) => !el)
            .map(([key]) => key);

        if (missing.length) {
            console.warn('[Listings] Missing DOM nodes:', missing.join(', '));
        }
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================

    async function init() {
        try {
            // Build the DOM cache first — everything below depends on it.
            cacheDom();

            await initNavbar();
            await loadPropertyTypes();
            applyUrlParams();
            registerEventListeners();
            await fetchAndRenderListings();

            // On mobile, start with filters collapsed
            if (window.innerWidth <= 768) {
                collapseFilters();
            }

            console.log('[Listings] Ready.');
        } catch (e) {
            console.error('[Listings] Initialization error:', e);
            window.Biome.UI.showToast('Failed to load page. Please refresh.', 'error');
        }
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

    function registerEventListeners() {
        // Guard: if the search input is missing, fail loudly instead of
        // silently aborting the rest of the listener registration.
        if (!dom.searchInput) {
            console.error('[Listings] searchInput not found — search will not work.');
            return;
        }

        // Search input (debounced)
        dom.searchInput.addEventListener('input', window.Biome.Utils.debounce(() => {
            SearchState.searchText = dom.searchInput.value.trim();
            SearchState.page = 1;
            fetchAndRenderListings();
        }, DEBOUNCE_MS));

        // Filter toggle
        dom.filterToggleBtn.addEventListener('click', toggleFilters);
        dom.closeFiltersBtn.addEventListener('click', collapseFilters);

        // Category buttons (sole source of the property-type filter)
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

        // Sort dropdown
        dom.sortBy.addEventListener('change', () => {
            SearchState.sortBy = dom.sortBy.value;
            SearchState.page = 1;
            fetchAndRenderListings();
        });

        dom.applyFiltersBtn.addEventListener('click', applyFilters);
        dom.resetFiltersBtn.addEventListener('click', resetFilters);

        const emptyResetBtn = document.getElementById('emptyResetBtn');
        if (emptyResetBtn) {
            emptyResetBtn.addEventListener('click', resetFilters);
        }

        // Pagination
        dom.prevPageBtn.addEventListener('click', () => {
            if (SearchState.page > 1) {
                SearchState.page--;
                fetchAndRenderListings();
            }
        });

        dom.nextPageBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(SearchState.totalCount / SearchState.pageSize);
            if (SearchState.page < totalPages) {
                SearchState.page++;
                fetchAndRenderListings();
            }
        });

        // Close filters on outside click (mobile)
        document.addEventListener('click', (e) => {
            if (window.innerWidth > 768) return;
            const container = document.getElementById('filtersContainer');
            if (container && !container.contains(e.target)) {
                collapseFilters();
            }
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
