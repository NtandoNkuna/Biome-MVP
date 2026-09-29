/* ============================================================
   BIOME V2 - Property Card Component
   Reusable property card rendering with placeholder support
   ============================================================ */

(function() {
    'use strict';

    // Prevent multiple initialization
    if (window.Biome?.Components?.PropertyCard) {
        console.warn('[PropertyCard] Already initialized, skipping.');
        return;
    }

    const PropertyCard = {

        /**
         * Get a safe image URL with fallback
         * @param {string} url - Image URL
         * @returns {string} Safe URL with fallback
         */
        _getSafeImageUrl: function(url) {
            return window.Biome.Storage.getSafeImageUrl(url);
        },

        /**
         * Render a property card
         * @param {Object} property - Property data
         * @param {Object} options - Rendering options
         * @returns {HTMLElement} Card element
         */
        render: function(property, options = {}) {
            const {
                onClick = null,
                className = '',
                showType = true,
                showLocation = true,
                showTags = true,
                showPrice = true
            } = options;

            const {
                listing_id,
                title,
                price,
                bedrooms,
                bathrooms,
                city,
                suburb,
                property_type,
                cover_url
            } = property;

            const card = document.createElement('div');
            card.className = `property-card ${className}`;
            card.dataset.listingId = listing_id;

            // Get safe image URL
            const imageUrl = this._getSafeImageUrl(cover_url);
            const placeholderUrl = window.Biome.Storage.getPlaceholderUrl();

            // Build card HTML
            const priceHtml = showPrice
                ? `<h4>${window.Biome.Utils.formatCurrency(price)} <span>/month</span></h4>`
                : '';

            const locationHtml = showLocation && (suburb || city)
                ? `<div class="location"><i class="fa-solid fa-location-dot"></i> ${suburb || ''}${suburb && city ? ', ' : ''}${city || ''}</div>`
                : '';

            const typeHtml = showType && property_type
                ? `<span class="property-type-badge">${property_type}</span>`
                : '';

            const tagsHtml = showTags
                ? `<div class="property-tags">
                    <span><i class="fa-solid fa-bed"></i> ${bedrooms || 0} Beds</span>
                    <span><i class="fa-solid fa-bath"></i> ${bathrooms || 0} Baths</span>
                </div>`
                : '';

            card.innerHTML = `
                <div class="property-image">
                    <img src="${imageUrl}" 
                         alt="${title || 'Property'}" 
                         loading="lazy"
                         onerror="this.src='${placeholderUrl}'">
                    ${typeHtml}
                </div>
                <div class="property-body">
                    <h3>${title || 'Untitled'}</h3>
                    ${locationHtml}
                    ${priceHtml ? `<div class="price-row">${priceHtml}</div>` : ''}
                    ${tagsHtml}
                </div>
            `;

            // Add click handler
            if (onClick) {
                card.addEventListener('click', () => onClick(listing_id));
            } else {
                card.addEventListener('click', () => {
                    window.location.href = `property-details.html?id=${listing_id}`;
                });
            }

            // Keyboard support
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.click();
                }
            });

            return card;
        },

        /**
         * Render a property card as HTML string
         * @param {Object} property - Property data
         * @param {Object} options - Rendering options
         * @returns {string} Card HTML
         */
        renderString: function(property, options = {}) {
            const card = this.render(property, options);
            return card.outerHTML;
        },

        /**
         * Render multiple property cards
         * @param {Array} properties - Array of property data
         * @param {Object} options - Rendering options
         * @param {HTMLElement} container - Container element
         * @returns {Array} Array of card elements
         */
        renderMultiple: function(properties, options = {}, container = null) {
            const cards = properties.map(p => this.render(p, options));

            if (container) {
                container.innerHTML = '';
                cards.forEach(card => container.appendChild(card));
            }

            return cards;
        },

        /**
         * Create a skeleton card
         * @param {number} count - Number of skeleton cards
         * @param {HTMLElement} container - Container element
         * @returns {Array} Array of skeleton elements
         */
        renderSkeletons: function(count = 3, container = null) {
            const skeletons = [];

            for (let i = 0; i < count; i++) {
                const skeleton = document.createElement('div');
                skeleton.className = 'property-card skeleton-card';
                skeleton.innerHTML = `
                    <div class="skeleton skeleton-image"></div>
                    <div class="property-body">
                        <div class="skeleton skeleton-text" style="width:70%;height:16px;margin-bottom:8px;"></div>
                        <div class="skeleton skeleton-text" style="width:50%;height:14px;margin-bottom:8px;"></div>
                        <div class="skeleton skeleton-text" style="width:60%;height:14px;"></div>
                    </div>
                `;
                skeletons.push(skeleton);
            }

            if (container) {
                container.innerHTML = '';
                skeletons.forEach(s => container.appendChild(s));
            }

            return skeletons;
        },

        /**
         * Create an empty state
         * @param {string} message - Empty state message
         * @param {string} icon - Empty state icon
         * @returns {HTMLElement} Empty state element
         */
        renderEmpty: function(message = 'No properties found', icon = '🏠') {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = `
                <div class="empty-icon">${icon}</div>
                <h3>${message}</h3>
                <p>Check back soon for new listings.</p>
            `;
            return empty;
        }
    };

    // Initialize namespace
    window.Biome = window.Biome || {};
    window.Biome.Components = window.Biome.Components || {};
    window.Biome.Components.PropertyCard = PropertyCard;

    console.log('[PropertyCard] Component ready.');
})();