/* ============================================================
   BIOME V2 - Sign-In page controller
   Matches the real sign-in.html markup.
   ============================================================ */

(function() {
    'use strict';

    if (window._biomeSignInInitialized) {
        console.warn('[SignIn] Already initialized, skipping.');
        return;
    }
    window._biomeSignInInitialized = true;

    console.log('[SignIn] Initializing...');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    async function init() {
        try {
            // If Google just redirected back with a session, bounce out.
            const session = await window.Biome.Auth.handleOAuthCallback();
            if (session) {
                await redirectToDashboard();
                return;
            }

            // Existing email/password session from a previous visit.
            const existing = await window.Biome.Auth.getSession();
            if (existing) {
                await redirectToDashboard();
                return;
            }

            wireForm();
            wireForgotPassword();
            wireSocial();

            console.log('[SignIn] Ready.');
        } catch (e) {
            console.error('[SignIn] Initialization error:', e);
            setStatus('Something went wrong loading this page.', 'error');
        }
    }

    /**
     * Redirect to the caller's dashboard. Polls for the profile row
     * rather than waiting a fixed interval — the profiles row is
     * created by a DB trigger relative to the auth.users insert, so
     * a single immediate lookup can race under load.
     *
     * Mirrors the pattern in sign-up.js's waitForProfileThenRedirect.
     * Delegates the final navigation to Auth.redirectUser(), which
     * already handles the "profile still missing" fallback to index.html.
     */
    async function redirectToDashboard(maxAttempts = 10, intervalMs = 100) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const profile = await window.Biome.Auth.getCurrentProfile();
            if (profile) break;
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        await window.Biome.Auth.redirectUser();
    }

    // ---------------------------------------------------------
    // Email / password form
    // ---------------------------------------------------------

    function wireForm() {
        const form = document.getElementById('signin-form');
        if (!form) {
            console.warn('[SignIn] #signin-form not found in markup.');
            return;
        }

        // Restore remembered email
        const remembered = localStorage.getItem('biome.rememberedEmail');
        const emailEl    = document.getElementById('signin-email');
        const rememberEl = document.getElementById('remember-me');
        if (remembered && emailEl) {
            emailEl.value = remembered;
            if (rememberEl) rememberEl.checked = true;
        }

        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            setStatus('', '');

            const passwordEl = document.getElementById('signin-password');
            if (!emailEl || !passwordEl) {
                setStatus('Form is misconfigured.', 'error');
                return;
            }

            const email    = emailEl.value.trim();
            const password = passwordEl.value;

            if (!email || !password) {
                setStatus('Please enter your email and password.', 'error');
                return;
            }

            const btn = document.getElementById('signin-button');
            if (btn) btn.disabled = true;

            try {
                await window.Biome.Auth.login(email, password);

                // Persist "remember me"
                if (rememberEl && rememberEl.checked) {
                    localStorage.setItem('biome.rememberedEmail', email);
                } else {
                    localStorage.removeItem('biome.rememberedEmail');
                }

                setStatus('Signed in. Redirecting…', 'success');

                // Bounded poll for the profiles row, then redirect.
                await redirectToDashboard();
            } catch (err) {
                console.error('[SignIn] Login error:', err);
                const msg   = (err && err.message) ? err.message : 'Sign-in failed.';
                const lower = msg.toLowerCase();

                if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
                    setStatus('Incorrect email or password. Please try again.', 'error');
                } else if (lower.includes('email not confirmed')) {
                    setStatus('Please confirm your email before signing in.', 'error');
                } else {
                    setStatus(msg, 'error');
                }
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    }

    // ---------------------------------------------------------
    // Forgot password (not implemented — leaves link inert)
    // ---------------------------------------------------------

    function wireForgotPassword() {
        const link = document.getElementById('forgot-password');
        if (!link) return;

        link.addEventListener('click', function(e) {
            e.preventDefault();
            setStatus('Password reset is not available yet.', 'info');
        });
    }

    // ---------------------------------------------------------
    // Social buttons (Google is the first .btn-social)
    // ---------------------------------------------------------

    function wireSocial() {
        const buttons = document.querySelectorAll('.btn-social');
        if (!buttons.length) return;

        // First .btn-social is "Continue with Google" per the markup.
        const googleBtn = buttons[0];
        const appleBtn  = buttons[1];

        if (googleBtn) {
            googleBtn.addEventListener('click', async function() {
                setStatus('Redirecting to Google…', 'info');
                googleBtn.disabled = true;
                try {
                    await window.Biome.Auth.signInWithGoogle();
                } catch (err) {
                    console.error('[SignIn] Google OAuth error:', err);
                    setStatus(err?.message || 'Could not reach Google.', 'error');
                    googleBtn.disabled = false;
                }
            });
        }

        if (appleBtn) {
            appleBtn.addEventListener('click', function() {
                setStatus('Apple sign-in is not available yet.', 'info');
            });
        }
    }

    // ---------------------------------------------------------
    // Status message helper (matches .status-message in auth.css)
    // ---------------------------------------------------------

    function setStatus(message, type) {
        const el = document.getElementById('status-message');
        if (!el) return;
        el.className = 'status-message';
        el.textContent = '';
        if (!message) return;
        el.classList.add(type || 'info');
        el.textContent = message;
    }
})();