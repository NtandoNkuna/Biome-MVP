/* ============================================================
   BIOME V2 - Property Details Page Controller
   ============================================================ */

(function() {
    'use strict';

    if (window._biomeDetailsInitialized) {
        console.warn('[Details] Already initialized, skipping.');
        return;
    }
    window._biomeDetailsInitialized = true;

    console.log('[Details] Initializing...');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================================
    // DOM CACHE
    // ============================================================

    const dom = {
        loading:        document.getElementById('loadingState'),
        error:          document.getElementById('errorState'),
        errorMessage:   document.getElementById('errorMessage'),
        content:        document.getElementById('propertyContent'),
        breadcrumbName: document.getElementById('breadcrumbPropertyName'),
        gallery:        document.getElementById('detailsGallery'),
        header:         document.getElementById('detailsHeader'),
        quickFacts:     document.getElementById('detailsQuickFacts'),
        description:    document.getElementById('detailsDescription'),
        amenities:      document.getElementById('detailsAmenities'),
        seller:         document.getElementById('detailsSeller'),
        location:       document.getElementById('detailsLocation'),
        similar:        document.getElementById('detailsSimilar'),
        sidebar:        document.getElementById('detailsSidebar')
    };

    // ============================================================
    // INITIALIZATION
    // ============================================================

    async function init() {
        try {
            if (!window.Biome) {
                console.error('[Details] Biome is undefined!');
                showError('Core not loaded. Please refresh.');
                return;
            }

            await window.Biome.Components.Navbar.init({
                containerId: 'navbarContainer',
                activeLink: 'home'
            });

            const listingId = window.Biome.Utils.getUrlParam('id');

            if (!window.Biome.Utils.validateUUID(listingId)) {
                console.warn('[Details] Invalid UUID');
                showError('Invalid property ID. Please check the URL.');
                return;
            }

            showLoading();

            const property = await window.Biome.Services.Properties.loadProperty(listingId, {
                requireApproved: false,
                includeSimilar: true,
                similarLimit: 4
            });

            renderBreadcrumb(property.listing);
            renderGallery(property.gallery);
            renderHeader(property.listing);
            renderQuickFacts(property.listing);
            renderDescription(property.listing);
            renderAmenities(property.listing);
            renderLocation(property.listing);
            await renderSimilar(property.similar);
            renderSidebar(property.listing, property.seller);

            hideLoading();
            showContent();

            console.log('[Details] ✅ COMPLETE!');
        } catch (e) {
            console.error('[Details] ❌ ERROR:', e);
            hideLoading();
            showError(e.message || 'Unable to load property details. Please try again.');
        }
    }

    // ============================================================
    // UI HELPERS
    // ============================================================

    function showLoading() {
        if (dom.loading) dom.loading.style.display = 'block';
        if (dom.error)   dom.error.style.display = 'none';
        if (dom.content) dom.content.style.display = 'none';
    }

    function hideLoading() {
        if (dom.loading) dom.loading.style.display = 'none';
    }

    function showError(message) {
        if (dom.loading) dom.loading.style.display = 'none';
        if (dom.content) dom.content.style.display = 'none';
        if (dom.error) {
            dom.error.style.display = 'block';
            if (dom.errorMessage) dom.errorMessage.textContent = message || 'Something went wrong.';
        }
    }

    function showContent() {
        if (dom.loading) dom.loading.style.display = 'none';
        if (dom.error)   dom.error.style.display = 'none';
        if (dom.content) dom.content.style.display = 'block';
    }

    function getSafeImageUrl(url) {
        return window.Biome.Storage.getSafeImageUrl(url);
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ============================================================
    // RENDER — BREADCRUMB
    // ============================================================

    function renderBreadcrumb(listing) {
        if (!listing) return;
        if (dom.breadcrumbName) {
            dom.breadcrumbName.textContent = listing.title || 'Property';
        }
        document.title = `Biome | ${listing.title || 'Property Details'}`;
    }

    // ============================================================
    // RENDER — GALLERY
    // ============================================================

    function renderGallery(gallery) {
        const container = dom.gallery;
        if (!container) return;

        const placeholderUrl = window.Biome.Storage.getPlaceholderUrl();

        if (!gallery || gallery.length === 0) {
            container.innerHTML = `
                <div class="gallery-container">
                    <div class="gallery-main">
                        <img src="${placeholderUrl}" alt="No images available">
                    </div>
                </div>
            `;
            return;
        }

        function resolveMediaUrl(media) {
            if (!media) return null;

            if (media.storage_path && window.Biome.Storage?.getPublicUrl) {
                const derived = window.Biome.Storage.getPublicUrl(media.storage_path);
                if (derived) return derived;
            }

            if (media.public_url
                && typeof media.public_url === 'string'
                && /^https?:\/\//i.test(media.public_url)) {
                return media.public_url;
            }

            return null;
        }

        const mainImage    = gallery.find(item => item.is_cover) || gallery[0];
        const mainImageUrl = resolveMediaUrl(mainImage) || placeholderUrl;

        const thumbnailsHTML = gallery.map((item, index) => {
            const thumbUrl = resolveMediaUrl(item) || placeholderUrl;
            const isVideo  = item.media_type === 'video';
            return `
                <button class="gallery-thumbnail ${index === 0 ? 'active' : ''}"
                        data-index="${index}"
                        data-type="${item.media_type || 'image'}"
                        data-path="${item.storage_path || ''}">
                    <img src="${thumbUrl}" alt="Thumbnail ${index + 1}" loading="lazy"
                         onerror="this.src='${placeholderUrl}'">
                    ${isVideo ? '<i class="fa-solid fa-play thumbnail-play-icon"></i>' : ''}
                </button>
            `;
        }).join('');

        container.innerHTML = `
            <div class="gallery-container">
                <div class="gallery-main" id="galleryMain">
                    <img src="${mainImageUrl}" alt="Property image" loading="lazy"
                         onerror="this.src='${placeholderUrl}'">
                </div>
                <div class="gallery-thumbnails" id="galleryThumbnails">
                    ${thumbnailsHTML}
                </div>
            </div>
        `;

        const thumbnails    = container.querySelectorAll('.gallery-thumbnail');
        const mainContainer = document.getElementById('galleryMain');

        thumbnails.forEach(thumb => {
            thumb.addEventListener('click', function() {
                thumbnails.forEach(t => t.classList.remove('active'));
                this.classList.add('active');

                const path = this.dataset.path;
                const type = this.dataset.type;
                const url  = path ? window.Biome.Storage.getPublicUrl(path) : placeholderUrl;

                if (type === 'video') {
                    mainContainer.innerHTML = `
                        <video controls autoplay>
                            <source src="${url}" type="video/mp4">
                            Your browser does not support the video tag.
                        </video>
                    `;
                } else {
                    mainContainer.innerHTML = `
                        <img src="${url || placeholderUrl}" alt="Property image"
                             onerror="this.src='${placeholderUrl}'">
                    `;
                }
            });
        });
    }

    // ============================================================
    // RENDER — HEADER
    // ============================================================

    function renderHeader(listing) {
        const container = dom.header;
        if (!container || !listing) return;

        const statusLabelMap = {
            approved: 'Available',
            pending:  'Pending Review',
            draft:    'Draft',
            rejected: 'Rejected'
        };
        const availability      = statusLabelMap[listing.status] || 'Unknown';
        const availabilityClass = listing.status === 'approved'
            ? 'status-available'
            : 'status-unavailable';

        const locationParts = [
            listing.street, listing.suburb, listing.city, listing.province
        ].filter(Boolean);

        container.innerHTML = `
            <div class="property-header">
                <h1 class="property-title">${escapeHtml(listing.title || 'Untitled Property')}</h1>
                <div class="property-price-row">
                    <span class="property-price">${window.Biome.Utils.formatCurrency(listing.price)}</span>
                    <span class="property-type-badge-large">${escapeHtml(listing.property_type || 'Property')}</span>
                    <span class="property-availability ${availabilityClass}">${availability}</span>
                </div>
                <div class="property-location-row">
                    <i class="fa-solid fa-location-dot"></i>
                    <span>${escapeHtml(locationParts.join(', '))}</span>
                </div>
            </div>
        `;
    }

    // ============================================================
    // RENDER — QUICK FACTS
    // ============================================================

    function renderQuickFacts(listing) {
        const container = dom.quickFacts;
        if (!container || !listing) return;

        const facts = [
            { icon: 'fa-solid fa-bed',          label: 'Bedrooms',      value: listing.bedrooms  || 'N/A' },
            { icon: 'fa-solid fa-bath',         label: 'Bathrooms',     value: listing.bathrooms || 'N/A' },
            { icon: 'fa-solid fa-car',          label: 'Parking',       value: listing.parking   || 'N/A' },
            { icon: 'fa-solid fa-arrows-alt',   label: 'Floor Area',    value: listing.floor_size ? `${listing.floor_size}m²` : 'N/A' }
        ];

        container.innerHTML = `
            <h2>Quick Facts</h2>
            <div class="quick-facts-grid">
                ${facts.map(f => `
                    <div class="quick-fact-card">
                        <i class="${f.icon}"></i>
                        <span class="fact-label">${f.label}</span>
                        <span class="fact-value">${escapeHtml(f.value)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ============================================================
    // RENDER — DESCRIPTION
    // ------------------------------------------------------------
    // The description is pulled directly from the `description`
    // column of `public.listing_details` (NOT NULL in the schema).
    // Blank lines between blocks are honoured so the author's
    // paragraph structure is preserved. Every line is HTML-escaped
    // so nothing in the description can inject markup.
    // ============================================================

    function renderDescription(listing) {
        const container = dom.description;
        if (!container || !listing) return;

        const raw = (listing.description || '').trim();

        if (!raw) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        // Split on blank lines first (paragraph breaks), then
        // split each paragraph on single newlines (soft breaks).
        const paragraphs = raw
            .split(/\n\s*\n/)
            .map(p => p.trim())
            .filter(Boolean);

        const paragraphsHTML = paragraphs.map(para => {
            const lines = para.split('\n').map(l => escapeHtml(l.trim()));
            return `<p>${lines.join('<br>')}</p>`;
        }).join('');

        container.innerHTML = `
            <h2>Description</h2>
            <div class="property-description">
                ${paragraphsHTML}
            </div>
        `;
    }

    // ============================================================
    // RENDER — AMENITIES
    // ============================================================

    function renderAmenities(listing) {
        const container = dom.amenities;
        if (!container) return;

        let amenities = [];
        if (listing.amenities) {
            try {
                if (Array.isArray(listing.amenities)) {
                    amenities = listing.amenities;
                } else if (typeof listing.amenities === 'string') {
                    amenities = listing.amenities.split(',').map(a => a.trim()).filter(Boolean);
                }
            } catch (e) { amenities = []; }
        }

        if (amenities.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = `
            <h2>Amenities</h2>
            <div class="amenities-grid">
                ${amenities.map(a => `
                    <span class="amenity-badge">
                        <i class="fa-solid fa-check"></i> ${escapeHtml(a)}
                    </span>
                `).join('')}
            </div>
        `;
    }

    // ============================================================
    // RENDER — LOCATION  (as a definition table)
    // ------------------------------------------------------------
    // Left column  : field label  (Region, City, Suburb, Street)
    // Right column : value from `public.listing_details`
    //
    // Field mapping (schema → label shown):
    //   province → Region
    //   city     → City
    //   suburb   → Suburb
    //   street   → Street
    //
    // Rows with no value are omitted entirely.
    // ============================================================

    function renderLocation(listing) {
        const container = dom.location;
        if (!container || !listing) return;

        const rows = [
            { label: 'Region', value: listing.province },
            { label: 'City',   value: listing.city     },
            { label: 'Suburb', value: listing.suburb   },
            { label: 'Street', value: listing.street   }
        ].filter(r => r.value !== null && r.value !== undefined && String(r.value).trim() !== '');

        if (rows.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = `
            <h2>Location</h2>
            <dl class="location-table">
                ${rows.map(r => `
                    <div class="location-row">
                        <dt class="location-label">${escapeHtml(r.label)}</dt>
                        <dd class="location-value">${escapeHtml(String(r.value).trim())}</dd>
                    </div>
                `).join('')}
            </dl>
        `;
    }

    // ============================================================
    // RENDER — SIMILAR LISTINGS
    // ============================================================

    async function renderSimilar(listings) {
        const container = dom.similar;
        if (!container) return;

        if (!listings || listings.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        let cards = [];
        try {
            cards = await window.Biome.Services.Properties.getPropertyCardsWithMedia(
                listings.map(l => l.listing_id)
            );
        } catch (e) {
            console.warn('[Details] Failed to load similar card media:', e);
        }

        if (!cards.length) {
            container.style.display = 'none';
            return;
        }

        container.innerHTML = `
            <h2>Similar Listings</h2>
            <div class="similar-grid" id="similarGrid"></div>
        `;

        const grid = container.querySelector('#similarGrid');
        window.Biome.Components.PropertyCard.renderMultiple(cards, {}, grid);
    }

    // ============================================================
    // RENDER — SELLER CARD (shared HTML builder)
    // ============================================================

    function buildSellerCardHTML(seller) {
        if (!seller) return '';

        const placeholderUrl = window.Biome.Storage.getPlaceholderUrl();
        const avatarUrl      = seller.avatar_url
            ? window.Biome.Storage.getPublicUrl(seller.avatar_url)
            : null;

        const initials = (
            (seller.first_name?.[0] || '') + (seller.last_name?.[0] || '')
        ).toUpperCase() || 'B';

        const avatarHTML = avatarUrl
            ? `<img src="${getSafeImageUrl(avatarUrl)}"
                    alt="${escapeHtml(seller.full_name || 'Seller')}"
                    loading="lazy"
                    onerror="this.src='${placeholderUrl}'">`
            : `<div class="savatar-fallback">${initials}</div>`;

        return `
            <div class="sidebar-seller">
                <div class="seller-avatar">
                    ${avatarHTML}
                    ${seller.is_verified ? '<span class="verified-badge"><i class="fa-solid fa-check-circle"></i></span>' : ''}
                </div>
                <div class="seller-info">
                    <h3>${escapeHtml(seller.full_name || 'Property Owner')}</h3>
                    ${seller.company_name ? `<p class="seller-agency">${escapeHtml(seller.company_name)}</p>` : ''}
                    ${seller.phone        ? `<p class="seller-contact"><i class="fa-solid fa-phone"></i> ${escapeHtml(seller.phone)}</p>` : ''}
                    ${seller.email        ? `<p class="seller-contact"><i class="fa-solid fa-envelope"></i> ${escapeHtml(seller.email)}</p>` : ''}
                    ${seller.is_verified  ? '<p class="seller-verified"><i class="fa-solid fa-check-circle"></i> Verified Seller</p>' : ''}
                </div>
            </div>
        `;
    }

    // ============================================================
    // RENDER — SIDEBAR ("Message seller" card)
    // ============================================================

    function renderSidebar(listing, seller) {
        const container = dom.sidebar;
        if (!container || !listing) return;

        const chatLink = (seller && seller.chat_link ? String(seller.chat_link) : '').trim();
        const hasChat  = chatLink.length > 0;

        const sellerHTML = buildSellerCardHTML(seller);

        const ctaHTML = hasChat
            ? `<a href="${escapeHtml(chatLink)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="sidebar-cta">
                   <i class="fa-solid fa-comment-dots"></i>
                   Start conversation
               </a>`
            : `<button type="button"
                       class="sidebar-cta is-disabled"
                       disabled
                       title="This seller hasn't set up a chat link yet.">
                   <i class="fa-solid fa-comment-dots"></i>
                   Chat unavailable
               </button>`;

        container.innerHTML = `
            ${sellerHTML}

            ${ctaHTML}

            <button type="button" class="sidebar-cta-secondary" id="requestViewingBtn">
                <i class="fa-regular fa-calendar"></i>
                Request a viewing
            </button>
        `;

        const viewBtn = container.querySelector('#requestViewingBtn');
        if (viewBtn) {
            viewBtn.addEventListener('click', () => {
                window.Biome.UI.showToast('Viewing requests are coming soon.', 'info');
            });
        }
    }

})();