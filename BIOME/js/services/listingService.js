/* ============================================================
   BIOME V2 - Listing Service
   Updated for actual schema
   ============================================================ */

(function() {
    'use strict';

    if (window.Biome?.Services?.Listings) {
        console.warn('[ListingService] Already initialized, skipping.');
        return;
    }

    if (!window.Biome?.Core?.supabase) {
        throw new Error('[ListingService] Supabase not initialized.');
    }

    const supabase = window.Biome.Core.supabase;

    const ListingService = {

        /**
         * Load all listings for a user
         * @param {string} ownerId - Owner's profile_id
         * @param {Object} options - Query options
         * @returns {Promise<Array>} List of listings
         */
        loadUserListings: async function(ownerId, options = {}) {
            const {
                status = null,
                limit = 100,
                offset = 0,
                sortBy = 'created_at',
                sortOrder = 'desc'
            } = options;

            let query = supabase
                .from('listings')
                .select(`
                    listing_id,
                    owner_id,
                    status,
                    submitted_at,
                    approved_date,
                    reviewed_by,
                    rejection_reason,
                    created_at,
                    updated_at,
                    listing_details!inner (
                        title,
                        price,
                        bedrooms,
                        bathrooms,
                        suburb,
                        city,
                        property_type_id,
                        property_types (
                            property_name
                        )
                    ),
                    listing_media!left (
                        storage_path,
                        public_url,
                        is_cover
                    )
                `)
                .eq('owner_id', ownerId);

            if (status) {
                query = query.eq('status', status);
            }

            query = query
                .order(sortBy, { ascending: sortOrder === 'asc' })
                .range(offset, offset + limit - 1);

            const { data, error } = await query;
            if (error) throw error;

            return (data || []).map(listing => ({
                ...listing,
                title: listing.listing_details?.title || 'Untitled',
                price: listing.listing_details?.price || 0,
                bedrooms: listing.listing_details?.bedrooms || 0,
                bathrooms: listing.listing_details?.bathrooms || 0,
                suburb: listing.listing_details?.suburb || '',
                city: listing.listing_details?.city || '',
                property_type: listing.listing_details?.property_types?.property_name || 'Unknown',
                cover_storage_path: listing.listing_media?.find(m => m.is_cover)?.storage_path || null,
                cover_public_url: listing.listing_media?.find(m => m.is_cover)?.public_url || null
            }));
        },

        /**
         * Load a single listing by ID with all details
         * @param {string} listingId - Listing ID
         * @param {boolean} requireApproved - Whether to require approved status
         * @returns {Promise<Object|null>} Listing object
         */
        loadListing: async function(listingId, requireApproved = false) {
            let query = supabase
                .from('listings')
                .select(`
                    listing_id,
                    owner_id,
                    status,
                    submitted_at,
                    approved_date,
                    reviewed_by,
                    rejection_reason,
                    created_at,
                    updated_at,
                    listing_details!inner (
                        property_type_id,
                        title,
                        description,
                        price,
                        bedrooms,
                        bathrooms,
                        street,
                        suburb,
                        city,
                        province,
                        property_types (
                            property_name
                        )
                    ),
                    listing_media!left (
                        media_id,
                        media_type,
                        storage_path,
                        public_url,
                        is_cover,
                        sort_order
                    )
                `)
                .eq('listing_id', listingId);

            if (requireApproved) {
                query = query.eq('status', 'approved');
            }

            const { data, error } = await query.single();
            if (error) {
                if (error.code === 'PGRST116') return null;
                throw error;
            }

            if (!data) return null;

            const details = data.listing_details || {};
            return {
                listing_id: data.listing_id,
                owner_id: data.owner_id,
                status: data.status,
                submitted_at: data.submitted_at,
                approved_date: data.approved_date,
                reviewed_by: data.reviewed_by,
                rejection_reason: data.rejection_reason,
                created_at: data.created_at,
                updated_at: data.updated_at,
                property_type_id: details.property_type_id,
                title: details.title || 'Untitled',
                description: details.description || '',
                price: details.price || 0,
                bedrooms: details.bedrooms || 0,
                bathrooms: details.bathrooms || 0,
                street: details.street || '',
                suburb: details.suburb || '',
                city: details.city || '',
                province: details.province || '',
                property_type: details.property_types?.property_name || 'Unknown',
                cover_media: data.listing_media?.find(m => m.is_cover) || data.listing_media?.[0] || null,
                media: data.listing_media || []
            };
        },

        /**
         * Search listings with filters.
         *
         * The `status` filter defaults to `'approved'` — the correct
         * behaviour for every public-facing surface (homepage, listings
         * page, property details). Admin callers pass `status: 'all'`
         * to fetch every status, or a specific value (e.g. `'pending'`)
         * to narrow. Passing `'all'` skips the status filter entirely.
         *
         * ORDER SYNTAX NOTE
         * -----------------
         * PostgREST requires embedded columns in the ORDER clause to
         * use PARENTHESES, not a dot. So:
         *   ✅ 'listing_details(price)'   →  order=listing_details(price).asc
         *   ❌ 'listing_details.price'    →  order=listing_details.price.asc
         *                                    → PGRST100 (parse failure)
         * Dotted paths remain valid for FILTERS (eq / gte / lte / ilike),
         * just not for `order()`. This is why only price_* and
         * bedrooms_* sorts were failing.
         *
         * @param {Object} filters - Search filters
         * @returns {Promise<Object>} Results with data and count
         */
        searchListings: async function(filters = {}) {
            const {
                search = '',
                propertyTypeId = null,
                minPrice = null,
                maxPrice = null,
                bedrooms = null,
                bathrooms = null,
                province = '',
                city = '',
                suburb = '',
                sortBy = 'newest',
                page = 1,
                pageSize = 12,
                status = 'approved'
            } = filters;

            const start = (page - 1) * pageSize;
            const end = start + pageSize - 1;

            let query = supabase
                .from('listings')
                .select(`
                    listing_id,
                    status,
                    submitted_at,
                    listing_details!inner (
                        title,
                        price,
                        bedrooms,
                        bathrooms,
                        suburb,
                        city,
                        province,
                        property_type_id,
                        property_types (
                            property_name
                        )
                    ),
                    listing_media!left (
                        public_url,
                        is_cover
                    )
                `, { count: 'exact' });

            // Status filter: 'all' skips the constraint entirely.
            if (status && status !== 'all') {
                query = query.eq('status', status);
            }

            if (propertyTypeId) {
                query = query.eq('listing_details.property_type_id', propertyTypeId);
            }
            if (minPrice !== null && minPrice !== undefined) {
                query = query.gte('listing_details.price', minPrice);
            }
            if (maxPrice !== null && maxPrice !== undefined) {
                query = query.lte('listing_details.price', maxPrice);
            }
            if (bedrooms !== null && bedrooms !== undefined) {
                query = query.gte('listing_details.bedrooms', bedrooms);
            }
            if (bathrooms !== null && bathrooms !== undefined) {
                query = query.gte('listing_details.bathrooms', bathrooms);
            }
            if (province) {
                query = query.ilike('listing_details.province', `%${province}%`);
            }
            if (city) {
                query = query.ilike('listing_details.city', `%${city}%`);
            }
            if (suburb) {
                query = query.ilike('listing_details.suburb', `%${suburb}%`);
            }
            if (search) {
                query = query.or(
                    `title.ilike.%${search}%,` +
                    `city.ilike.%${search}%,` +
                    `suburb.ilike.%${search}%,` +
                    `province.ilike.%${search}%`,
                    { foreignTable: 'listing_details' }
                );
            }

            // ---------------------------------------------------------
            // Sort mapping — embedded columns use PARENTHESES.
            // ---------------------------------------------------------
            switch (sortBy) {
                case 'oldest':
                    query = query.order('created_at', { ascending: true });
                    break;
                case 'price_asc':
                    query = query.order('listing_details(price)', { ascending: true });
                    break;
                case 'price_desc':
                    query = query.order('listing_details(price)', { ascending: false });
                    break;
                default:
                    query = query.order('created_at', { ascending: false });
            }

            query = query.range(start, end);

            const { data, count, error } = await query;
            if (error) throw error;

            const formattedData = (data || []).map(item => ({
                listing_id: item.listing_id,
                status: item.status,
                submitted_at: item.submitted_at,
                title: item.listing_details?.title || 'Untitled',
                price: item.listing_details?.price || 0,
                bedrooms: item.listing_details?.bedrooms || 0,
                bathrooms: item.listing_details?.bathrooms || 0,
                suburb: item.listing_details?.suburb || '',
                city: item.listing_details?.city || '',
                province: item.listing_details?.province || '',
                property_type: item.listing_details?.property_types?.property_name || 'Unknown',
                property_type_id: item.listing_details?.property_type_id || null,
                cover_public_url: item.listing_media?.find(m => m.is_cover)?.public_url || null
            }));

            return {
                data: formattedData,
                count: count || 0,
                page: page,
                pageSize: pageSize,
                totalPages: Math.ceil((count || 0) / pageSize)
            };
        },

        /**
         * Create a new listing
         * @param {Object} data - Listing data
         * @param {string} ownerId - Owner's profile_id
         * @param {string} status - Listing status ('draft' or 'pending')
         * @returns {Promise<string>} New listing ID
         */
        createListing: async function(data, ownerId, status = 'draft') {
            const { data: listing, error: listingError } = await supabase
                .from('listings')
                .insert({
                    owner_id: ownerId,
                    status: status,
                    submitted_at: status === 'pending' ? new Date().toISOString() : null
                })
                .select()
                .single();

            if (listingError) throw listingError;

            const listingId = listing.listing_id;

            const details = {
                listing_id: listingId,
                property_type_id: data.property_type_id || 1,
                title: data.title || 'Untitled',
                description: data.description || '',
                price: data.price || 0,
                bedrooms: data.bedrooms || 0,
                bathrooms: data.bathrooms || 0,
                street: data.street || '',
                suburb: data.suburb || '',
                city: data.city || '',
                province: data.province || ''
            };

            const { error: detailsError } = await supabase
                .from('listing_details')
                .insert(details);

            if (detailsError) {
                await supabase.from('listings').delete().eq('listing_id', listingId);
                throw detailsError;
            }

            return listingId;
        },

        /**
         * Update an existing listing
         * @param {string} listingId - Listing ID
         * @param {Object} data - Updated data
         * @param {string} status - New status
         * @returns {Promise<void>}
         */
        updateListing: async function(listingId, data, status = null) {
            const details = {
                property_type_id: data.property_type_id || 1,
                title: data.title || 'Untitled',
                description: data.description || '',
                price: data.price || 0,
                bedrooms: data.bedrooms || 0,
                bathrooms: data.bathrooms || 0,
                street: data.street || '',
                suburb: data.suburb || '',
                city: data.city || '',
                province: data.province || ''
            };

            const { error: detailsError } = await supabase
                .from('listing_details')
                .update(details)
                .eq('listing_id', listingId);

            if (detailsError) throw detailsError;

            if (status) {
                const updateData = {
                    status: status,
                    updated_at: new Date().toISOString()
                };
                if (status === 'pending') {
                    updateData.submitted_at = new Date().toISOString();
                    updateData.approved_date = null;
                    updateData.reviewed_by = null;
                    updateData.rejection_reason = null;
                }
                const { error: statusError } = await supabase
                    .from('listings')
                    .update(updateData)
                    .eq('listing_id', listingId);

                if (statusError) throw statusError;
            }
        },

        /**
         * Delete a listing
         * @param {string} listingId - Listing ID
         * @returns {Promise<void>}
         */
        deleteListing: async function(listingId) {
            const { error } = await supabase
                .from('listings')
                .delete()
                .eq('listing_id', listingId);

            if (error) throw error;
        },

        /**
         * Approve a listing (admin)
         * @param {string} listingId - Listing ID
         * @param {string} adminId - Admin profile_id
         * @returns {Promise<Object>} Updated listing
         */
        approveListing: async function(listingId, adminId) {
            const { data, error } = await supabase
                .from('listings')
                .update({
                    status: 'approved',
                    approved_date: new Date().toISOString(),
                    reviewed_by: adminId,
                    rejection_reason: null,
                    updated_at: new Date().toISOString()
                })
                .eq('listing_id', listingId)
                .select();

            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error('No rows updated. RLS may be blocking the update.');
            }
            return data[0];
        },

        /**
         * Reject a listing (admin)
         * @param {string} listingId - Listing ID
         * @param {string} adminId - Admin profile_id
         * @param {string} reason - Rejection reason
         * @returns {Promise<Object>} Updated listing
         */
        rejectListing: async function(listingId, adminId, reason) {
            const { data, error } = await supabase
                .from('listings')
                .update({
                    status: 'rejected',
                    reviewed_by: adminId,
                    rejection_reason: reason || 'No reason provided.',
                    approved_date: null,
                    updated_at: new Date().toISOString()
                })
                .eq('listing_id', listingId)
                .select();

            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error('No rows updated. RLS may be blocking the update.');
            }
            return data[0];
        },

        /**
         * Get listing metrics for a user
         * @param {string} ownerId - Owner's profile_id
         * @returns {Promise<Object>} Metrics object
         */
        getMetrics: async function(ownerId) {
            const { data: listings, error } = await supabase
                .from('listings')
                .select('status')
                .eq('owner_id', ownerId);

            if (error) throw error;

            const metrics = {
                total: 0,
                draft: 0,
                pending: 0,
                approved: 0,
                rejected: 0
            };

            (listings || []).forEach(l => {
                metrics.total++;
                if (l.status === 'draft') metrics.draft++;
                else if (l.status === 'pending') metrics.pending++;
                else if (l.status === 'approved') metrics.approved++;
                else if (l.status === 'rejected') metrics.rejected++;
            });

            return metrics;
        },

        /**
         * Get public metrics for the landing page
         * @returns {Promise<Object>} Public metrics
         */
        getPublicMetrics: async function() {
            const [propsResult, ownersResult] = await Promise.all([
                supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('account_type', 'seller')
            ]);

            const totalProperties = propsResult.count || 0;
            const totalOwners = ownersResult.count || 0;

            const { data: cityData } = await supabase
                .from('listing_details')
                .select('city')
                .eq('listing_id', supabase.from('listings').select('listing_id').eq('status', 'approved'));

            const uniqueCities = new Set((cityData || []).map(l => l.city).filter(Boolean));

            return {
                totalProperties,
                totalOwners,
                uniqueCities: uniqueCities.size
            };
        }
    };

    window.Biome = window.Biome || {};
    window.Biome.Services = window.Biome.Services || {};
    window.Biome.Services.Listings = ListingService;

    console.log('[ListingService] Initialized successfully.');
})();