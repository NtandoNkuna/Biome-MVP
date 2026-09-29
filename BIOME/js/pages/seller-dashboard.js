/* ============================================================
   BIOME V2 - Seller Dashboard Page Controller
   Defensive rewrite: every stage isolated, every failure
   logged and surfaced.
   ============================================================ */

(function() {
    'use strict';

    if (window._biomeSellerDashboardInitialized) {
        console.warn('[SellerDashboard] Already initialized, skipping.');
        return;
    }
    window._biomeSellerDashboardInitialized = true;

    console.log('[SellerDashboard] Script loaded.');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // ============================================================
    // STATE
    // ============================================================

    const State = {
        profile:      null,
        userId:       null,
        user:         null,          // >>> SETTINGS: auth.users record
        listings:     [],
        selectedIds:  new Set(),
        statusFilter: 'all',
        searchText:   ''
    };

    const dom = {};

    // ============================================================
    // BOOT
    // ============================================================

    async function boot() {
        console.log('[SellerDashboard] Booting...');

        // --- 1. Dependency check --------------------------------
        const missing = [];
        if (!window.Biome)                        missing.push('window.Biome');
        if (!window.Biome?.Core?.supabase)        missing.push('Biome.Core.supabase');
        if (!window.Biome?.Auth)                  missing.push('Biome.Auth');
        if (!window.Biome?.Utils)                 missing.push('Biome.Utils');
        if (!window.Biome?.UI)                    missing.push('Biome.UI');
        if (!window.Biome?.Storage)               missing.push('Biome.Storage');
        if (!window.Biome?.Services?.Listings)    missing.push('Biome.Services.Listings');

        if (missing.length) {
            console.error('[SellerDashboard] Missing dependencies:', missing);
            showFatal(
                'This dashboard could not start because the following ' +
                'scripts are missing or failed to load:\n\n  • ' +
                missing.join('\n  • ') +
                '\n\nCheck the browser Network tab for 404s.'
            );
            return;
        }

        // --- 2. Auth gate ---------------------------------------
        let session = null;
        try {
            session = await window.Biome.Auth.getSession();
        } catch (e) {
            console.error('[SellerDashboard] Session check threw:', e);
        }

        if (!session) {
            console.warn('[SellerDashboard] No active session — redirecting to sign-in.');
            window.location.href = 'sign-in.html';
            return;
        }

        // --- 3. Run the dashboard -------------------------------
        try {
            await runDashboard();
        } catch (e) {
            console.error('[SellerDashboard] Fatal run error:', e);
            showFatal(e?.message || 'The dashboard failed to load.');
        }
    }

    async function runDashboard() {
        cacheDom();
        wireStaticListeners();

        try {
            await loadProfile();
        } catch (e) {
            console.error('[SellerDashboard] Profile load failed:', e);
        }

        await loadListings();

        console.log('[SellerDashboard] Ready.');
    }

    // ============================================================
    // DOM CACHE
    // ============================================================

    function cacheDom() {
        const ids = [
            'companyInitials', 'companyLabel',
            'dashboardBtn', 'settingsBtn', 'logoutBtn',
            'welcomeMessage', 'createBtn',
            'totalListings', 'draftListings', 'pendingListings',
            'publishedListings', 'rejectedListings',
            'editBtn', 'deleteBtn', 'viewBtn',
            'statusFilter', 'searchListings',
            'listingContainer', 'emptyState',
            'listingModal', 'modalTitle', 'closeModal',
            'listingForm', 'title', 'propertyType', 'price',
            'description', 'bedrooms', 'bathrooms',
            'street', 'suburb', 'city', 'province',
            'imageUploadBox', 'propertyImages', 'imagePreview',
            'videoUploadBox', 'propertyVideo', 'videoPreview',
            'formLoading', 'cancelBtn', 'saveDraftBtn', 'submitListingBtn',

            // >>> SETTINGS
            'settingsModal', 'settingsModalTitle', 'closeSettingsModal',
            'settingsForm', 'settingsName', 'settingsNumber', 'settingsEmail',
            'settingsChatLink', 'settingsChatPhoto', 'settingsChatPhotoPreview',
            'settingsFormLoading', 'cancelSettingsBtn', 'saveSettingsBtn'
        ];
        ids.forEach(id => { dom[id] = document.getElementById(id); });

        const missingIds = ids.filter(id => !dom[id]);
        if (missingIds.length) {
            console.warn('[SellerDashboard] Expected IDs not found in DOM:', missingIds);
        }
    }

    // ============================================================
    // PROFILE
    // ============================================================

    async function loadProfile() {
        const profile = await window.Biome.Auth.getCurrentProfile();
        if (!profile) {
            console.warn('[SellerDashboard] No profile row for this user.');
            if (dom.companyLabel)    dom.companyLabel.textContent    = 'Seller';
            if (dom.welcomeMessage)  dom.welcomeMessage.textContent  = 'Welcome back';
            return;
        }

        // Role guard — buyers and admins should not land here.
        if (profile.account_type && profile.account_type !== 'seller') {
            console.warn('[SellerDashboard] Non-seller account, redirecting.');
            window.location.href = 'index.html';
            return;
        }

        State.profile = profile;
        State.userId  = profile.profile_id;

        // >>> SETTINGS: cache the auth user for the email field
        try {
            State.user = await window.Biome.Auth.getCurrentUser();
        } catch (e) {
            console.warn('[SellerDashboard] Could not fetch auth user:', e);
            State.user = null;
        }

        const displayName =
            profile.company_name ||
            `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
            'Seller';

        if (dom.companyInitials) {
            dom.companyInitials.textContent = displayName.charAt(0).toUpperCase();
        }
        if (dom.companyLabel) dom.companyLabel.textContent = displayName;

        if (dom.welcomeMessage) {
            const who = profile.first_name || profile.company_name || 'there';
            dom.welcomeMessage.textContent = `Welcome back, ${who}`;
        }
    }

    // ============================================================
    // LISTINGS
    // ============================================================

    async function loadListings() {
        if (!State.userId) {
            State.listings = [];
            renderMetrics();
            renderTable();
            return;
        }

        try {
            State.listings = await window.Biome.Services.Listings.loadUserListings(
                State.userId
            ) || [];
        } catch (e) {
            console.error('[SellerDashboard] loadUserListings failed:', e);
            State.listings = [];
            window.Biome.UI.showToast('Could not load listings.', 'error');
        }

        renderMetrics();
        renderTable();
    }

    // ============================================================
    // METRICS
    // ============================================================

    function renderMetrics() {
        const c = { total: 0, draft: 0, pending: 0, approved: 0, rejected: 0 };
        State.listings.forEach(l => {
            c.total++;
            if (c[l.status] !== undefined) c[l.status]++;
        });

        if (dom.totalListings)     dom.totalListings.textContent     = String(c.total);
        if (dom.draftListings)     dom.draftListings.textContent     = String(c.draft);
        if (dom.pendingListings)   dom.pendingListings.textContent   = String(c.pending);
        if (dom.publishedListings) dom.publishedListings.textContent = String(c.approved);
        if (dom.rejectedListings)  dom.rejectedListings.textContent  = String(c.rejected);
    }

    // ============================================================
    // TABLE
    // ============================================================

    function renderTable() {
        if (!dom.listingContainer) return;

        const list = getFilteredListings();

        if (!list.length) {
            dom.listingContainer.innerHTML = '';
            showEmptyState();
            return;
        }

        hideEmptyState();
        dom.listingContainer.innerHTML = list.map(renderRow).join('');
        wireRowSelection();
    }

    function getFilteredListings() {
        let out = State.listings.slice();

        if (State.statusFilter !== 'all') {
            out = out.filter(l => l.status === State.statusFilter);
        }
        if (State.searchText) {
            const q = State.searchText.toLowerCase();
            out = out.filter(l =>
                (l.title  || '').toLowerCase().includes(q) ||
                (l.city   || '').toLowerCase().includes(q) ||
                (l.suburb || '').toLowerCase().includes(q)
            );
        }
        return out;
    }

    function renderRow(l) {
        const statusLabel = window.Biome.Utils.getStatusDisplay(l.status);
        const statusClass = window.Biome.Utils.getStatusClass(l.status);
        const price       = window.Biome.Utils.formatCurrency(l.price || 0);
        const location    = [l.suburb, l.city].filter(Boolean).join(', ');
        const submitted   = window.Biome.Utils.formatDate(
            l.submitted_at || l.created_at
        );

        return `
            <tr data-listing-id="${l.listing_id}">
                <td><input type="checkbox" class="row-select" data-listing-id="${l.listing_id}"></td>
                <td>${escapeHtml(l.title || 'Untitled')}</td>
                <td>${escapeHtml(l.property_type || '—')}</td>
                <td>${escapeHtml(location || '—')}</td>
                <td>${price} <span style="color:var(--text-muted);font-size:12px;">/month</span></td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                <td>${submitted}</td>
            </tr>
        `;
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ============================================================
    // SELECTION
    // ============================================================

    function wireRowSelection() {
        if (!dom.listingContainer) return;

        dom.listingContainer.querySelectorAll('.row-select').forEach(cb => {
            cb.addEventListener('change', handleSelectionChange);
        });

        dom.listingContainer.querySelectorAll('tr[data-listing-id]').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT') return;
                if (e.target.closest('button')) return;
                const cb = row.querySelector('.row-select');
                if (!cb) return;
                cb.checked = !cb.checked;
                handleSelectionChange();
            });
        });
    }

    function handleSelectionChange() {
        State.selectedIds.clear();
        if (dom.listingContainer) {
            dom.listingContainer.querySelectorAll('.row-select').forEach(cb => {
                if (cb.checked) State.selectedIds.add(cb.dataset.listingId);
            });
        }
        updateToolbarState();
    }

    function updateToolbarState() {
        const count  = State.selectedIds.size;
        const single = count === 1;

        if (dom.editBtn)   dom.editBtn.disabled   = !single;
        if (dom.deleteBtn) dom.deleteBtn.disabled = count === 0;
        if (dom.viewBtn)   dom.viewBtn.disabled   = !single;
    }

    // ============================================================
    // UI STATE
    // ============================================================

    function showEmptyState() {
        if (dom.emptyState) dom.emptyState.style.display = 'flex';
    }

    function hideEmptyState() {
        if (dom.emptyState) dom.emptyState.style.display = 'none';
    }

    function showFatal(message) {
        const box = dom.listingContainer
            || document.querySelector('.table-card')
            || document.querySelector('main');

        if (!box) {
            document.body.insertAdjacentHTML('afterbegin',
                '<pre style="padding:20px;background:#FBEBE8;color:#B14638;' +
                'font-family:monospace;white-space:pre-wrap;border-radius:8px;' +
                'margin:20px;">' + escapeHtml(message) + '</pre>');
            return;
        }

        box.innerHTML =
            '<div style="padding:32px 24px;text-align:center;color:#B14638;">' +
            '<h3 style="margin:0 0 10px;font-size:1.05rem;">Dashboard error</h3>' +
            '<pre style="white-space:pre-wrap;font-family:monospace;font-size:13px;' +
            'line-height:1.5;background:#FBEBE8;padding:16px;border-radius:8px;' +
            'text-align:left;max-width:640px;margin:0 auto;">' +
            escapeHtml(message) +
            '</pre>' +
            '<button onclick="location.reload()" ' +
            'style="margin-top:16px;padding:10px 18px;border:none;border-radius:8px;' +
            'background:#166534;color:#fff;font-weight:600;cursor:pointer;">' +
            'Reload</button>' +
            '</div>';
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================

    function wireStaticListeners() {
        // Sidebar
        if (dom.logoutBtn) {
            dom.logoutBtn.addEventListener('click', handleLogout);
        }
        if (dom.dashboardBtn) {
            dom.dashboardBtn.addEventListener('click', () => window.location.reload());
        }
        // >>> SETTINGS: settings button now opens the settings modal
        if (dom.settingsBtn) {
            dom.settingsBtn.addEventListener('click', openSettingsModal);
        }

        // Toolbar
        if (dom.createBtn) dom.createBtn.addEventListener('click', openCreateModal);
        if (dom.editBtn)   dom.editBtn.addEventListener('click', handleEdit);
        if (dom.deleteBtn) dom.deleteBtn.addEventListener('click', handleDelete);
        if (dom.viewBtn)   dom.viewBtn.addEventListener('click', handleView);

        // Filters
        if (dom.statusFilter) {
            dom.statusFilter.addEventListener('change', () => {
                State.statusFilter = dom.statusFilter.value;
                renderTable();
            });
        }
        if (dom.searchListings) {
            const debounced = window.Biome.Utils.debounce(() => {
                State.searchText = dom.searchListings.value.trim();
                renderTable();
            }, 250);
            dom.searchListings.addEventListener('input', debounced);
        }

        // Modal close — listing modal
        if (dom.closeModal) dom.closeModal.addEventListener('click', closeModal);
        if (dom.cancelBtn)  dom.cancelBtn.addEventListener('click', closeModal);

        if (dom.listingModal) {
            dom.listingModal.addEventListener('click', (e) => {
                if (e.target === dom.listingModal) closeModal();
            });
        }

        // >>> SETTINGS: modal close — settings modal
        if (dom.closeSettingsModal) dom.closeSettingsModal.addEventListener('click', closeSettingsModal);
        if (dom.cancelSettingsBtn)  dom.cancelSettingsBtn.addEventListener('click', closeSettingsModal);

        if (dom.settingsModal) {
            dom.settingsModal.addEventListener('click', (e) => {
                if (e.target === dom.settingsModal) closeSettingsModal();
            });
        }

        // >>> SETTINGS: form submit + chat photo preview
        if (dom.settingsForm) {
            dom.settingsForm.addEventListener('submit', handleSettingsSave);
        }
        if (dom.settingsChatPhoto) {
            dom.settingsChatPhoto.addEventListener('change', handleChatPhotoPreview);
        }

        // Escape key — closes whichever modal is currently open
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;

            if (dom.listingModal
                && dom.listingModal.style.display === 'flex') {
                closeModal();
                return;
            }

            // >>> SETTINGS
            if (dom.settingsModal
                && dom.settingsModal.style.display === 'flex') {
                closeSettingsModal();
            }
        });

        // Modal actions — listing
        if (dom.saveDraftBtn)     dom.saveDraftBtn.addEventListener('click', () => handleSave('draft'));
        if (dom.submitListingBtn) dom.submitListingBtn.addEventListener('click', () => handleSave('pending'));

        if (dom.listingForm) {
            dom.listingForm.addEventListener('submit', (e) => {
                e.preventDefault();
                handleSave('pending');
            });
        }

        // Image preview — listing
        if (dom.propertyImages) {
            dom.propertyImages.addEventListener('change', handleImagePreview);
        }

        updateToolbarState();
    }

    // ============================================================
    // ACTIONS
    // ============================================================

    async function handleLogout() {
        try {
            await window.Biome.Auth.logout();
            window.location.href = 'index.html';
        } catch (e) {
            console.error('[SellerDashboard] Logout error:', e);
            window.Biome.UI.showToast('Could not log out.', 'error');
        }
    }

    function handleView() {
        const id = [...State.selectedIds][0];
        if (!id) return;
        window.location.href = `property-details.html?id=${id}`;
    }

    function handleEdit() {
        const id = [...State.selectedIds][0];
        if (!id) return;
        const listing = State.listings.find(l => l.listing_id === id);
        if (!listing) return;
        openEditModal(listing);
    }

    async function handleDelete() {
        const ids = [...State.selectedIds];
        if (!ids.length) return;

        const confirmed = window.confirm(
            `Delete ${ids.length} listing${ids.length === 1 ? '' : 's'}? ` +
            'This cannot be undone.'
        );
        if (!confirmed) return;

        try {
            for (const id of ids) {
                await window.Biome.Services.Listings.deleteListing(id);
            }
            State.listings = State.listings.filter(l => !ids.includes(l.listing_id));
            State.selectedIds.clear();
            updateToolbarState();
            renderMetrics();
            renderTable();
            window.Biome.UI.showToast('Listing(s) deleted.', 'success');
        } catch (e) {
            console.error('[SellerDashboard] Delete error:', e);
            window.Biome.UI.showToast('Could not delete. Please try again.', 'error');
        }
    }

    // ============================================================
    // MODAL — CREATE / EDIT LISTING
    // ============================================================

    function openCreateModal() {
        if (!dom.listingModal) return;

        if (dom.modalTitle) dom.modalTitle.textContent = 'Create Property Listing';
        if (dom.listingForm) dom.listingForm.reset();
        if (dom.imagePreview) dom.imagePreview.innerHTML = '';
        if (dom.videoPreview) dom.videoPreview.innerHTML = '';

        dom.listingModal.dataset.mode = 'create';
        dom.listingModal.dataset.listingId = '';

        if (dom.saveDraftBtn)     dom.saveDraftBtn.style.display     = '';
        if (dom.submitListingBtn) dom.submitListingBtn.textContent   = 'Submit for Approval';

        dom.listingModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function openEditModal(listing) {
        if (!dom.listingModal) return;

        if (dom.modalTitle) dom.modalTitle.textContent = 'Edit Property Listing';

        const setVal = (el, v) => { if (el) el.value = (v === null || v === undefined) ? '' : v; };
        setVal(dom.title,        listing.title);
        setVal(dom.propertyType, listing.property_type_id || '');
        setVal(dom.price,        listing.price);
        setVal(dom.description,  listing.description);
        setVal(dom.bedrooms,     listing.bedrooms);
        setVal(dom.bathrooms,    listing.bathrooms);
        setVal(dom.street,       listing.street);
        setVal(dom.suburb,       listing.suburb);
        setVal(dom.city,         listing.city);
        setVal(dom.province,     listing.province);

        dom.listingModal.dataset.mode = 'edit';
        dom.listingModal.dataset.listingId = listing.listing_id;

        if (dom.saveDraftBtn)     dom.saveDraftBtn.style.display   = 'none';
        if (dom.submitListingBtn) dom.submitListingBtn.textContent = 'Save changes';

        dom.listingModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        if (!dom.listingModal) return;
        dom.listingModal.style.display = 'none';
        document.body.style.overflow = '';
        if (dom.listingForm) dom.listingForm.reset();
        if (dom.imagePreview) dom.imagePreview.innerHTML = '';
        if (dom.videoPreview) dom.videoPreview.innerHTML = '';
        if (dom.formLoading) dom.formLoading.hidden = true;
    }

    function collectFormData() {
        return {
            title:            dom.title?.value.trim() || '',
            property_type_id: dom.propertyType?.value || '',
            price:            parseFloat(dom.price?.value) || 0,
            description:      dom.description?.value.trim() || '',
            bedrooms:         parseInt(dom.bedrooms?.value, 10) || 0,
            bathrooms:        parseFloat(dom.bathrooms?.value) || 0,
            street:           dom.street?.value.trim() || '',
            suburb:           dom.suburb?.value.trim() || '',
            city:             dom.city?.value.trim() || '',
            province:         dom.province?.value.trim() || ''
        };
    }

    function validateFormData(data) {
        if (!data.title)            return 'Please enter a property title.';
        if (!data.property_type_id) return 'Please select a property type.';
        if (!data.price || data.price < 0) return 'Please enter a valid price.';
        return null;
    }

    async function handleSave(targetStatus) {
        if (!dom.listingForm) return;

        const data = collectFormData();
        const err  = validateFormData(data);
        if (err) {
            window.Biome.UI.showToast(err, 'error');
            return;
        }

        const mode      = dom.listingModal?.dataset.mode || 'create';
        const listingId = dom.listingModal?.dataset.listingId || '';

        if (dom.formLoading) {
            dom.formLoading.hidden = false;
            dom.formLoading.textContent = targetStatus === 'draft'
                ? 'Saving draft…'
                : 'Submitting listing…';
        }
        if (dom.saveDraftBtn)     dom.saveDraftBtn.disabled     = true;
        if (dom.submitListingBtn) dom.submitListingBtn.disabled = true;

        try {
            const numericTypeId = parseInt(data.property_type_id, 10) || null;
            const payload = Object.assign({}, data, {
                property_type_id: numericTypeId
            });

            if (mode === 'edit' && listingId) {
                await window.Biome.Services.Listings.updateListing(
                    listingId, payload, targetStatus === 'draft' ? null : targetStatus
                );
                window.Biome.UI.showToast('Listing updated.', 'success');
            } else {
                await window.Biome.Services.Listings.createListing(
                    payload, State.userId, targetStatus
                );
                window.Biome.UI.showToast(
                    targetStatus === 'draft'
                        ? 'Draft saved.'
                        : 'Listing submitted for review.',
                    'success'
                );
            }

            closeModal();
            await loadListings();
        } catch (e) {
            console.error('[SellerDashboard] Save error:', e);
            window.Biome.UI.showToast(
                e?.message || 'Could not save listing. Please try again.',
                'error'
            );
        } finally {
            if (dom.formLoading)       dom.formLoading.hidden       = true;
            if (dom.saveDraftBtn)      dom.saveDraftBtn.disabled     = false;
            if (dom.submitListingBtn)  dom.submitListingBtn.disabled = false;
        }
    }

    // ============================================================
    // IMAGE PREVIEW — LISTING
    // ============================================================

    function handleImagePreview() {
        if (!dom.imagePreview || !dom.propertyImages) return;

        dom.imagePreview.innerHTML = '';
        const files = Array.from(dom.propertyImages.files || []).slice(0, 10);

        files.forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const url = URL.createObjectURL(file);
            const img = document.createElement('img');
            img.src = url;
            img.alt = file.name;
            img.style.cssText =
                'width:80px;height:80px;object-fit:cover;border-radius:8px;' +
                'border:1px solid var(--border);';
            img.onload = () => URL.revokeObjectURL(url);
            dom.imagePreview.appendChild(img);
        });
    }

    // ============================================================
    // >>> SETTINGS — OPEN / CLOSE
    // ============================================================

    function openSettingsModal() {
        if (!dom.settingsModal) {
            console.warn('[SellerDashboard] Settings modal not in DOM.');
            return;
        }

        const p = State.profile || {};

        // Name → first_name + last_name joined
        const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ');
        if (dom.settingsName)     dom.settingsName.value     = fullName;
        if (dom.settingsNumber)   dom.settingsNumber.value   = p.phone || '';
        if (dom.settingsChatLink) dom.settingsChatLink.value = p.chat_link || '';

        // Email → from auth.users (async)
        if (dom.settingsEmail) {
            dom.settingsEmail.value = State.user?.email || '';
            if (!State.user) {
                window.Biome.Auth.getCurrentUser().then(u => {
                    State.user = u;
                    if (u?.email && dom.settingsEmail) dom.settingsEmail.value = u.email;
                }).catch(() => {});
            }
        }

        // Chat photo preview — show existing profile_photo if present
        if (dom.settingsChatPhotoPreview) {
            dom.settingsChatPhotoPreview.innerHTML = '';
            if (p.profile_photo) {
                const url = window.Biome.Storage.getPublicUrl(p.profile_photo);
                if (url) {
                    const img = document.createElement('img');
                    img.src = url;
                    img.alt = 'Chat photo';
                    dom.settingsChatPhotoPreview.appendChild(img);
                }
            }
        }

        // Reset file input so a previously-selected file doesn't linger
        if (dom.settingsChatPhoto) dom.settingsChatPhoto.value = '';
        if (dom.settingsFormLoading) dom.settingsFormLoading.hidden = true;

        dom.settingsModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function closeSettingsModal() {
        if (!dom.settingsModal) return;
        dom.settingsModal.style.display = 'none';
        document.body.style.overflow = '';
        if (dom.settingsForm) dom.settingsForm.reset();
        if (dom.settingsChatPhotoPreview) dom.settingsChatPhotoPreview.innerHTML = '';
        if (dom.settingsFormLoading) dom.settingsFormLoading.hidden = true;
    }

    function handleChatPhotoPreview() {
        if (!dom.settingsChatPhotoPreview || !dom.settingsChatPhoto) return;

        const file = dom.settingsChatPhoto.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return;

        // Use FileReader → data URL so the preview survives without
        // needing to revoke a blob URL on modal close.
        const reader = new FileReader();
        reader.onload = (e) => {
            dom.settingsChatPhotoPreview.innerHTML = '';
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = file.name;
            dom.settingsChatPhotoPreview.appendChild(img);
        };
        reader.readAsDataURL(file);
    }

    // ============================================================
    // >>> SETTINGS — VALIDATION
    // ============================================================

    /**
     * Validate a chat link. Prefers tawk.to; accepts other HTTPS
     * URLs with a warning. Rejects malformed input.
     *
     * @param {string} raw - The raw value from the input field.
     * @returns {{ ok: boolean, value: string|null, warning?: string, error?: string }}
     */
    function validateChatLink(raw) {
        const value = (raw || '').trim();

        // Empty is fine — the column is nullable.
        if (!value) {
            return { ok: true, value: null };
        }

        // Must be a syntactically valid URL.
        let parsed;
        try {
            parsed = new URL(value);
        } catch (e) {
            return {
                ok: false,
                value: null,
                error: 'Chat link is not a valid URL.'
            };
        }

        // Must be HTTPS — HTTP links get blocked as mixed content
        // when the widget is embedded on an HTTPS page.
        if (parsed.protocol !== 'https:') {
            return {
                ok: false,
                value: null,
                error: 'Chat link must use HTTPS.'
            };
        }

        // Preferred: tawk.to. https://tawk.to/chat/{propertyId}/{widgetId}
        // and the short form https://tawk.to/{propertyId} are both valid.
        const host = parsed.hostname.toLowerCase();
        const isTawkTo = host === 'tawk.to' || host === 'www.tawk.to';

        if (isTawkTo) {
            return { ok: true, value: parsed.toString() };
        }

        // Any other HTTPS URL is allowed but flagged.
        return {
            ok: true,
            value: parsed.toString(),
            warning: 'Not a tawk.to link. Make sure the URL points to a live chat widget.'
        };
    }

    // ============================================================
    // >>> SETTINGS — DATABASE WRITE
    // ============================================================

    /**
     * Persist seller profile fields to the `profiles` table.
     *
     * Only fields present in the payload are written; omitted fields
     * are left untouched. `chat_link` is only written when the caller
     * passes either a string or an explicit `null` — an `undefined`
     * value is treated as "leave untouched" rather than "clear it".
     *
     * @param {Object} payload
     * @param {string} payload.userId    - profiles.profile_id
     * @param {string} [payload.firstName]
     * @param {string} [payload.lastName]
     * @param {string} [payload.phone]
     * @param {string|null} [payload.chatLink]   - already validated
     * @param {string|null} [payload.photoPath]  - storage path
     * @returns {Promise<Object>} The updated profile row
     */
    async function saveSellerSettings(payload) {
        const supabase = window.Biome.Core.supabase;
        if (!supabase) throw new Error('Supabase client unavailable.');

        if (!payload || !payload.userId) {
            throw new Error('saveSellerSettings: userId is required.');
        }

        const updateData = {
            updated_at: new Date().toISOString()
        };

        if (typeof payload.firstName === 'string') updateData.first_name = payload.firstName;
        if (typeof payload.lastName  === 'string') updateData.last_name  = payload.lastName;
        if (typeof payload.phone     === 'string') updateData.phone      = payload.phone;

        // chat_link: write only when the caller explicitly provided a
        // value. `null` clears it; a string sets it; `undefined` means
        // "do not touch". This prevents a validation edge case from
        // silently wiping an existing link.
        if (payload.chatLink === null || typeof payload.chatLink === 'string') {
            updateData.chat_link = payload.chatLink;
        }

        if (payload.photoPath) {
            updateData.profile_photo = payload.photoPath;
        }

        const { data, error } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('profile_id', payload.userId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // ============================================================
    // >>> SETTINGS — FORM SUBMIT (UI ORCHESTRATOR)
    // ============================================================

    async function handleSettingsSave(e) {
        e.preventDefault();

        if (!State.userId) {
            window.Biome.UI.showToast('Not signed in.', 'error');
            return;
        }

        // --- 1. Read raw fields -------------------------------
        const rawName   = dom.settingsName?.value.trim()     || '';
        const number    = dom.settingsNumber?.value.trim()   || '';
        const email     = dom.settingsEmail?.value.trim()    || '';
        const rawLink   = dom.settingsChatLink?.value.trim() || '';
        const photoFile = dom.settingsChatPhoto?.files?.[0] || null;

        // --- 2. Validate the chat link ------------------------
        const linkCheck = validateChatLink(rawLink);
        if (!linkCheck.ok) {
            window.Biome.UI.showToast(linkCheck.error, 'error');
            dom.settingsChatLink?.focus();
            return;
        }
        if (linkCheck.warning) {
            window.Biome.UI.showToast(linkCheck.warning, 'warning');
        }

        // --- 3. Split name → first / last ---------------------
        const parts     = rawName.split(/\s+/).filter(Boolean);
        const firstName = parts[0] || '';
        const lastName  = parts.slice(1).join(' ');

        // --- 4. UI loading state ------------------------------
        if (dom.settingsFormLoading) {
            dom.settingsFormLoading.hidden = false;
            dom.settingsFormLoading.textContent = 'Saving…';
        }
        if (dom.saveSettingsBtn) dom.saveSettingsBtn.disabled = true;

        try {
            // --- 5. Upload new chat photo, if provided ----------
            let photoPath = null;
            if (photoFile) {
                const ext  = (photoFile.name.split('.').pop() || 'jpg').toLowerCase();
                const uuid = (crypto.randomUUID && crypto.randomUUID()) ||
                             (Date.now().toString(36) + Math.random().toString(36).slice(2));
                const path = `profiles/${State.userId}/${uuid}.${ext}`;

                await window.Biome.Storage.upload(path, photoFile);
                photoPath = path;
            }

            // --- 6. Persist to the database ---------------------
            await saveSellerSettings({
                userId:    State.userId,
                firstName,
                lastName,
                phone:     number,
                chatLink:  linkCheck.value,   // string | null
                photoPath                     // null → no change
            });

            // --- 7. Update email via auth (separate flow) -------
            // Supabase emails a confirmation link; the address only
            // changes after the user clicks it.
            if (email && State.user && State.user.email !== email) {
                const supabase = window.Biome.Core.supabase;
                const { error: emailError } = await supabase.auth.updateUser({ email });
                if (emailError) throw emailError;
                window.Biome.UI.showToast(
                    'Confirmation email sent to your new address.',
                    'info'
                );
            }

            // --- 8. Refresh cached state so the UI reflects -----
            State.profile = await window.Biome.Auth.getCurrentProfile();
            State.user    = await window.Biome.Auth.getCurrentUser();
            await loadProfile();

            window.Biome.UI.showToast('Settings updated.', 'success');
            closeSettingsModal();
        } catch (err) {
            console.error('[SellerDashboard] Settings save error:', err);
            window.Biome.UI.showToast(
                err?.message || 'Could not save settings. Please try again.',
                'error'
            );
        } finally {
            if (dom.settingsFormLoading) dom.settingsFormLoading.hidden = true;
            if (dom.saveSettingsBtn)     dom.saveSettingsBtn.disabled   = false;
        }
    }
})();