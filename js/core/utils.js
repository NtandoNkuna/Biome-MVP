/* ============================================================
   BIOME V2 - Core Utilities
   Pure helper functions, zero DOM, zero Supabase
   ============================================================ */

(function() {
    'use strict';

    // Prevent multiple initialization
    if (window.Biome?.Utils) {
        console.warn('[Utils] Already initialized, skipping.');
        return;
    }

    const Utils = {
        /**
         * Format a price in ZAR currency
         * @param {number} price - The price to format
         * @param {boolean} showFraction - Whether to show decimal places
         * @returns {string} Formatted price
         */
        formatCurrency: function(price, showFraction = false) {
            if (price === null || price === undefined || isNaN(price)) {
                return 'R 0';
            }
            return new Intl.NumberFormat('en-ZA', {
                style: 'currency',
                currency: 'ZAR',
                minimumFractionDigits: showFraction ? 2 : 0,
                maximumFractionDigits: showFraction ? 2 : 0
            }).format(price);
        },

        /**
         * Format a date string to local date format
         * @param {string} dateString - ISO date string
         * @param {Object} options - Intl.DateTimeFormat options
         * @returns {string} Formatted date
         */
        formatDate: function(dateString, options = {}) {
            if (!dateString) return '—';
            try {
                const date = new Date(dateString);
                if (isNaN(date.getTime())) return '—';
                return date.toLocaleDateString('en-ZA', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    ...options
                });
            } catch (e) {
                return '—';
            }
        },

        /**
         * Format a date with time
         * @param {string} dateString - ISO date string
         * @returns {string} Formatted date and time
         */
        formatDateTime: function(dateString) {
            if (!dateString) return '—';
            try {
                const date = new Date(dateString);
                if (isNaN(date.getTime())) return '—';
                return date.toLocaleDateString('en-ZA', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                return '—';
            }
        },

        /**
         * Validate a UUID string
         * @param {string} uuid - The UUID to validate
         * @returns {boolean} True if valid UUID
         */
        validateUUID: function(uuid) {
            if (!uuid || typeof uuid !== 'string') return false;
            const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            return regex.test(uuid);
        },

        /**
         * Sanitize HTML to prevent XSS
         * @param {string} html - The HTML string to sanitize
         * @returns {string} Sanitized HTML
         */
        sanitizeHTML: function(html) {
            if (!html) return '';
            const div = document.createElement('div');
            div.textContent = html;
            return div.innerHTML;
        },

        /**
         * Truncate text to a maximum length
         * @param {string} text - The text to truncate
         * @param {number} maxLength - Maximum length
         * @param {string} suffix - Suffix to add if truncated
         * @returns {string} Truncated text
         */
        truncateText: function(text, maxLength = 100, suffix = '...') {
            if (!text) return '';
            if (text.length <= maxLength) return text;
            return text.substring(0, maxLength).trim() + suffix;
        },

        /**
         * Debounce a function
         * @param {Function} fn - The function to debounce
         * @param {number} delay - Delay in milliseconds
         * @returns {Function} Debounced function
         */
        debounce: function(fn, delay = 300) {
            let timer = null;
            return function(...args) {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(this, args), delay);
            };
        },

        /**
         * Get a URL parameter by name
         * @param {string} name - Parameter name
         * @param {string} url - URL to parse (defaults to current)
         * @returns {string|null} Parameter value or null
         */
        getUrlParam: function(name, url = window.location.href) {
            try {
                const urlObj = new URL(url);
                return urlObj.searchParams.get(name);
            } catch (e) {
                return null;
            }
        },

        /**
         * Get all URL parameters as an object
         * @param {string} url - URL to parse (defaults to current)
         * @returns {Object} Parameters object
         */
        getUrlParams: function(url = window.location.href) {
            try {
                const urlObj = new URL(url);
                const params = {};
                for (const [key, value] of urlObj.searchParams.entries()) {
                    params[key] = value;
                }
                return params;
            } catch (e) {
                return {};
            }
        },

        /**
         * Check if a value is empty (null, undefined, empty string, empty array, empty object)
         * @param {*} value - The value to check
         * @returns {boolean} True if empty
         */
        isEmpty: function(value) {
            if (value === null || value === undefined) return true;
            if (typeof value === 'string') return value.trim() === '';
            if (Array.isArray(value)) return value.length === 0;
            if (typeof value === 'object') return Object.keys(value).length === 0;
            return false;
        },

        /**
         * Generate a random ID
         * @param {number} length - Length of the ID
         * @returns {string} Random ID
         */
        generateId: function(length = 8) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let result = '';
            for (let i = 0; i < length; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        },

        /**
         * Sleep for a specified duration
         * @param {number} ms - Milliseconds to sleep
         * @returns {Promise} Promise that resolves after the delay
         */
        sleep: function(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        /**
         * Get the display name from a profile object
         * Uses first_name and last_name from the actual schema
         * @param {Object} profile - Profile object
         * @returns {string} Display name
         */
        getDisplayName: function(profile) {
            if (!profile) return 'User';
            const firstName = profile.first_name || '';
            const lastName = profile.last_name || '';
            if (firstName && lastName) return `${firstName} ${lastName}`;
            if (firstName) return firstName;
            if (profile.company_name) return profile.company_name;
            return 'User';
        },

        /**
         * Get status display text
         * @param {string} status - Status value
         * @returns {string} Display status
         */
        getStatusDisplay: function(status) {
            const map = {
                'draft': 'Draft',
                'pending': 'Pending Review',
                'approved': 'Published',
                'rejected': 'Rejected'
            };
            return map[status] || status || 'Unknown';
        },

        /**
         * Get status CSS class
         * @param {string} status - Status value
         * @returns {string} CSS class
         */
        getStatusClass: function(status) {
            const map = {
                'draft': 'draft',
                'pending': 'pending',
                'approved': 'approved',
                'rejected': 'rejected'
            };
            return map[status] || status || '';
        },

        /**
         * Safe JSON parse with fallback
         * @param {string} json - JSON string
         * @param {*} fallback - Fallback value
         * @returns {*} Parsed value or fallback
         */
        safeJSONParse: function(json, fallback = null) {
            try {
                return JSON.parse(json);
            } catch (e) {
                return fallback;
            }
        },

        /**
         * Check if running in a browser environment
         * @returns {boolean} True if in browser
         */
        isBrowser: function() {
            return typeof window !== 'undefined' && typeof document !== 'undefined';
        },

        /**
         * Format a location string from address components
         * @param {Object} address - Address object with street, suburb, city, province
         * @returns {string} Formatted location
         */
        formatLocation: function(address) {
            if (!address) return '';
            const parts = [];
            if (address.street) parts.push(address.street);
            if (address.suburb) parts.push(address.suburb);
            if (address.city) parts.push(address.city);
            if (address.province) parts.push(address.province);
            return parts.join(', ');
        },

        /**
         * Generate a slug from a string
         * @param {string} text - Text to slugify
         * @returns {string} Slug
         */
        slugify: function(text) {
            if (!text) return '';
            return text
                .toLowerCase()
                .trim()
                .replace(/[^\w\s-]/g, '')
                .replace(/[\s_-]+/g, '-')
                .replace(/^-+|-+$/g, '');
        },

        /**
         * Pluralize a word based on count
         * @param {number} count - Count
         * @param {string} singular - Singular form
         * @param {string} plural - Plural form (optional)
         * @returns {string} Pluralized word
         */
        pluralize: function(count, singular, plural = null) {
            if (count === 1) return singular;
            return plural || singular + 's';
        }
    };

    // Initialize namespace
    window.Biome = window.Biome || {};
    window.Biome.Utils = Utils;

    console.log('[Utils] Initialized successfully.');
})();