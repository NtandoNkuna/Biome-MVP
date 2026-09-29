/* ============================================================
   BIOME V2 - Core UI
   Toast, Loading, Modal, Error, Empty State
   ============================================================ */

(function() {
    'use strict';

    // Prevent multiple initialization
    if (window.Biome?.UI) {
        console.warn('[UI] Already initialized, skipping.');
        return;
    }

    const UI = {
        // ============================================================
        // TOAST NOTIFICATIONS
        // ============================================================

        _toastContainer: null,

        _getToastContainer: function() {
            if (!this._toastContainer) {
                let container = document.querySelector('.biome-toast-container');
                if (!container) {
                    container = document.createElement('div');
                    container.className = 'biome-toast-container';
                    container.style.cssText = `
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
                    document.body.appendChild(container);
                }
                this._toastContainer = container;
            }
            return this._toastContainer;
        },

        /**
         * Show a toast notification
         * @param {string} message - Toast message
         * @param {string} type - 'success', 'error', 'warning', 'info'
         * @param {number} duration - Duration in milliseconds
         */
        showToast: function(message, type = 'success', duration = 4000) {
            const container = this._getToastContainer();

            const toast = document.createElement('div');
            toast.className = `biome-toast biome-toast-${type}`;
            
            const colors = {
                success: 'background: #10b981; color: white;',
                error: 'background: #ef4444; color: white;',
                warning: 'background: #f59e0b; color: #1f2937;',
                info: 'background: #0f172a; color: white;'
            };

            toast.style.cssText = `
                padding: 14px 20px;
                border-radius: 12px;
                font-weight: 500;
                font-size: 0.9rem;
                box-shadow: 0 10px 40px rgba(0,0,0,0.15);
                animation: biomeToastIn 0.3s ease;
                pointer-events: auto;
                ${colors[type] || colors.info}
            `;
            toast.textContent = message;

            container.appendChild(toast);

            // Auto-remove after duration
            setTimeout(() => {
                toast.style.animation = 'biomeToastOut 0.3s ease forwards';
                setTimeout(() => {
                    if (toast.parentNode) toast.remove();
                }, 300);
            }, duration);

            // Add animation keyframes if not already present
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
        },

        // ============================================================
        // LOADING
        // ============================================================

        _loadingOverlay: null,
        _loadingTimeout: null,

        _getLoadingOverlay: function() {
            if (!this._loadingOverlay) {
                const overlay = document.createElement('div');
                overlay.className = 'biome-loading-overlay';
                overlay.style.cssText = `
                    position: fixed;
                    inset: 0;
                    background: rgba(255,255,255,0.95);
                    display: none;
                    justify-content: center;
                    align-items: center;
                    z-index: 99998;
                    flex-direction: column;
                    gap: 20px;
                `;
                overlay.innerHTML = `
                    <div class="biome-spinner" style="
                        width: 48px;
                        height: 48px;
                        border: 4px solid #e5e7eb;
                        border-top-color: #166534;
                        border-radius: 50%;
                        animation: biomeSpin 0.8s linear infinite;
                    "></div>
                    <p style="color: #6b7280; font-weight: 500;" id="biome-loading-text">Loading...</p>
                `;
                document.body.appendChild(overlay);

                // Add spinner animation
                if (!document.getElementById('biome-spinner-styles')) {
                    const style = document.createElement('style');
                    style.id = 'biome-spinner-styles';
                    style.textContent = `
                        @keyframes biomeSpin {
                            to { transform: rotate(360deg); }
                        }
                    `;
                    document.head.appendChild(style);
                }

                this._loadingOverlay = overlay;
            }
            return this._loadingOverlay;
        },

        /**
         * Show loading overlay
         * @param {string} message - Loading message
         */
        showLoading: function(message = 'Loading...') {
            const overlay = this._getLoadingOverlay();
            overlay.style.display = 'flex';
            const textEl = overlay.querySelector('#biome-loading-text');
            if (textEl) textEl.textContent = message;

            // Clear any pending hide timeout
            if (this._loadingTimeout) {
                clearTimeout(this._loadingTimeout);
                this._loadingTimeout = null;
            }
        },

        /**
         * Hide loading overlay
         */
        hideLoading: function() {
            const overlay = this._getLoadingOverlay();
            // Small delay to avoid flicker
            this._loadingTimeout = setTimeout(() => {
                overlay.style.display = 'none';
                this._loadingTimeout = null;
            }, 200);
        },

        // ============================================================
        // PAGE LOADING (Full page overlay)
        // ============================================================

        _pageLoader: null,

        _getPageLoader: function() {
            if (!this._pageLoader) {
                const loader = document.createElement('div');
                loader.className = 'biome-page-loader';
                loader.style.cssText = `
                    position: fixed;
                    inset: 0;
                    background: rgba(255,255,255,0.98);
                    display: none;
                    justify-content: center;
                    align-items: center;
                    z-index: 999999;
                    flex-direction: column;
                    gap: 20px;
                `;
                loader.innerHTML = `
                    <div style="
                        width: 70px;
                        height: 70px;
                        border-radius: 50%;
                        border: 7px solid #e5e7eb;
                        border-top-color: #166534;
                        animation: biomeSpin 1s linear infinite;
                    "></div>
                    <p style="color: #6b7280; font-weight: 600; font-size: 1rem;">Loading Biome...</p>
                `;
                document.body.appendChild(loader);

                this._pageLoader = loader;
            }
            return this._pageLoader;
        },

        /**
         * Show full page loader
         */
        showPageLoader: function() {
            const loader = this._getPageLoader();
            loader.style.display = 'flex';
        },

        /**
         * Hide full page loader
         */
        hidePageLoader: function() {
            const loader = this._getPageLoader();
            loader.style.display = 'none';
        },

        // ============================================================
        // MODAL
        // ============================================================

        _modalOverlay: null,

        _getModal: function() {
            if (!this._modalOverlay) {
                const modal = document.createElement('div');
                modal.className = 'biome-modal-overlay';
                modal.style.cssText = `
                    position: fixed;
                    inset: 0;
                    background: rgba(15,23,42,0.6);
                    backdrop-filter: blur(6px);
                    display: none;
                    justify-content: center;
                    align-items: center;
                    z-index: 100000;
                    padding: 20px;
                `;
                modal.innerHTML = `
                    <div class="biome-modal" style="
                        background: white;
                        border-radius: 20px;
                        max-width: 720px;
                        width: 100%;
                        max-height: 90vh;
                        display: flex;
                        flex-direction: column;
                        box-shadow: 0 25px 60px rgba(0,0,0,0.2);
                    ">
                        <div class="biome-modal-header" style="
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 20px 28px;
                            border-bottom: 1px solid #f1f5f9;
                        ">
                            <h2 id="biome-modal-title" style="
                                font-size: 1.3rem;
                                font-weight: 700;
                                color: #0f172a;
                                margin: 0;
                            ">Modal</h2>
                            <button id="biome-modal-close" style="
                                background: none;
                                border: none;
                                font-size: 1.8rem;
                                line-height: 1;
                                color: #94a3b8;
                                cursor: pointer;
                                padding: 0 8px;
                                transition: color 0.2s;
                            ">&times;</button>
                        </div>
                        <div id="biome-modal-body" style="
                            padding: 28px;
                            overflow-y: auto;
                            flex: 1;
                        "></div>
                        <div class="biome-modal-footer" style="
                            padding: 16px 28px 24px;
                            border-top: 1px solid #f1f5f9;
                            display: flex;
                            justify-content: flex-end;
                            gap: 12px;
                        "></div>
                    </div>
                `;
                document.body.appendChild(modal);

                // Close on background click
                modal.addEventListener('click', function(e) {
                    if (e.target === modal) {
                        UI.closeModal();
                    }
                });

                // Close button
                const closeBtn = modal.querySelector('#biome-modal-close');
                if (closeBtn) {
                    closeBtn.addEventListener('click', UI.closeModal);
                }

                this._modalOverlay = modal;
            }
            return this._modalOverlay;
        },

        /**
         * Open a modal
         * @param {string|Object} content - Modal content (HTML string or config object)
         * @param {Object} config - Modal configuration
         */
        openModal: function(content, config = {}) {
            const modal = this._getModal();
            const body = modal.querySelector('#biome-modal-body');
            const title = modal.querySelector('#biome-modal-title');
            const footer = modal.querySelector('.biome-modal-footer');

            // Set title
            if (title) {
                title.textContent = config.title || 'Modal';
            }

            // Set content
            if (body) {
                if (typeof content === 'string') {
                    body.innerHTML = content;
                } else if (content && typeof content === 'object') {
                    body.innerHTML = '';
                    body.appendChild(content);
                } else {
                    body.innerHTML = '';
                }
            }

            // Set footer buttons
            if (footer) {
                footer.innerHTML = '';
                if (config.footerButtons && Array.isArray(config.footerButtons)) {
                    config.footerButtons.forEach(btn => {
                        const button = document.createElement('button');
                        button.className = btn.class || 'btn btn-outline';
                        button.textContent = btn.label || 'Button';
                        if (btn.onClick) {
                            button.addEventListener('click', btn.onClick);
                        }
                        footer.appendChild(button);
                    });
                }
            }

            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        },

        /**
         * Close the modal
         */
        closeModal: function() {
            const modal = this._getModal();
            modal.style.display = 'none';
            document.body.style.overflow = '';
        },

        // ============================================================
        // ERROR STATE
        // ============================================================

        /**
         * Show an error state in a container
         * @param {HTMLElement} container - Container element
         * @param {string} message - Error message
         * @param {string} icon - Error icon (default: ⚠️)
         */
        showError: function(container, message = 'Something went wrong. Please try again.', icon = '⚠️') {
            if (!container) return;
            container.innerHTML = `
                <div class="biome-error-state" style="
                    text-align: center;
                    padding: 40px 20px;
                    color: #6b7280;
                ">
                    <div style="font-size: 3rem; margin-bottom: 16px;">${icon}</div>
                    <h3 style="color: #1f2937; margin-bottom: 8px;">Error</h3>
                    <p>${message}</p>
                    <button class="btn btn-outline" style="margin-top: 16px;" onclick="location.reload()">
                        Retry
                    </button>
                </div>
            `;
        },

        /**
         * Show an empty state in a container
         * @param {HTMLElement} container - Container element
         * @param {string} message - Empty state message
         * @param {string} title - Empty state title
         * @param {string} icon - Empty state icon
         */
        showEmpty: function(container, message = 'Nothing to display.', title = 'No items found', icon = '📭') {
            if (!container) return;
            container.innerHTML = `
                <div class="biome-empty-state" style="
                    text-align: center;
                    padding: 60px 20px;
                    color: #6b7280;
                ">
                    <div style="font-size: 4rem; margin-bottom: 16px; opacity: 0.5;">${icon}</div>
                    <h3 style="color: #1f2937; margin-bottom: 8px;">${title}</h3>
                    <p>${message}</p>
                </div>
            `;
        }
    };

    // Initialize namespace
    window.Biome = window.Biome || {};
    window.Biome.UI = UI;

    console.log('[UI] Initialized successfully.');
})();