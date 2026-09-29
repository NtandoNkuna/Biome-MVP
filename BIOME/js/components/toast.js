/* ============================================================
   BIOME V2 - Toast Component
   Standalone toast notifications
   ============================================================ */

(function() {
    'use strict';

    // Prevent multiple initialization
    if (window.Biome?.Components?.Toast) {
        console.warn('[Toast] Already initialized, skipping.');
        return;
    }

    const Toast = {

        _container: null,
        _defaultDuration: 4000,

        /**
         * Initialize the toast system
         * @param {Object} options - Toast options
         * @param {number} options.duration - Default duration in milliseconds
         */
        init: function(options = {}) {
            this._defaultDuration = options.duration || 4000;

            if (!this._container) {
                this._container = document.createElement('div');
                this._container.className = 'biome-toast-container';
                this._container.style.cssText = `
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    z-index: 99999;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    max-width: 380px;
                    width: 100%;
                    pointer-events: none;
                `;
                document.body.appendChild(this._container);

                // Add styles if not present
                if (!document.getElementById('biome-toast-styles')) {
                    const style = document.createElement('style');
                    style.id = 'biome-toast-styles';
                    style.textContent = `
                        @keyframes biomeToastIn {
                            from { opacity: 0; transform: translateX(30px); }
                            to { opacity: 1; transform: translateX(0); }
                        }
                        @keyframes biomeToastOut {
                            from { opacity: 1; transform: translateX(0); }
                            to { opacity: 0; transform: translateX(30px); }
                        }
                    `;
                    document.head.appendChild(style);
                }
            }
        },

        /**
         * Show a toast notification
         * @param {string} message - Toast message
         * @param {string} type - 'success', 'error', 'warning', 'info'
         * @param {number} duration - Duration in milliseconds
         */
        show: function(message, type = 'success', duration = null) {
            this.init();

            const toast = document.createElement('div');
            toast.className = `biome-toast biome-toast-${type}`;
            const durationMs = duration || this._defaultDuration;

            const colors = {
                success: { bg: '#10b981', text: '#ffffff' },
                error: { bg: '#ef4444', text: '#ffffff' },
                warning: { bg: '#f59e0b', text: '#1f2937' },
                info: { bg: '#0f172a', text: '#ffffff' }
            };

            const color = colors[type] || colors.info;

            toast.style.cssText = `
                padding: 14px 20px;
                border-radius: 12px;
                color: ${color.text};
                font-weight: 500;
                font-size: 0.9rem;
                box-shadow: 0 10px 40px rgba(0,0,0,0.15);
                animation: biomeToastIn 0.3s ease;
                pointer-events: auto;
                background: ${color.bg};
            `;
            toast.textContent = message;

            this._container.appendChild(toast);

            // Auto-remove after duration
            setTimeout(() => {
                toast.style.animation = 'biomeToastOut 0.3s ease forwards';
                setTimeout(() => {
                    if (toast.parentNode) toast.remove();
                }, 300);
            }, durationMs);
        },

        /**
         * Show a success toast
         * @param {string} message - Toast message
         * @param {number} duration - Duration in milliseconds
         */
        success: function(message, duration = null) {
            this.show(message, 'success', duration);
        },

        /**
         * Show an error toast
         * @param {string} message - Toast message
         * @param {number} duration - Duration in milliseconds
         */
        error: function(message, duration = null) {
            this.show(message, 'error', duration);
        },

        /**
         * Show a warning toast
         * @param {string} message - Toast message
         * @param {number} duration - Duration in milliseconds
         */
        warning: function(message, duration = null) {
            this.show(message, 'warning', duration);
        },

        /**
         * Show an info toast
         * @param {string} message - Toast message
         * @param {number} duration - Duration in milliseconds
         */
        info: function(message, duration = null) {
            this.show(message, 'info', duration);
        },

        /**
         * Clear all toasts
         */
        clear: function() {
            if (this._container) {
                this._container.innerHTML = '';
            }
        }
    };

    // Initialize namespace
    window.Biome = window.Biome || {};
    window.Biome.Components = window.Biome.Components || {};
    window.Biome.Components.Toast = Toast;

    console.log('[Toast] Component ready.');
})();