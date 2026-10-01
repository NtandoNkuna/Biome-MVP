/* ============================================================
   BIOME V2 - Sign-Up page controller
   Matches the real sign-up.html markup.

   Patched:
   - Metadata keys now match public.handle_new_user():
       owner_type, first_name, surname, phone
   - Duplicate-email detection (Supabase returns a fake user with
     no identities when confirmation is ON)
   - Profile hand-off verified; no more silent redirect
   - Client validation now matches the rules shown on the page
   - Email / phone format checks (form uses `novalidate`)
   - Specific error messages instead of one generic "password" one
   - Double-submit guard; button stays disabled while redirecting
   - "Administrator" removed from the public dropdown
   ============================================================ */

(function() {
    'use strict';

    if (window._biomeSignUpInitialized) {
        console.warn('[SignUp] Already initialized, skipping.');
        return;
    }
    window._biomeSignUpInitialized = true;

    console.log('[SignUp] Initializing...');

    // Account types a public visitor may self-register as.
    // 'admin' is intentionally excluded (invitation only).
    const PUBLIC_ACCOUNT_TYPES = ['buyer', 'seller'];

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const PHONE_CHARS_RE = /^[+\d\s()\-]+$/;

    let submitting = false;

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

            tidyForm();
            wireForm();
            wirePasswordStrength();

            console.log('[SignUp] Ready.');
        } catch (e) {
            console.error('[SignUp] Initialization error:', e);
            setStatus('Something went wrong loading this page.', 'error');
        }
    }

    // ---------------------------------------------------------
    // Form clean-up (markup the page should not expose)
    // ---------------------------------------------------------

    function tidyForm() {
        // Public sign-up must not offer the admin role at all.
        document
            .querySelector('#account-type option[value="admin"]')
            ?.remove();

        // `country` has no column in profiles and is never sent,
        // so it must not look like a required field.
        const country = document.getElementById('country');
        if (country) {
            country.required = false;
            country.closest('.input-group')
                ?.querySelector('label .required')
                ?.remove();
        }
    }

    // ---------------------------------------------------------
    // Form
    // ---------------------------------------------------------

    function readValues() {
        const val = id => document.getElementById(id)?.value ?? '';
        return {
            firstName: val('first-name').trim(),
            surname:   val('surname').trim(),
            email:     val('email').trim(),
            phone:     val('phone').trim(),
            account:   val('account-type'),
            password:  val('password'),
            confirm:   val('confirm-password')
        };
    }

    /** Returns an error message, or '' when the input is valid. */
    function validate(v) {
        if (!v.firstName || !v.surname) {
            return 'Please enter your first name and surname.';
        }
        if (!v.email) {
            return 'Please enter your email address.';
        }
        if (!EMAIL_RE.test(v.email)) {
            return 'Please enter a valid email address.';
        }
        if (!v.phone) {
            return 'Please enter your phone number.';
        }
        if (!PHONE_CHARS_RE.test(v.phone) || v.phone.replace(/\D/g, '').length < 9) {
            return 'Please enter a valid phone number, e.g. +27 82 123 4567.';
        }
        if (!v.account) {
            return 'Please select an account type.';
        }
        if (v.account === 'admin') {
            return 'Administrator accounts are created by invitation only.';
        }
        if (!PUBLIC_ACCOUNT_TYPES.includes(v.account)) {
            return 'Please select a valid account type.';
        }
        const rules = passwordRules(v.password);
        if (!rules.length) {
            return 'Password must be at least 8 characters.';
        }
        if (!rules.mixedCase) {
            return 'Password must include uppercase and lowercase letters.';
        }
        if (!rules.numOrSym) {
            return 'Password must include a number or symbol.';
        }
        if (v.password !== v.confirm) {
            return 'Passwords do not match.';
        }
        return '';
    }

    function wireForm() {
        const form = document.getElementById('signup-form');
        if (!form) {
            console.warn('[SignUp] #signup-form not found.');
            return;
        }

        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (submitting) return;
            setStatus('', '');

            const values = readValues();
            const problem = validate(values);
            if (problem) {
                setStatus(problem, 'error');
                return;
            }

            const btn = document.getElementById('signup-button');
            submitting = true;
            if (btn) btn.disabled = true;
            let redirecting = false;

            // These keys are read by public.handle_new_user():
            //   owner_type -> profiles.account_type
            //   first_name -> profiles.first_name
            //   surname    -> profiles.last_name
            //   phone      -> profiles.phone
            // Do not rename them without changing the trigger.
            const metadata = {
                owner_type: values.account,
                first_name: values.firstName,
                surname:    values.surname,
                phone:      values.phone
            };

            try {
                const result = await window.Biome.Auth.signup(
                    values.email,
                    values.password,
                    metadata,
                    getEmailRedirectUrl()   // ignored by Auth.signup until it accepts a 4th arg
                );

                // With email confirmation ON, Supabase does not error for an
                // already-registered address. It returns an obfuscated user
                // with no identities, no session, and sends no email.
                if (isExistingAccount(result)) {
                    setStatus(
                        'An account with this email already exists. Try signing in instead.',
                        'error'
                    );
                    return;
                }

                // New user, confirmation required: no session yet.
                if (!result || !result.session) {
                    setStatus(
                        'Account created. Check your email to confirm before signing in.',
                        'success'
                    );
                    form.reset();
                    tidyAfterReset();
                    return;
                }

                // New user, signed in immediately.
                setStatus('Account created. Redirecting…', 'success');

                const ready = await waitForProfile();
                if (!ready) {
                    setStatus(
                        'Your account was created, but we could not load your profile. ' +
                        'Please refresh the page or sign in again.',
                        'error'
                    );
                    return;
                }

                redirecting = true;
                await window.Biome.Auth.redirectUser();
            } catch (err) {
                console.error('[SignUp] Signup error:', err);
                setStatus(friendlyError(err), 'error');
            } finally {
                // Stay disabled while the browser is navigating away.
                if (!redirecting) {
                    submitting = false;
                    if (btn) btn.disabled = false;
                }
            }
        });
    }

    function isExistingAccount(result) {
        const identities = result?.user?.identities;
        return Array.isArray(identities) && identities.length === 0;
    }

    /**
     * Where the confirmation link should send the user.
     * Returns undefined when the page is not served over http(s)
     * (e.g. opened from file://), so Supabase falls back to its
     * configured Site URL instead of receiving an invalid value.
     * The URL must also be in Supabase > Auth > URL Configuration >
     * Redirect URLs, otherwise Supabase ignores it.
     */
    function getEmailRedirectUrl() {
        if (!/^https?:$/.test(window.location.protocol)) return undefined;
        return new URL('sign-in.html', window.location.href).href;
    }

    function friendlyError(err) {
        const msg = (err && err.message) ? err.message : 'Sign-up failed.';
        const lower = msg.toLowerCase();

        if (lower.includes('already registered') ||
            lower.includes('already been registered') ||
            lower.includes('user already')) {
            return 'An account with this email already exists. Try signing in instead.';
        }
        if (lower.includes('rate limit') ||
            lower.includes('too many') ||
            lower.includes('for security purposes')) {
            return 'Too many attempts. Please wait a minute and try again.';
        }
        if (lower.includes('database error saving new user')) {
            // The profiles trigger rejected the insert. Details are in the
            // Supabase logs; the user cannot act on them.
            return 'We could not set up your profile. Please try again, or contact support if it keeps happening.';
        }
        if (lower.includes('email') && lower.includes('invalid')) {
            return 'Please enter a valid email address.';
        }
        // Includes Supabase's own password-policy reasons (weak, leaked, ...),
        // which are more useful to the user than a generic message.
        return msg;
    }

    /**
     * Poll briefly for the profiles row created by the DB trigger.
     * Returns true if the profile is readable, false if it is not,
     * so the caller can report a failure instead of redirecting blindly.
     */
    async function waitForProfile(maxAttempts = 10, intervalMs = 150) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const profile = await window.Biome.Auth.getCurrentProfile();
            if (profile) return true;
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        return false;
    }

    function tidyAfterReset() {
        updateStrength('', 0);
        document.querySelector('.password-strength-section')
            ?.classList.remove('is-visible');
    }

    // ---------------------------------------------------------
    // Password strength meter
    // ---------------------------------------------------------

    function passwordRules(pw) {
        return {
            length:    pw.length >= 8,
            numOrSym:  /[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw),
            mixedCase: /[a-z]/.test(pw) && /[A-Z]/.test(pw)
        };
    }

    function wirePasswordStrength() {
        const input   = document.getElementById('password');
        const section = document.querySelector('.password-strength-section');

        if (!input || !section) return;

        // The box is hidden by CSS until `.is-visible` is added.
        // It appears the moment the user types or pastes a character
        // into #password, and hides again if they clear the field.
        const syncVisibility = () => {
            section.classList.toggle('is-visible', input.value.length > 0);
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

        const rules = passwordRules(pw);
        let score = 0;
        if (rules.length) score++;
        if (rules.mixedCase) score++;
        if (rules.numOrSym) score++;

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
        const rules = passwordRules(pw);

        const icons = document.querySelectorAll('.req-icon');
        if (icons[0]) icons[0].classList.toggle('valid', rules.length);
        if (icons[1]) icons[1].classList.toggle('valid', rules.numOrSym);
        if (icons[2]) icons[2].classList.toggle('valid', rules.mixedCase);
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

        el.setAttribute('role', type === 'error' ? 'alert' : 'status');
        el.classList.add(type || 'info');
        el.textContent = message;
    }
})();
