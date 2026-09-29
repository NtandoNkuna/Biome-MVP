/* ============================================================
   BIOME V2 - Sign-Up page controller
   Matches the real sign-up.html markup.
   ============================================================ */

(function() {
    'use strict';

    if (window._biomeSignUpInitialized) {
        console.warn('[SignUp] Already initialized, skipping.');
        return;
    }
    window._biomeSignUpInitialized = true;

    console.log('[SignUp] Initializing...');

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
                await window.Biome.Auth.redirectUser();
                return;
            }

            const existing = await window.Biome.Auth.getSession();
            if (existing) {
                await window.Biome.Auth.redirectUser();
                return;
            }

            wireForm();
            wirePasswordStrength();

            console.log('[SignUp] Ready.');
        } catch (e) {
            console.error('[SignUp] Initialization error:', e);
            setStatus('Something went wrong loading this page.', 'error');
        }
    }

    // ---------------------------------------------------------
    // Form
    // ---------------------------------------------------------

    function wireForm() {
        const form = document.getElementById('signup-form');
        if (!form) {
            console.warn('[SignUp] #signup-form not found.');
            return;
        }

        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            setStatus('', '');

            const fields = {
                firstName: document.getElementById('first-name'),
                surname:   document.getElementById('surname'),
                email:     document.getElementById('email'),
                phone:     document.getElementById('phone'),
                account:   document.getElementById('account-type'),
                country:   document.getElementById('country'),
                password:  document.getElementById('password'),
                confirm:   document.getElementById('confirm-password')
            };

            const values = {
                firstName: fields.firstName?.value.trim() || '',
                surname:   fields.surname?.value.trim()   || '',
                email:     fields.email?.value.trim()     || '',
                phone:     fields.phone?.value.trim()     || '',
                account:   fields.account?.value          || '',
                country:   fields.country?.value.trim()   || '',
                password:  fields.password?.value         || '',
                confirm:   fields.confirm?.value          || ''
            };

            // Validation
            if (!values.firstName || !values.surname) {
                setStatus('Please enter your first name and surname.', 'error'); return;
            }
            if (!values.email) {
                setStatus('Please enter your email address.', 'error'); return;
            }
            if (!values.phone) {
                setStatus('Please enter your phone number.', 'error'); return;
            }
            if (!values.account) {
                setStatus('Please select an account type.', 'error'); return;
            }
            if (values.password.length < 8) {
                setStatus('Password must be at least 8 characters.', 'error'); return;
            }
            if (values.password !== values.confirm) {
                setStatus('Passwords do not match.', 'error'); return;
            }

            // Account type: restrict "admin" from public signup.
            // The dropdown lists it, but a public user must not be
            // able to self-provision an admin account.
            if (values.account === 'admin') {
                setStatus('Administrator accounts are created by invitation only.', 'error');
                return;
            }

            const btn = document.getElementById('signup-button');
            if (btn) btn.disabled = true;

            // Metadata → auth.users.user_metadata. The profiles row is
            // created by a DB trigger on auth.users insert.
            //
            // Note: `country` is intentionally NOT sent. There is no
            // corresponding column on `profiles`, and no service in the
            // codebase reads or writes it. Sending it as metadata was
            // dead weight that risked triggering validation errors in
            // the profiles-creation trigger.
            const metadata = {
                first_name:   values.firstName,
                last_name:    values.surname,
                phone:        values.phone,
                account_type: values.account
            };

            try {
                const result = await window.Biome.Auth.signup(
                    values.email, values.password, metadata
                );

                // If email confirmation is required, Supabase returns
                // a user without a session — show a message instead of
                // redirecting into a dashboard we can't authorize.
                if (!result || !result.session) {
                    setStatus(
                        'Account created. Check your email to confirm before signing in.',
                        'success'
                    );
                    form.reset();
                    updateStrength('', 0);
                    // Hide the strength box along with the reset fields.
                    document.querySelector('.password-strength-section')
                        ?.classList.remove('is-visible');
                    return;
                }

                setStatus('Account created. Redirecting…', 'success');
                await waitForProfileThenRedirect();
            } catch (err) {
                console.error('[SignUp] Signup error:', err);
                const msg = (err && err.message) ? err.message : 'Sign-up failed.';
                const lower = msg.toLowerCase();

                if (lower.includes('already registered') || lower.includes('user already')) {
                    setStatus('An account with this email already exists.', 'error');
                } else if (lower.includes('password')) {
                    setStatus('Password does not meet the requirements.', 'error');
                } else {
                    setStatus(msg, 'error');
                }
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    }

    /**
     * Wait (briefly) for the profiles-creation trigger to commit,
     * then hand off to Auth.redirectUser() — which itself handles
     * the case where the profile still hasn't appeared.
     *
     * Mirrors the retry pattern in Auth.handleOAuthCallback():
     * bounded attempts, short fixed interval, no unbounded waiting.
     */
    async function waitForProfileThenRedirect(maxAttempts = 10, intervalMs = 100) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const profile = await window.Biome.Auth.getCurrentProfile();
            if (profile) break;
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        await window.Biome.Auth.redirectUser();
    }

    // ---------------------------------------------------------
    // Password strength meter
    // ---------------------------------------------------------

    function wirePasswordStrength() {
        const input   = document.getElementById('password');
        const section = document.querySelector('.password-strength-section');

        if (!input || !section) return;

        // The box is hidden by CSS until `.is-visible` is added.
        // It appears the moment the user types or pastes a character
        // into #password, and hides again if they clear the field.
        const syncVisibility = () => {
            const hasValue = input.value.length > 0;
            section.classList.toggle('is-visible', hasValue);
        };

        input.addEventListener('input', () => {
            syncVisibility();
            const { score, label } = evaluateStrength(input.value);
            updateStrength(label, score);
        });

        // In case the browser auto-filled the field on page load.
        syncVisibility();
        if (input.value) {
            const { score, label } = evaluateStrength(input.value);
            updateStrength(label, score);
        }
    }

    function evaluateStrength(pw) {
        if (!pw) return { score: 0, label: 'Weak' };

        let score = 0;
        if (pw.length >= 8) score++;
        if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++;

        if (score <= 1) return { score: 1, label: 'Weak' };
        if (score === 2) return { score: 2, label: 'Medium' };
        return { score: 3, label: 'Strong' };
    }

    function updateStrength(label, score) {
        const textEl = document.getElementById('strength-text');
        const barEl  = document.getElementById('strength-bar');

        if (textEl) {
            textEl.textContent = label;
            textEl.className = label.toLowerCase();
        }

        if (barEl) {
            barEl.className = 'strength-bar';
            if (score === 1) barEl.classList.add('weak');
            else if (score === 2) barEl.classList.add('medium');
            else if (score === 3) barEl.classList.add('strong');
        }

        // Requirement icons
        const pw = document.getElementById('password')?.value || '';
        const reqs = {
            length:    pw.length >= 8,
            numOrSym:  /[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw),
            mixedCase: /[a-z]/.test(pw) && /[A-Z]/.test(pw)
        };

        const icons = document.querySelectorAll('.req-icon');
        if (icons[0]) icons[0].classList.toggle('valid', reqs.length);
        if (icons[1]) icons[1].classList.toggle('valid', reqs.numOrSym);
        if (icons[2]) icons[2].classList.toggle('valid', reqs.mixedCase);
    }

    // ---------------------------------------------------------
    // Status message helper
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