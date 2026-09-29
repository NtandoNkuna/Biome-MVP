/* ============================================================
   BIOME V2 - Property Service
   Combines listing, media, seller, and similar data
   Updated for actual schema
   ============================================================ */

(function() {
    'use strict';

    if (window.Biome?.Services?.Properties) {
        console.warn('[PropertyService] Already initialized, skipping.');
        return;
    }

    if (!window.Biome?.Services?.Listings) {
        throw new Error('[PropertyService] ListingService not initialized.');
    }
    if (!window.Biome?.Services?.Media) {
        throw new Error('[PropertyService] MediaService not initialized.');
    }
    if (!window.Biome?.Services?.Profiles) {
        throw new Error('[PropertyService] ProfileService not initialized.');
    }

    const ListingService = window.Biome.Services.Listings;
    const MediaService = window.Biome.Services.Media;
    const ProfileService = window.Biome.Services.Profiles;

    const PropertyService = {

        /**
         * Resolve a cover media row into a displayable image URL.
         *
         * Precedence:
         *   1. Derive from storage_path — source of truth. NOT NULL in
         *      the schema and always produces a URL for the current
         *      Supabase project, so it can't go stale.
         *   2. Fall back to public_url — only if it's an absolute URL
         *      and derivation from storage_path failed. public_url is
         *      nullable and effectively always null on this project.
         *   3. Return null — let the card substitute its own placeholder.
         *
         * @param {Object|null} media - A listing_media row
         * @returns {string|null} Resolved URL or null
         */
        _resolveCoverUrl: function(media) {
            if (!media) return null;

            // Reject non-image media — a video URL handed to an <img>
            // tag would fail and fall through to the placeholder anyway.
            if (media.media_type && media.media_type !== 'image') {
                return null;
            }

            // 1. Derive from storage_path — the source of truth.
            if (media.storage_path && window.Biome.Storage?.getPublicUrl) {
                const derived = window.Biome.Storage.getPublicUrl(media.storage_path);
                if (derived) return derived;
            }

            // 2. Fall back to public_url only if it's a real URL.
            if (media.public_url
                && typeof media.public_url === 'string'
                && /^https?:\/\//i.test(media.public_url)) {
                return media.public_url;
            }

            return null;
        },

        /**
         * Load a complete property by ID
         */
        loadProperty: async function(listingId, options = {}) {
            const {
                requireApproved = true,
                includeSimilar = true,
                similarLimit = 4
            } = options;

            const listing = await ListingService.loadListing(listingId, requireApproved);
            if (!listing) throw new Error('Property not found.');

            let gallery = listing.media || [];
            try {
                gallery = await MediaService.getListingMedia(listingId);
            } catch (e) {
                console.warn('[PropertyService] Failed to load gallery, falling back to inline media:', e);
            }

            let seller = null;
            if (listing.owner_id) {
                try {
                    seller = await ProfileService.getSeller(listing.owner_id);
                } catch (e) {
                    console.warn('[PropertyService] Failed to load seller:', e);
                }
            }

            let similar = [];
            if (includeSimilar) {
                try {
                    const result = await ListingService.searchListings({
                        propertyTypeId: listing.property_type_id,
                        city: listing.city,
                        page: 1,
                        pageSize: similarLimit
                    });
                    similar = result.data.filter(l => l.listing_id !== listingId);
                } catch (e) {
                    console.warn('[PropertyService] Failed to load similar:', e);
                }
            }

            const formattedListing = {
                ...listing,
                gallery: gallery
            };

            return {
                listing: formattedListing,
                gallery: gallery,
                seller: seller,
                similar: similar
            };
        },

        /**
         * Get a property card representation
         */
        getPropertyCard: function(listing) {
            let coverUrl = null;
            if (listing.cover_media) {
                coverUrl = this._resolveCoverUrl(listing.cover_media);
            }
            if (!coverUrl && listing.cover_public_url) {
                coverUrl = listing.cover_public_url;
            }
            if (!coverUrl && listing.cover_storage_path) {
                coverUrl = window.Biome.Storage.getPublicUrl(listing.cover_storage_path);
            }

            return {
                listing_id: listing.listing_id,
                title: listing.title || 'Untitled',
                price: listing.price || 0,
                bedrooms: listing.bedrooms || 0,
                bathrooms: listing.bathrooms || 0,
                city: listing.city || '',
                suburb: listing.suburb || '',
                property_type: listing.property_type || 'Property',
                cover_url: coverUrl,
                submitted_at: listing.submitted_at
            };
        },

        /**
         * Get property cards with media loaded
         */
        getPropertyCardsWithMedia: async function(listingIds) {
            if (!listingIds || listingIds.length === 0) return [];

            const results = await Promise.allSettled(
                listingIds.map(id => ListingService.loadListing(id, false))
            );

            const validListings = [];
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    validListings.push(result.value);
                } else if (result.status === 'rejected') {
                    console.warn('[PropertyService] Failed to load card for listing', listingIds[index], result.reason);
                }
            });

            const resolveCover = this._resolveCoverUrl.bind(this);

            return validListings.map(listing => ({
                listing_id: listing.listing_id,
                title: listing.title || 'Untitled',
                price: listing.price || 0,
                bedrooms: listing.bedrooms || 0,
                bathrooms: listing.bathrooms || 0,
                city: listing.city || '',
                suburb: listing.suburb || '',
                property_type: listing.property_type || 'Property',
                cover_url: resolveCover(listing.cover_media),
                submitted_at: listing.submitted_at
            }));
        },

        /**
         * Get a preview of a property (for cards)
         */
        getPropertyPreview: async function(listingId) {
            const listing = await ListingService.loadListing(listingId, true);
            if (!listing) return null;
            return this.getPropertyCard(listing);
        }
    };

    window.Biome = window.Biome || {};
    window.Biome.Services = window.Biome.Services || {};
    window.Biome.Services.Properties = PropertyService;

    console.log('[PropertyService] Initialized successfully.');
})();