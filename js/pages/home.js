/* ============================================================
   BIOME V2 - Home Page (Landing)
   Orchestrates the landing page
   ============================================================ */

(function() {
    'use strict';

    // Prevent multiple initialization
    if (window._biomeHomeInitialized) {
        console.warn('[Home] Already initialized, skipping.');
        return;
    }
    window._biomeHomeInitialized = true;

    console.log('[Home] Initializing...');

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    async function init() {
        try {
            // Initialize components
            await initNavbar();
            await initHeroSearch();
            await initStatistics();
            await initFeaturedListings();
            await initBecomeHost();

            console.log('[Home] Ready.');
        } catch (e) {
            console.error('[Home] Initialization error:', e);
            window.Biome.UI.showToast('Failed to load page. Please refresh.', 'error');
        }
    }

    // ============================================================
    // NAVBAR
    // ============================================================

    async function initNavbar() {
        await window.Biome.Components.Navbar.init({
            containerId: 'navbarContainer',
            activeLink: 'home'  // ✅ 'home' = Browse is active
        });
    }

    // ============================================================
    // HERO SEARCH
    // ============================================================

    async function initHeroSearch() {
        const searchForm = document.getElementById('searchForm');
        if (!searchForm) return;

        // Load property types into dropdowns
        await loadPropertyTypes();

        // Pre-fill the hero search from the URL (e.g. when returning from
        // the listings page, or when the landing page itself is shared
        // with a pre-processed search already in the query string).
        prefillHeroSearch(searchForm);

        searchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleSearchSubmit(this);
        });
    }

    function prefillHeroSearch(form) {
        const params = window.Biome.Utils.getUrlParams();
        if (!params || Object.keys(params).length === 0) return;

        const fieldMap = {
            search: 'heroSearch',
            province: 'heroProvince',
            city: 'heroCity',
            type: 'heroPropertyType',
            minPrice: 'heroMinPrice',
            maxPrice: 'heroMaxPrice'
        };

        for (const [param, fieldId] of Object.entries(fieldMap)) {
            const value = params[param];
            if (!value) continue;
            const el = form.querySelector(`#${fieldId}`);
            if (el) el.value = value;
        }
    }

    async function loadPropertyTypes() {
        try {
            const { data: types, error } = await window.Biome.Core.supabase
                .from('property_types')
                .select('property_type_id, property_name')
                .order('property_name');

            if (error) throw error;

            populateHeroPropertyTypeSelect(types || []);
            wireCategoryLinks(types || []);
        } catch (e) {
            console.error('[Home] Failed to load property types:', e);
        }
    }

    function populateHeroPropertyTypeSelect(types) {
        const select = document.getElementById('heroPropertyType');
        if (!select || !types || types.length === 0) return;

        const defaultOption = select.querySelector('option[value=""]');
        select.innerHTML = '';
        if (defaultOption) {
            select.appendChild(defaultOption);
        } else {
            const empty = document.createElement('option');
            empty.value = '';
            empty.textContent = 'All Types';
            select.appendChild(empty);
        }

        types.forEach(type => {
            const option = document.createElement('option');
            option.value = type.property_type_id;
            option.textContent = type.property_name;
            select.appendChild(option);
        });
    }

    // ============================================================
    // CATEGORY LINKS (Browse by Category + footer)
    // ============================================================

    function wireCategoryLinks(types) {
        const links = document.querySelectorAll('[data-category-match]');
        if (!links.length) return;

        if (!types || types.length === 0) {
            // No types came back - leave the links pointing at the
            // unfiltered listings page rather than a broken filter.
            return;
        }

        links.forEach(link => {
            const keyword = link.dataset.categoryMatch;
            const match = findMatchingPropertyType(types, keyword);
            if (match) {
                link.href = `property-listings.html?type=${match.property_type_id}`;
            }
            // No match: leave the href pointing at the unfiltered
            // listings page (already set in the HTML) rather than a
            // type id that doesn't exist in the database.
        });
    }

    function findMatchingPropertyType(types, keyword) {
        if (!keyword) return null;
        const needle = keyword.toLowerCase();

        // Try a direct substring match in either direction first
        // (e.g. "student" matches "Student Accommodation").
        let match = types.find(t => {
            const name = (t.property_name || '').toLowerCase();
            return name.includes(needle) || needle.includes(name);
        });
        if (match) return match;

        // Fall back to known synonyms for categories that might be
        // named slightly differently in the database.
        const synonyms = {
            residential: ['residential', 'house', 'apartment', 'home'],
            commercial: ['commercial', 'office', 'retail', 'shop'],
            student: ['student', 'accommodation', 'campus'],
            industrial: ['industrial', 'warehouse', 'factory']
        };

        const candidates = synonyms[needle] || [];
        match = types.find(t => {
            const name = (t.property_name || '').toLowerCase();
            return candidates.some(word => name.includes(word));
        });

        return match || null;
    }

    function handleSearchSubmit(form) {
        const params = new URLSearchParams();

        const searchInput = form.querySelector('#heroSearch');
        if (searchInput && searchInput.value.trim()) {
            params.set('search', searchInput.value.trim());
        }

        const selectors = [
            { id: 'heroProvince', key: 'province' },
            { id: 'heroCity', key: 'city' },
            { id: 'heroPropertyType', key: 'type' },
            { id: 'heroMinPrice', key: 'minPrice' },
            { id: 'heroMaxPrice', key: 'maxPrice' }
        ];

        for (const { id, key } of selectors) {
            const el = form.querySelector(`#${id}`);
            if (el && el.value) {
                params.set(key, el.value);
            }
        }

        window.location.href = `property-listings.html?${params.toString()}`;
    }

    // ============================================================
    // STATISTICS
    // ============================================================

    async function initStatistics() {
        const statElements = {
            properties: document.getElementById('statProperties'),
            owners: document.getElementById('statOwners'),
            cities: document.getElementById('statCities'),
            successful: document.getElementById('statSuccessful')
        };

        if (!statElements.properties) return;

        try {
            const metrics = await window.Biome.Services.Listings.getPublicMetrics();

            animateValue(statElements.properties, metrics.totalProperties);
            animateValue(statElements.owners, metrics.totalOwners);
            animateValue(statElements.cities, metrics.uniqueCities);
            animateValue(statElements.successful, metrics.totalProperties);

        } catch (e) {
            console.error('[Home] Failed to load statistics:', e);
            statElements.properties.textContent = '0';
            statElements.owners.textContent = '0';
            statElements.cities.textContent = '0';
            statElements.successful.textContent = '0';
        }
    }

    function animateValue(element, target) {
        if (!element) return;
        element.textContent = '0';
        const duration = 1500;
        const start = performance.now();

        function update(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            element.textContent = Math.floor(target * eased);
            if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
    }

    // ============================================================
    // FEATURED LISTINGS
    // ============================================================

    async function initFeaturedListings() {
        const grid = document.getElementById('featuredGrid');
        const loading = document.getElementById('featuredLoading');
        const empty = document.getElementById('featuredEmpty');
        const error = document.getElementById('featuredError');

        if (!grid) return;

        try {
            if (loading) loading.style.display = 'none';
            grid.style.display = 'grid';

            const result = await window.Biome.Services.Listings.searchListings({
                page: 1,
                pageSize: 3,
                sortBy: 'newest'
            });

            if (!result.data || result.data.length === 0) {
                if (empty) empty.style.display = 'block';
                return;
            }

            const propertyCards = await window.Biome.Services.Properties.getPropertyCardsWithMedia(
                result.data.map(l => l.listing_id)
            );

            window.Biome.Components.PropertyCard.renderMultiple(propertyCards, {}, grid);

        } catch (e) {
            console.error('[Home] Failed to load featured listings:', e);
            if (error) error.style.display = 'block';
        } finally {
            if (loading) loading.style.display = 'none';
        }
    }

    // ============================================================
    // BECOME A HOST
    // ============================================================

    async function initBecomeHost() {
        const btn = document.getElementById('becomeHostBtn');
        if (!btn) return;

        btn.addEventListener('click', async function(e) {
            e.preventDefault();

            try {
                const user = await window.Biome.Auth.getCurrentUser();

                if (!user) {
                    window.location.href = 'sign-up.html';
                    return;
                }

                const profile = await window.Biome.Auth.getCurrentProfile();
                if (!profile || profile.account_type === 'buyer') {
                    window.location.href = 'seller-onboarding.html';
                } else if (profile.account_type === 'seller') {
                    window.location.href = 'seller-dashboard.html';
                } else if (profile.account_type === 'admin') {
                    window.location.href = 'admin-dashboard.html';
                }
            } catch (e) {
                console.error('[Home] Become host error:', e);
                window.location.href = 'sign-up.html';
            }
        });
    }
})();
