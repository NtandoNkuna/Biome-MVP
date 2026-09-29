/* ============================================================
   BIOME V2 - Core Authentication
   Updated for actual schema
   ============================================================ */

(function() {
    'use strict';

    if (window.Biome?.Auth) {
        console.warn('[Auth] Already initialized, skipping.');
        return;
    }

    if (!window.Biome?.Core?.supabase) {
        throw new Error('[Auth] Supabase not initialized.');
    }

    const supabase = window.Biome.Core.supabase;

    const Auth = {
        getSession: async function() {
            try {
                const { data, error } = await supabase.auth.getSession();
                if (error) throw error;
                return data.session;
            } catch (e) {
                console.error('[Auth] Session error:', e);
                return null;
            }
        },

        getCurrentUser: async function() {
            try {
                const { data, error } = await supabase.auth.getUser();
                if (error) throw error;
                return data.user;
            } catch (e) {
                console.error('[Auth] User error:', e);
                return null;
            }
        },

        getCurrentProfile: async function() {
            try {
                const user = await this.getCurrentUser();
                if (!user) return null;

                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('profile_id', user.id)  // ✅ profile_id matches auth.users.id
                    .single();

                if (error) {
                    console.error('[Auth] Profile error:', error);
                    return null;
                }
                return data;
            } catch (e) {
                console.error('[Auth] Profile error:', e);
                return null;
            }
        },

        login: async function(email, password) {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password: password
            });
            if (error) throw error;
            return data;
        },

        // ============================================================
        // NEW: Registration
        // ============================================================

        /**
         * Register a new user.
         *
         * Mirrors login() — throws on error, returns the Supabase
         * response. The caller must inspect `data.session`:
         *   - If non-null → email confirmation is disabled and the
         *     user is signed in immediately.
         *   - If null     → confirmation is required; show a
         *     "check your email" message instead of redirecting.
         *
         * @param {string} email
         * @param {string} password
         * @param {Object} [metadata] - Stored on auth.users.user_metadata.
         *                              The profiles row is expected to be
         *                              created by a DB trigger on
         *                              auth.users insert.
         */
        signup: async function(email, password, metadata = {}) {
            const { data, error } = await supabase.auth.signUp({
                email: email.trim().toLowerCase(),
                password: password,
                options: { data: metadata }
            });
            if (error) throw error;
            return data;
        },

        // ============================================================
        // NEW: Google OAuth
        // ============================================================

        /**
         * Start the Google OAuth flow.
         *
         * Redirects the browser to Google. On return, Supabase
         * appends `?code=...` to the URL and swaps it for a session
         * on page load. Handle the landing with
         * handleOAuthCallback() at the top of any auth page's init.
         */
        signInWithGoogle: async function(redirectTo) {
            const target = redirectTo ||
                (window.location.origin + window.location.pathname);

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: target,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'select_account'
                    }
                }
            });
            if (error) throw error;
            return data;
        },

        /**
         * Detect and consume an OAuth callback landing.
         * Returns the session if one was established, else null.
         */
        handleOAuthCallback: async function() {
            const url = new URL(window.location.href);
            const hasCode = url.searchParams.has('code');
            const hasHash = /access_token|error_description/.test(url.hash);

            if (!hasCode && !hasHash) return this.getSession();

            for (let i = 0; i < 10; i++) {
                const session = await this.getSession();
                if (session) {
                    url.searchParams.delete('code');
                    url.hash = '';
                    window.history.replaceState(
                        {}, document.title, url.pathname + url.search
                    );
                    return session;
                }
                await new Promise(r => setTimeout(r, 100));
            }
            return null;
        },

        // ============================================================
        // Existing methods (unchanged)
        // ============================================================

        logout: async function() {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
        },

        requireAuth: async function(redirectUrl = 'sign-in.html') {
            const session = await this.getSession();
            if (!session) {
                window.location.href = redirectUrl;
                return false;
            }
            return true;
        },

        requireRole: async function(role, redirectUrl = 'index.html') {
            const profile = await this.getCurrentProfile();
            if (!profile || profile.account_type !== role) {
                window.location.href = redirectUrl;
                return false;
            }
            return true;
        },

        redirectUser: async function() {
            const profile = await this.getCurrentProfile();
            if (!profile) {
                window.location.href = 'index.html';
                return;
            }
            const map = {
                'buyer': 'buyer-dashboard.html',
                'seller': 'seller-dashboard.html',
                'admin': 'admin-dashboard.html'
            };
            window.location.href = map[profile.account_type] || 'index.html';
        },

        /**
         * Alias of redirectUser(), kept for compatibility with the
         * sign-in.js / sign-up.js controllers which call either name.
         */
        redirectAfterAuth: async function() {
            return this.redirectUser();
        },

        redirectIfAuthenticated: async function() {
            const session = await this.getSession();
            if (session) await this.redirectUser();
        },

        getDisplayName: async function() {
            const profile = await this.getCurrentProfile();
            if (!profile) return 'User';
            const firstName = profile.first_name || '';
            const lastName = profile.last_name || '';
            if (firstName && lastName) return `${firstName} ${lastName}`;
            if (firstName) return firstName;
            if (profile.company_name) return profile.company_name;
            return 'User';
        },

        getAccountType: async function() {
            const profile = await this.getCurrentProfile();
            return profile ? profile.account_type : null;
        },

        onAuthStateChange: function(callback) {
            return supabase.auth.onAuthStateChange((event, session) => {
                if (typeof callback === 'function') callback(event, session);
            });
        }
    };

    window.Biome = window.Biome || {};
    window.Biome.Auth = Auth;

    console.log('[Auth] Initialized successfully.');
})();   