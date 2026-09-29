/* ============================================================
   BIOME V2 - Core Storage
   Centralized storage operations for listing-media bucket
   ============================================================ */

(function() {
    'use strict';

    // Prevent multiple initialization
    if (window.Biome?.Storage) {
        console.warn('[Storage] Already initialized, skipping.');
        return;
    }

    // Requires Supabase to be initialized first
    if (!window.Biome?.Core?.supabase) {
        throw new Error('[Storage] Supabase not initialized. Load core/supabase.js first.');
    }

    const supabase = window.Biome.Core.supabase;
    const BUCKET_NAME = 'listing-media';

    const Storage = {

        /**
         * Get the bucket name
         * @returns {string} Bucket name
         */
        getBucketName: function() {
            return BUCKET_NAME;
        },

        /**
         * Get a public URL for a storage path
         * @param {string} path - Storage path
         * @returns {string|null} Public URL or null
         */
        getPublicUrl: function(path) {
            if (!path) return null;
            try {
                const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
                return data?.publicUrl || null;
            } catch (e) {
                console.error('[Storage] Public URL error:', e);
                return null;
            }
        },

        /**
         * Get a placeholder image URL
         * Uses a data URI SVG placeholder
         * @returns {string} Placeholder image URL
         */
        getPlaceholderUrl: function() {
            return this._generatePlaceholderSVG();
        },

        /**
         * Generate a placeholder SVG as data URI
         * @returns {string} Data URI for placeholder image
         */
        _generatePlaceholderSVG: function() {
            const svg = `
                <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
                    <rect width="800" height="600" fill="#166534"/>
                    <rect x="100" y="80" width="600" height="440" rx="20" fill="#15803d"/>
                    <text x="400" y="280" font-family="Arial, sans-serif" font-size="64" fill="white" text-anchor="middle" dominant-baseline="central">
                        🏠
                    </text>
                    <text x="400" y="360" font-family="Arial, sans-serif" font-size="32" fill="#a0d4b0" text-anchor="middle">
                        Biome Property
                    </text>
                </svg>
            `;
            const encoded = encodeURIComponent(svg);
            return `data:image/svg+xml;charset=utf-8,${encoded}`;
        },

        /**
         * Get a safe image URL with fallback.
         *
         * Accepts absolute HTTP/HTTPS URLs, data URIs, and site-relative
         * paths ("assets/…", "./assets/…", "/assets/…", "images/…").
         * Rejects null, undefined, empty strings, and untrusted schemes
         * (javascript:, vbscript:, file:), substituting the SVG
         * placeholder in those cases.
         *
         * @param {string} url - Image URL or path
         * @returns {string} Safe URL with fallback
         */
        getSafeImageUrl: function(url) {
            if (!url || typeof url !== 'string') {
                return this.getPlaceholderUrl();
            }

            const trimmed = url.trim();
            if (!trimmed) return this.getPlaceholderUrl();

            // Absolute HTTP/HTTPS
            if (/^https?:\/\//i.test(trimmed)) return trimmed;

            // Data URIs (SVG placeholder, inline images)
            if (/^data:image\//i.test(trimmed)) return trimmed;

            // Site-relative paths — "./", "../", "/", or bare directories
            if (/^\.{0,2}\//.test(trimmed)) return trimmed;
            if (/^[a-z0-9_-]+\//i.test(trimmed)) return trimmed;

            // Anything else is untrusted — fall back.
            return this.getPlaceholderUrl();
        },

        /**
         * Upload a file to storage
         * @param {string} path - Storage path
         * @param {File} file - File to upload
         * @param {Object} options - Upload options
         * @returns {Promise<Object>} Upload result
         */
        upload: async function(path, file, options = {}) {
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(path, file, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: file.type,
                    ...options
                });

            if (error) throw error;
            return data;
        },

        /**
         * Delete a file from storage
         * @param {string|string[]} paths - Storage path(s) to delete
         * @returns {Promise<Object>} Delete result
         */
        delete: async function(paths) {
            const pathsArray = Array.isArray(paths) ? paths : [paths];
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .remove(pathsArray);

            if (error) throw error;
            return data;
        },

        /**
         * List files in a folder
         * @param {string} folder - Folder path
         * @param {Object} options - List options
         * @returns {Promise<Array>} List of files
         */
        list: async function(folder = '', options = {}) {
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .list(folder, options);

            if (error) throw error;
            return data || [];
        },

        /**
         * Check if the bucket is accessible
         * @returns {Promise<boolean>} True if accessible
         */
        checkBucket: async function() {
            try {
                await supabase.storage.from(BUCKET_NAME).list('', { limit: 1 });
                return true;
            } catch (e) {
                console.warn('[Storage] Bucket check failed:', e.message);
                return false;
            }
        },

        /**
         * Generate a unique storage path for a listing
         * @param {string} listingId - Listing ID
         * @param {string} filename - Original filename
         * @param {string} type - Media type ('image' or 'video')
         * @returns {string} Storage path
         */
        generatePath: function(listingId, filename, type = 'image') {
            const ext = filename.split('.').pop() || '';
            const uuid = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2);
            return `${listingId}/${type}-${uuid}.${ext}`;
        },

        /**
         * Upload multiple files for a listing
         * @param {string} listingId - Listing ID
         * @param {File[]} files - Files to upload
         * @param {string} type - Media type ('image' or 'video')
         * @returns {Promise<Array>} Array of upload results
         */
        uploadMultiple: async function(listingId, files, type = 'image') {
            const results = [];
            const errors = [];

            for (const file of files) {
                try {
                    const path = this.generatePath(listingId, file.name, type);
                    const result = await this.upload(path, file);
                    const publicUrl = this.getPublicUrl(path);
                    results.push({
                        storage_path: path,
                        media_type: type,
                        publicUrl: publicUrl,
                        ...result
                    });
                } catch (e) {
                    console.error('[Storage] Upload failed for file:', file.name, e);
                    errors.push({ file: file.name, error: e.message });
                }
            }

            if (errors.length > 0) {
                const error = new Error(`${errors.length} file(s) failed to upload.`);
                error.results = results;
                error.errors = errors;
                throw error;
            }

            return results;
        },

        /**
         * Delete all media for a listing
         * @param {string} listingId - Listing ID
         * @param {string[]} paths - Paths to delete
         * @returns {Promise<void>}
         */
        deleteListingMedia: async function(listingId, paths) {
            if (!paths || paths.length === 0) return;
            await this.delete(paths);
        }
    };

    // Initialize namespace
    window.Biome = window.Biome || {};
    window.Biome.Storage = Storage;

    console.log('[Storage] Initialized successfully.');
})();