/*
============================================================
BIOME V2 - Navbar Component
Editorial navigation with authentication state
============================================================
*/

(function () {
    'use strict';

    // Prevent multiple initialization
    if (window.Biome?.Components?.Navbar) {
        console.warn('[Navbar] Already initialized, skipping.');
        return;
    }

    const Navbar = {

        /**
         * Initialize the navbar
         *
         * @param {Object} options - Navbar options
         * @param {string} options.containerId - Container element ID
         * @param {string} options.activeLink - Active navigation link
         *
         * @returns {Promise<void>}
         */
        init: async function (options = {}) {
            const {
                containerId = 'navbarContainer',
                activeLink = 'home'
            } = options;

            const container = document.getElementById(containerId);

            if (!container) {
                console.warn('[Navbar] Container not found:', containerId);
                return;
            }

            // Build navbar only if container is empty
            if (container.children.length === 0) {
                this._renderNavbar(container, activeLink);
            }

            // Update authentication-dependent controls
            await this._updateAuth(container);

            // Initialise mobile navigation
            this._setupMobileToggle(container);

            console.log('[Navbar] Initialized successfully.');
        },

        /**
         * Render navbar HTML
         *
         * @param {HTMLElement} container
         * @param {string} activeLink
         */
        _renderNavbar: function (container, activeLink) {
            /*
             * Navigation identifiers:
             *
             * home       → Browse
             * categories → Categories
             * hosts      → For hosts
             * about      → About
             */

            const activeClass = (link) => {
                return link === activeLink ? 'active' : '';
            };

            container.innerHTML = `
                <nav class="navbar" id="navbar" aria-label="Main navigation">
                    <div class="nav-container">

                        <!-- =================================================
                             BIOME BRAND
                             ================================================= -->

                        <a href="index.html" class="logo" aria-label="Biome Home">
                            <div class="logo-circle" aria-hidden="true">B</div>
                            <h2>Biome</h2>
                        </a>

                        <!-- =================================================
                             DESKTOP NAVIGATION
                             ================================================= -->

                        <ul class="nav-links" id="navLinks" role="list">
                            <li>
                                <a href="property-listings.html" class="nav-link ${activeClass('home')}">
                                    Browse
                                </a>
                            </li>

                            <li>
                                <a href="index.html#categories" class="nav-link ${activeClass('categories')}">
                                    Categories
                                </a>
                            </li>

                            <li>
                                <a href="index.html#hosts" class="nav-link ${activeClass('hosts')}">
                                    For hosts
                                </a>
                            </li>

                            <li>
                                <a href="index.html#about" class="nav-link ${activeClass('about')}">
                                    About
                                </a>
                            </li>
                        </ul>

                        <!-- =================================================
                             AUTH / CTA BUTTONS
                             ================================================= -->

                        <div class="nav-buttons" id="navButtons">
                            <div class="nav-loading" aria-live="polite">Loading...</div>
                        </div>

                        <!-- =================================================
                             MOBILE MENU
                             ================================================= -->

                        <button class="hamburger" id="hamburgerBtn" type="button"
                                aria-label="Toggle navigation" aria-expanded="false"
                                aria-controls="navLinks">
                            <span></span>
                            <span></span>
                            <span></span>
                        </button>

                    </div>
                </nav>
            `;
        },

        /**
         * Update authentication state
         *
         * Unauthenticated:
         *     Open the app  → sign-in.html
         *     Find a space  → property-listings.html
         *
         * Authenticated:
         *     Open the app  → account dashboard
         *     Find a space  → property-listings.html
         *
         * @param {HTMLElement} container
         */
        _updateAuth: async function (container) {
            const navButtons = container.querySelector('#navButtons');

            if (!navButtons) {
                return;
            }

            try {
                // Retrieve current authenticated user
                const user = await window.Biome.Auth.getCurrentUser();

                /*
                 * ---------------------------------------------------------
                 * USER IS NOT AUTHENTICATED
                 * ---------------------------------------------------------
                 */
                if (!user) {
                    navButtons.innerHTML = `
                        <a href="sign-in.html" class="btn btn-outline nav-app-btn">
                            Open the app
                        </a>
                        <a href="property-listings.html" class="btn btn-primary nav-search-btn">
                            Find a space
                        </a>
                    `;
                    return;
                }

                /*
                 * ---------------------------------------------------------
                 * USER IS AUTHENTICATED
                 * ---------------------------------------------------------
                 */
                const profile = await window.Biome.Auth.getCurrentProfile();
                const accountType = profile?.account_type || 'buyer';

                /*
                 * Dashboard destinations by account type
                 */
                const dashboardMap = {
                    buyer: 'buyer-dashboard.html',
                    seller: 'seller-dashboard.html',
                    admin: 'admin-dashboard.html'
                };

                const dashboardUrl = dashboardMap[accountType] || dashboardMap.buyer;

                /*
                 * Authenticated navigation - same visual buttons,
                 * but "Open the app" goes to the user's dashboard
                 */
                navButtons.innerHTML = `
                    <a href="${dashboardUrl}" class="btn btn-outline nav-app-btn">
                        Open the app
                    </a>
                    <a href="property-listings.html" class="btn btn-primary nav-search-btn">
                        Find a space
                    </a>
                `;

            } catch (error) {
                console.error('[Navbar] Auth update error:', error);

                /*
                 * If authentication cannot be determined,
                 * fail gracefully to the public navigation.
                 */
                navButtons.innerHTML = `
                    <a href="sign-in.html" class="btn btn-outline nav-app-btn">
                        Open the app
                    </a>
                    <a href="property-listings.html" class="btn btn-primary nav-search-btn">
                        Find a space
                    </a>
                `;
            }
        },

        /**
         * Set up mobile hamburger navigation
         *
         * @param {HTMLElement} container
         */
        _setupMobileToggle: function (container) {
            const hamburger = container.querySelector('#hamburgerBtn');
            const navLinks = container.querySelector('#navLinks');

            if (!hamburger || !navLinks) {
                return;
            }

            /*
             * Toggle mobile navigation
             */
            hamburger.addEventListener('click', function () {
                const isOpen = navLinks.classList.toggle('active');
                this.classList.toggle('active', isOpen);
                this.setAttribute('aria-expanded', String(isOpen));
            });

            /*
             * Close menu when navigation link is selected
             */
            navLinks.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    hamburger.classList.remove('active');
                    navLinks.classList.remove('active');
                    hamburger.setAttribute('aria-expanded', 'false');
                });
            });

            /*
             * Close menu when clicking outside navbar
             */
            document.addEventListener('click', (event) => {
                if (window.innerWidth > 768) {
                    return;
                }

                const clickedInside = container.contains(event.target);
                const menuIsOpen = navLinks.classList.contains('active');

                if (!clickedInside && menuIsOpen) {
                    hamburger.classList.remove('active');
                    navLinks.classList.remove('active');
                    hamburger.setAttribute('aria-expanded', 'false');
                }
            });
        },

        /**
         * Refresh authentication-dependent navbar controls.
         *
         * Useful after:
         * - Login
         * - Logout
         * - Account switching
         * - Profile changes
         */
        refresh: async function () {
            const container = document.getElementById('navbarContainer');

            if (!container) {
                return;
            }

            await this._updateAuth(container);
        }
    };

    // =========================================================
    // BIOME NAMESPACE
    // =========================================================

    window.Biome = window.Biome || {};
    window.Biome.Components = window.Biome.Components || {};
    window.Biome.Components.Navbar = Navbar;

    console.log('[Navbar] Component ready.');
})();
