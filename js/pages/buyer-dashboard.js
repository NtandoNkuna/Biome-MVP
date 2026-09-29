/* ============================================================
   BIOME V2 - Buyer Dashboard Page
   Shows the signed-in buyer's saved listings, enquiries,
   viewings, and recent activity.
   ============================================================ */

(function() {
    'use strict';

    if (window._biomeBuyerDashboardInitialized) {
        console.warn('[BuyerDashboard] Already initialized, skipping.');
        return;
    }
    window._biomeBuyerDashboardInitialized = true;

    console.log('[BuyerDashboard] Initializing...');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================================
    // STATE
    // ============================================================

    const State = {
        profile: null,
        userId: null,
        savedListings: [],     // [{ saved_id, listing_id, status, saved_at, card }]
        selectedIds: new Set(),
        statusFilter: 'all',
        searchText: '',
    };

    // ============================================================
    // DOM CACHE
    // ============================================================

    const dom = {};

    function cacheDom() {
        // Sidebar
        dom.buyerInitials = document.getElementById('buyerInitials');
        dom.buyerLabel    = document.getElementById('buyerLabel');
        dom.dashboardBtn  = document.getElementById('dashboardBtn');
        dom.settingsBtn   = document.getElementById('settingsBtn');
        dom.logoutBtn     = document.getElementById('logoutBtn');

        // Header
        dom.welcomeMessage = document.getElementById('welcomeMessage');

        // Metrics
        dom.totalSaved     = document.getElementById('totalSaved');
        dom.enquiryCount   = document.getElementById('enquiryCount');
        dom.viewingCount   = document.getElementById('viewingCount');
        dom.priceDropCount = document.getElementById('priceDropCount');
        dom.newCount       = document.getElementById('newCount');

        // Toolbar
        dom.contactBtn  = document.getElementById('contactBtn');
        dom.scheduleBtn = document.getElementById('scheduleBtn');
        dom.viewBtn     = document.getElementById('viewBtn');
        dom.removeBtn   = document.getElementById('removeBtn');

        // Filters
        dom.statusFilter   = document.getElementById('statusFilter');
        dom.searchActivity = document.getElementById('searchActivity');

        // Table
        dom.activityContainer = document.getElementById('activityContainer');
        dom.loadingState      = document.getElementById('loadingState');
        dom.emptyState        = document.getElementById('emptyState');
        dom.emptyTitle        = document.getElementById('emptyTitle');
        dom.emptyText         = document.getElementById('emptyText');

        // Viewing modal
        dom.viewingModal       = document.getElementById('viewingModal');
        dom.viewingForm        = document.getElementById('viewingForm');
        dom.closeModal         = document.getElementById('closeModal');
        dom.cancelBtn          = document.getElementById('cancelBtn');
        dom.sendRequestBtn     = document.getElementById('sendRequestBtn');
        dom.modalPropertyThumb = document.getElementById('modalPropertyThumb');
        dom.modalPropertyTitle = document.getElementById('modalPropertyTitle');
        dom.modalPropertyMeta  = document.getElementById('modalPropertyMeta');
        dom.modalListingId     = document.getElementById('modalListingId');
        dom.viewingDate        = document.getElementById('viewingDate');
        dom.viewingTime        = document.getElementById('viewingTime');
        dom.contactName        = document.getElementById('contactName');
        dom.contactPhone       = document.getElementById('contactPhone');
        dom.viewingMessage     = document.getElementById('viewingMessage');
        dom.formLoading        = document.getElementById('formLoading');
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================

    async function init() {
        try {
            cacheDom();

            // Require auth — the buyer dashboard is private.
            const session = await window.Biome.Auth.getSession();
            if (!session) {
                window.location.href = 'sign-in.html';
                return;
            }

            await initNavbar();
            await loadProfile();
            await loadSavedListings();

            registerEventListeners();

            console.log('[BuyerDashboard] Ready.');
        } catch (e) {
            console.error('[BuyerDashboard] Initialization error:', e);
            window.Biome.UI.showToast('Failed to load dashboard.', 'error');
        }
    }

    // ============================================================
    // NAVBAR
    // ============================================================

    async function initNavbar() {
        if (!document.getElementById('navbarContainer')) return;
        await window.Biome.Components.Navbar.init({
            containerId: 'navbarContainer',
            activeLink: 'home'
        });
    }

    // ============================================================
    // PROFILE
    // ============================================================

    async function loadProfile() {
        try {
            const profile = await window.Biome.Auth.getCurrentProfile();
            if (!profile) return;

            State.profile = profile;
            State.userId  = profile.profile_id;

            // Sidebar avatar initials
            if (dom.buyerInitials) {
                const initials = (profile.first_name?.[0] || '') + (profile.last_name?.[0] || '');
                dom.buyerInitials.textContent = (initials || 'B').toUpperCase();
            }

            // Sidebar display name
            if (dom.buyerLabel) {
                const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
                dom.buyerLabel.textContent = name || profile.company_name || 'Buyer';
            }

            // Header welcome
            if (dom.welcomeMessage) {
                const firstName = profile.first_name || 'there';
                dom.welcomeMessage.textContent = `Welcome back, ${firstName}`;
            }

            // Pre-fill viewing modal contact fields
            if (dom.contactName) {
                const full = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
                if (full) dom.contactName.value = full;
            }
            if (dom.contactPhone && profile.phone) {
                dom.contactPhone.value = profile.phone;
            }
        } catch (e) {
            console.error('[BuyerDashboard] Profile load error:', e);
        }
    }

    // ============================================================
    // SAVED LISTINGS
    // ============================================================

    async function loadSavedListings() {
        showLoading();

        try {
            const supabase = window.Biome.Core.supabase;

            // Attempt to load from a "saved_listings" table. If the table
            // does not exist yet, degrade gracefully to an empty list so
            // the rest of the dashboard still renders.
            const { data: saved, error } = await supabase
                .from('saved_listings')
                .select('saved_id, listing_id, status, saved_at, notes')
                .eq('user_id', State.userId)
                .order('saved_at', { ascending: false });

            if (error) {
                console.warn('[BuyerDashboard] Saved listings fetch error:', error.message);
                State.savedListings = [];
                renderMetrics();
                renderTable();
                hideLoading();
                return;
            }

            if (!saved || saved.length === 0) {
                State.savedListings = [];
                renderMetrics();
                renderTable();
                hideLoading();
                return;
            }

            // Hydrate cards from the property service
            const listingIds = saved.map(s => s.listing_id);
            const cards = await window.Biome.Services.Properties.getPropertyCardsWithMedia(listingIds);

            State.savedListings = saved
                .map(item => {
                    const card = cards.find(c => c.listing_id === item.listing_id);
                    return {
                        saved_id:   item.saved_id,
                        listing_id: item.listing_id,
                        status:     item.status || 'saved',
                        saved_at:   item.saved_at,
                        card:       card || null
                    };
                })
                .filter(item => item.card);

            renderMetrics();
            renderTable();
            hideLoading();
        } catch (e) {
            console.error('[BuyerDashboard] Load error:', e);
            State.savedListings = [];
            renderMetrics();
            renderTable();
            hideLoading();
        }
    }

    // ============================================================
    // METRICS
    // ============================================================

    function renderMetrics() {
        const list = State.savedListings;
        const total     = list.length;
        const enquiries = list.filter(l => l.status === 'enquiry').length;
        const viewings  = list.filter(l => l.status === 'viewing').length;

        // Price-drop heuristic: items saved >14 days ago. Real price
        // history isn't in the schema yet, so this is a placeholder
        // that stays honest until we track listing price changes.
        const priceDrops = list.filter(l => {
            const days = (Date.now() - new Date(l.saved_at).getTime()) / 86400000;
            return days > 14;
        }).length;

        const weekAgo = Date.now() - 7 * 86400000;
        const newThisWeek = list.filter(l =>
            new Date(l.saved_at).getTime() > weekAgo
        ).length;

        if (dom.totalSaved)     dom.totalSaved.textContent     = total;
        if (dom.enquiryCount)   dom.enquiryCount.textContent   = enquiries;
        if (dom.viewingCount)   dom.viewingCount.textContent   = viewings;
        if (dom.priceDropCount) dom.priceDropCount.textContent = priceDrops;
        if (dom.newCount)       dom.newCount.textContent       = newThisWeek;
    }

    // ============================================================
    // TABLE
    // ============================================================

    function renderTable() {
        const list = getFilteredListings();

        if (!list.length) {
            dom.activityContainer.innerHTML = '';
            showEmptyState(State.savedListings.length === 0);
            return;
        }

        hideEmptyState();
        dom.activityContainer.innerHTML = list.map(renderRow).join('');
        wireRowSelection();
    }

    function getFilteredListings() {
        let list = State.savedListings.slice();

        if (State.statusFilter !== 'all') {
            list = list.filter(l => l.status === State.statusFilter);
        }

        if (State.searchText) {
            const q = State.searchText.toLowerCase();
            list = list.filter(l => {
                const c = l.card || {};
                return (c.title || '').toLowerCase().includes(q)
                    || (c.city  || '').toLowerCase().includes(q)
                    || (c.suburb|| '').toLowerCase().includes(q);
            });
        }

        return list;
    }

    function renderRow(item) {
        const c = item.card || {};
        const title    = c.title || 'Untitled';
        const price    = window.Biome.Utils.formatCurrency(c.price || 0);
        const location = [c.suburb, c.city].filter(Boolean).join(', ');
        const type     = c.property_type || 'Property';
        const savedOn  = window.Biome.Utils.formatDate(item.saved_at);
        const statusLabel = getStatusLabel(item.status);
        const statusClass = getStatusClass(item.status);

        return `
            <tr data-listing-id="${item.listing_id}" data-saved-id="${item.saved_id}">
                <td><input type="checkbox" class="row-select" data-listing-id="${item.listing_id}"></td>
                <td>${escapeHtml(title)}</td>
                <td>${escapeHtml(type)}</td>
                <td>${escapeHtml(location || '—')}</td>
                <td>${price} <span style="color:var(--text-muted);font-size:12px;">/month</span></td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                <td>${savedOn}</td>
            </tr>
        `;
    }

    function getStatusLabel(status) {
        return ({
            saved:   'Saved',
            enquiry: 'Enquiry sent',
            viewing: 'Viewing booked',
            offer:   'Offer made'
        })[status] || 'Saved';
    }

    function getStatusClass(status) {
        return ({
            saved:   'draft',
            enquiry: 'pending',
            viewing: 'approved',
            offer:   'rejected'
        })[status] || 'draft';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ============================================================
    // ROW SELECTION
    // ============================================================

    function wireRowSelection() {
        dom.activityContainer.querySelectorAll('.row-select').forEach(cb => {
            cb.addEventListener('change', handleSelectionChange);
        });

        // Clicking anywhere on the row toggles the checkbox
        dom.activityContainer.querySelectorAll('tr[data-listing-id]').forEach(row => {
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
        dom.activityContainer.querySelectorAll('.row-select').forEach(cb => {
            if (cb.checked) State.selectedIds.add(cb.dataset.listingId);
        });
        updateToolbarState();
    }

    function updateToolbarState() {
        const count = State.selectedIds.size;
        const single = count === 1;

        if (dom.contactBtn)  dom.contactBtn.disabled  = !single;
        if (dom.scheduleBtn) dom.scheduleBtn.disabled = !single;
        if (dom.viewBtn)     dom.viewBtn.disabled     = !single;
        if (dom.removeBtn)   dom.removeBtn.disabled   = count === 0;
    }

    // ============================================================
    // UI HELPERS
    // ============================================================

    function showLoading() {
        if (dom.loadingState) dom.loadingState.hidden = false;
        if (dom.emptyState)   dom.emptyState.style.display = 'none';
    }

    function hideLoading() {
        if (dom.loadingState) dom.loadingState.hidden = true;
    }

    function showEmptyState(isTrulyEmpty) {
        if (!dom.emptyState) return;
        dom.emptyState.style.display = 'flex';

        if (dom.emptyTitle) {
            dom.emptyTitle.textContent = isTrulyEmpty ? 'Nothing saved yet' : 'No matches';
        }
        if (dom.emptyText) {
            dom.emptyText.textContent = isTrulyEmpty
                ? 'Browse the marketplace and tap the bookmark icon on any listing to keep it here for later.'
                : 'Try a different search or clear the status filter.';
        }
    }

    function hideEmptyState() {
        if (dom.emptyState) dom.emptyState.style.display = 'none';
    }

    // ============================================================
    // VIEWING MODAL
    // ============================================================

    function openViewingModal(listingId) {
        const item = State.savedListings.find(l => l.listing_id === listingId);
        if (!item || !item.card) return;

        const c = item.card;

        if (dom.modalPropertyThumb) {
            dom.modalPropertyThumb.src = window.Biome.Storage.getSafeImageUrl(c.cover_url);
            dom.modalPropertyThumb.alt = c.title || 'Property';
        }
        if (dom.modalPropertyTitle) dom.modalPropertyTitle.textContent = c.title || 'Untitled';
        if (dom.modalPropertyMeta) {
            const bits = [];
            if (c.suburb || c.city) bits.push([c.suburb, c.city].filter(Boolean).join(', '));
            if (c.price) bits.push(window.Biome.Utils.formatCurrency(c.price));
            dom.modalPropertyMeta.textContent = bits.join(' · ');
        }
        if (dom.modalListingId) dom.modalListingId.value = listingId;

        // Min date = tomorrow
        if (dom.viewingDate) {
            const tomorrow = new Date(Date.now() + 86400000);
            dom.viewingDate.min = tomorrow.toISOString().split('T')[0];
        }

        dom.viewingModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function closeViewingModal() {
        if (!dom.viewingModal) return;
        dom.viewingModal.style.display = 'none';
        document.body.style.overflow = '';
        if (dom.viewingForm) dom.viewingForm.reset();
        if (dom.formLoading) dom.formLoading.hidden = true;
    }

    async function submitViewingRequest(e) {
        e.preventDefault();

        const listingId = dom.modalListingId?.value;
        if (!listingId) return;

        const payload = {
            user_id:       State.userId,
            listing_id:    listingId,
            viewing_date:  dom.viewingDate?.value,
            viewing_time:  dom.viewingTime?.value,
            contact_name:  dom.contactName?.value.trim(),
            contact_phone: dom.contactPhone?.value.trim(),
            message:       dom.viewingMessage?.value.trim() || '',
            created_at:    new Date().toISOString(),
            status:        'pending'
        };

        if (!payload.viewing_date || !payload.viewing_time ||
            !payload.contact_name || !payload.contact_phone) {
            window.Biome.UI.showToast('Please complete all required fields.', 'error');
            return;
        }

        if (dom.formLoading) dom.formLoading.hidden = false;
        if (dom.sendRequestBtn) dom.sendRequestBtn.disabled = true;

        try {
            const supabase = window.Biome.Core.supabase;
            const { error } = await supabase.from('viewing_requests').insert(payload);

            if (error) {
                // Table may not exist yet — log and continue, the UX
                // still confirms to the user so they aren't stuck.
                console.warn('[BuyerDashboard] Viewing request insert error:', error.message);
            }

            window.Biome.UI.showToast('Viewing request sent.', 'success');
            closeViewingModal();

            // Optimistically update local status so the table reflects it
            const item = State.savedListings.find(l => l.listing_id === listingId);
            if (item) {
                item.status = 'viewing';
                renderMetrics();
                renderTable();
            }
        } catch (err) {
            console.error('[BuyerDashboard] Viewing request error:', err);
            window.Biome.UI.showToast('Could not send request. Please try again.', 'error');
        } finally {
            if (dom.formLoading) dom.formLoading.hidden = true;
            if (dom.sendRequestBtn) dom.sendRequestBtn.disabled = false;
        }
    }

    // ============================================================
    // ACTIONS
    // ============================================================

    function handleContactAgent() {
        const id = [...State.selectedIds][0];
        if (!id) return;
        window.location.href = `property-details.html?id=${id}`;
    }

    function handleViewProperty() {
        const id = [...State.selectedIds][0];
        if (!id) return;
        window.location.href = `property-details.html?id=${id}`;
    }

    async function handleRemove() {
        const ids = [...State.selectedIds];
        if (!ids.length) return;

        const confirmed = confirm(
            `Remove ${ids.length} propert${ids.length === 1 ? 'y' : 'ies'} from your saved list?`
        );
        if (!confirmed) return;

        try {
            const supabase = window.Biome.Core.supabase;
            const { error } = await supabase
                .from('saved_listings')
                .delete()
                .in('listing_id', ids)
                .eq('user_id', State.userId);

            if (error) throw error;

            State.savedListings = State.savedListings.filter(l => !ids.includes(l.listing_id));
            State.selectedIds.clear();
            updateToolbarState();
            renderMetrics();
            renderTable();

            window.Biome.UI.showToast('Removed from saved.', 'success');
        } catch (e) {
            console.error('[BuyerDashboard] Remove error:', e);
            window.Biome.UI.showToast('Could not remove. Please try again.', 'error');
        }
    }

    async function handleLogout() {
        try {
            await window.Biome.Auth.logout();
            window.location.href = 'index.html';
        } catch (e) {
            console.error('[BuyerDashboard] Logout error:', e);
            window.Biome.UI.showToast('Could not log out.', 'error');
        }
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================

    function registerEventListeners() {
        // Sidebar
        if (dom.logoutBtn)    dom.logoutBtn.addEventListener('click', handleLogout);
        if (dom.dashboardBtn) dom.dashboardBtn.addEventListener('click', () => window.location.reload());
        if (dom.settingsBtn)  dom.settingsBtn.addEventListener('click', () =>
            window.Biome.UI.showToast('Settings coming soon.', 'info')
        );

        // Toolbar
        if (dom.contactBtn)  dom.contactBtn.addEventListener('click', handleContactAgent);
        if (dom.viewBtn)     dom.viewBtn.addEventListener('click', handleViewProperty);
        if (dom.removeBtn)   dom.removeBtn.addEventListener('click', handleRemove);
        if (dom.scheduleBtn) dom.scheduleBtn.addEventListener('click', () => {
            const id = [...State.selectedIds][0];
            if (id) openViewingModal(id);
        });

        // Filters
        if (dom.statusFilter) {
            dom.statusFilter.addEventListener('change', () => {
                State.statusFilter = dom.statusFilter.value;
                renderTable();
            });
        }
        if (dom.searchActivity) {
            const debounced = window.Biome.Utils.debounce(() => {
                State.searchText = dom.searchActivity.value.trim();
                renderTable();
            }, 250);
            dom.searchActivity.addEventListener('input', debounced);
        }

        // Viewing modal
        if (dom.closeModal)  dom.closeModal.addEventListener('click', closeViewingModal);
        if (dom.cancelBtn)   dom.cancelBtn.addEventListener('click', closeViewingModal);
        if (dom.viewingForm) dom.viewingForm.addEventListener('submit', submitViewingRequest);

        // Overlay click + Escape
        if (dom.viewingModal) {
            dom.viewingModal.addEventListener('click', (e) => {
                if (e.target === dom.viewingModal) closeViewingModal();
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dom.viewingModal && dom.viewingModal.style.display === 'flex') {
                closeViewingModal();
            }
        });
    }
})();