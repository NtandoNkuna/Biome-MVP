/* ============================================================
   BIOME V2 - Media Service
   Updated for actual schema
   ============================================================ */

(function() {
    'use strict';

    if (window.Biome?.Services?.Media) {
        console.warn('[MediaService] Already initialized, skipping.');
        return;
    }

    if (!window.Biome?.Core?.supabase) {
        throw new Error('[MediaService] Supabase not initialized.');
    }

    const supabase = window.Biome.Core.supabase;

    const MediaService = {

        /**
         * Get all media for a listing
         * @param {string} listingId - Listing ID
         * @returns {Promise<Array>} Media objects
         */
        getListingMedia: async function(listingId) {
            const { data, error } = await supabase
                .from('listing_media')
                .select('media_id, media_type, storage_path, public_url, is_cover, sort_order, uploaded_at')
                .eq('listing_id', listingId)
                .order('sort_order', { ascending: true });

            if (error) throw error;
            return data || [];
        },

        /**
         * Get the cover image for a listing
         * @param {string} listingId - Listing ID
         * @returns {Promise<Object|null>} Cover media object
         */
        getCoverImage: async function(listingId) {
            const { data, error } = await supabase
                .from('listing_media')
                .select('media_id, media_type, storage_path, public_url, is_cover, sort_order')
                .eq('listing_id', listingId)
                .eq('is_cover', true)
                .maybeSingle();

            if (error) throw error;

            // If no cover found, get the first image
            if (!data) {
                const { data: firstImage, error: firstError } = await supabase
                    .from('listing_media')
                    .select('media_id, media_type, storage_path, public_url, is_cover, sort_order')
                    .eq('listing_id', listingId)
                    .eq('media_type', 'image')
                    .order('sort_order', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (firstError) throw firstError;
                return firstImage;
            }

            return data;
        },

        /**
         * Save media metadata for a listing
         * @param {string} listingId - Listing ID
         * @param {Array} files - Array of file objects with storage_path, media_type, public_url
         * @returns {Promise<Array>} Saved media records
         */
        saveMediaMetadata: async function(listingId, files) {
            if (!files || files.length === 0) return [];

            const records = [];
            let coverAssigned = false;

            files.forEach((file, index) => {
                const isCover = !coverAssigned && file.media_type === 'image';
                if (isCover) coverAssigned = true;

                records.push({
                    listing_id: listingId,
                    storage_path: file.storage_path,
                    public_url: file.public_url || null,
                    media_type: file.media_type || 'image',
                    sort_order: index + 1,
                    is_cover: isCover
                });
            });

            const { data, error } = await supabase
                .from('listing_media')
                .insert(records)
                .select();

            if (error) throw error;
            return data || [];
        },

        /**
         * Delete all media for a listing
         * @param {string} listingId - Listing ID
         * @param {boolean} deleteFromStorage - Whether to delete from storage as well
         * @returns {Promise<string[]>} Deleted storage paths
         */
        deleteListingMedia: async function(listingId, deleteFromStorage = true) {
            // Get existing media paths first
            const { data: existing, error: fetchError } = await supabase
                .from('listing_media')
                .select('storage_path')
                .eq('listing_id', listingId);

            if (fetchError) throw fetchError;

            const paths = existing ? existing.map(m => m.storage_path) : [];

            // Delete from database
            const { error: deleteError } = await supabase
                .from('listing_media')
                .delete()
                .eq('listing_id', listingId);

            if (deleteError) throw deleteError;

            // Delete from storage if requested
            if (deleteFromStorage && paths.length > 0) {
                try {
                    await window.Biome.Storage.delete(paths);
                } catch (e) {
                    console.warn('[MediaService] Failed to delete from storage:', e);
                }
            }

            return paths;
        },

        /**
         * Set a specific image as the cover image
         * @param {string} listingId - Listing ID
         * @param {string} mediaId - Media ID to set as cover
         * @returns {Promise<void>}
         */
        setCoverImage: async function(listingId, mediaId) {
            // First, unset all covers
            const { error: unsetError } = await supabase
                .from('listing_media')
                .update({ is_cover: false })
                .eq('listing_id', listingId);

            if (unsetError) throw unsetError;

            // Set the selected media as cover
            const { error: setError } = await supabase
                .from('listing_media')
                .update({ is_cover: true })
                .eq('media_id', mediaId)
                .eq('listing_id', listingId);

            if (setError) throw setError;
        },

        /**
         * Get the storage path from a public URL
         * @param {string} url - Public URL
         * @returns {string|null} Storage path or null
         */
        getPathFromUrl: function(url) {
            if (!url) return null;
            try {
                const urlObj = new URL(url);
                const path = urlObj.pathname;
                const match = path.match(/\/storage\/v1\/object\/public\/listing-media\/(.+)/);
                return match ? match[1] : null;
            } catch (e) {
                return null;
            }
        }
    };

    window.Biome = window.Biome || {};
    window.Biome.Services = window.Biome.Services || {};
    window.Biome.Services.Media = MediaService;

    console.log('[MediaService] Initialized successfully.');
})();