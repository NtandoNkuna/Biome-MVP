/* ============================================================
   BIOME V2 - Admin Dashboard
   Matches the real admin-dashboard.html markup.
   Views: pending / approved / rejected / all / users
   ============================================================ */

(function() {
    'use strict';

    if (window._biomeAdminDashboardInitialized) {
        console.warn('[AdminDashboard] Already initialized, skipping.');
        return;
    }
    window._biomeAdminDashboardInitialized = true;

    console.log('[AdminDashboard] Initializing...');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    const State = {
        profile:    null,
        userId:     null,
        view:       'pending',   // pending | approved | rejected | all | users
        listings:   [],          // latest full fetch
        searchText: ''
    };

    const dom = {};

    function cacheDom() {
        // Sidebar
        dom.adminName      = document.getElementById('adminName');
        dom.logoutBtn      = document.getElementById('logoutBtn');
        dom.pendingBadge   = document.getElementById('pendingBadge');
        dom.approvedBadge  = document.getElementById('approvedBadge');
        dom.rejectedBadge  = document.getElementById('rejectedBadge');

        // Header
        dom.pageTitle  = document.getElementById('pageTitle');
        dom.refreshBtn = document.getElementById('refreshBtn');

        // Metrics
        dom.totalCount    = document.getElementById('totalCount');
        dom.pendingCount  = document.getElementById('pendingCount');
        dom.approvedCount = document.getElementById('approvedCount');
        dom.rejectedCount = document.getElementById('rejectedCount');

        // Filters
        dom.searchInput  = document.getElementById('searchInput');
        dom.statusFilter = document.getElementById('statusFilter');

        // Listings
        dom.listingsContainer = document.getElementById('listingsContainer');
        dom.emptyState        = document.getElementById('emptyState');

        // Modal
        dom.detailModal  = document.getElementById('detailModal');
        dom.modalTitle   = document.getElementById('modalTitle');
        dom.modalBody    = document.getElementById('modalBody');
        dom.modalCloseBtn= document.getElementById('modalCloseBtn');
        dom.modalClose   = document.getElementById('modalClose');
    }

    async function init() {
        try {
            cacheDom();

            // Role guard — non-admins are bounced to index.html.
            if (!await window.Biome.Auth.requireRole('admin')) return;

            await loadProfile();
            wireSidebar();
            wireFilters();
            wireModal();

            await loadListings();

            console.log('[AdminDashboard] Ready.');
        } catch (e) {
            console.error('[AdminDashboard] Initialization error:', e);
            window.Biome.UI.showToast('Failed to load dashboard.', 'error');
        }
    }

    async function loadProfile() {
        const profile = await window.Biome.Auth.getCurrentProfile();
        if (!profile) return;
        State.profile = profile;
        State.userId  = profile.profile_id;

        if (dom.adminName) {
            const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
            dom.adminName.textContent = name || 'Administrator';
        }
    }

    // ---------------------------------------------------------
    // Sidebar views
    // ---------------------------------------------------------

    function wireSidebar() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                if (!view) return;
                setView(view);
            });
        });

        if (dom.logoutBtn) {
            dom.logoutBtn.addEventListener('click', async () => {
                try {
                    await window.Biome.Auth.logout();
                    window.location.href = 'index.html';
                } catch (e) {
                    window.Biome.UI.showToast('Could not log out.', 'error');
                }
            });
        }
    }

    function setView(view) {
        State.view = view;

        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.view === view);
        });

        const titles = {
            pending:  'Pending Reviews',
            approved: 'Published Listings',
            rejected: 'Rejected Listings',
            all:      'All Listings',
            users:    'Users'
        };
        if (dom.pageTitle) dom.pageTitle.textContent = titles[view] || 'Dashboard';

        if (dom.statusFilter) {
            dom.statusFilter.value = view === 'users' ? 'all' : view;
        }

        render();
    }

    // ---------------------------------------------------------
    // Filters
    // ---------------------------------------------------------

    function wireFilters() {
        if (dom.statusFilter) {
            dom.statusFilter.addEventListener('change', () => {
                State.view = dom.statusFilter.value;
                document.querySelectorAll('.nav-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.view === State.view);
                });
                render();
            });
        }

        if (dom.searchInput) {
            const debounced = window.Biome.Utils.debounce(() => {
                State.searchText = dom.searchInput.value.trim().toLowerCase();
                render();
            }, 250);
            dom.searchInput.addEventListener('input', debounced);
        }

        if (dom.refreshBtn) {
            dom.refreshBtn.addEventListener('click', loadListings);
        }
    }

    // ---------------------------------------------------------
    // Data load
    // ---------------------------------------------------------

    async function loadListings() {
        try {
            // Admin needs every status, not just approved. The public
            // `searchListings` default filter is 'approved' — passing
            // 'all' skips the constraint so the pending/rejected tabs
            // and metric counters have real data to render.
            const result = await window.Biome.Services.Listings.searchListings({
                status: 'all',
                page: 1,
                pageSize: 100,
                sortBy: 'newest'
            });

            State.listings = (result && result.data) ? result.data : [];

            // Hydrate cards for richer previews
            const ids = State.listings.map(l => l.listing_id);
            if (ids.length) {
                try {
                    const cards = await window.Biome.Services.Properties
                        .getPropertyCardsWithMedia(ids);
                    const byId = new Map(cards.map(c => [c.listing_id, c]));
                    State.listings = State.listings.map(l => ({
                        ...l,
                        card: byId.get(l.listing_id) || null
                    }));
                } catch (e) {
                    console.warn('[AdminDashboard] Card hydration failed:', e);
                }
            }

            updateMetrics();
            render();
        } catch (e) {
            console.error('[AdminDashboard] Load error:', e);
            State.listings = [];
            updateMetrics();
            render();
            window.Biome.UI.showToast('Could not load listings.', 'error');
        }
    }

    // ---------------------------------------------------------
    // Metrics
    // ---------------------------------------------------------

    function updateMetrics() {
        const counts = { pending: 0, approved: 0, rejected: 0, total: 0 };
        State.listings.forEach(l => {
            counts.total++;
            if (counts[l.status] !== undefined) counts[l.status]++;
        });

        if (dom.totalCount)    dom.totalCount.textContent    = counts.total;
        if (dom.pendingCount)  dom.pendingCount.textContent  = counts.pending;
        if (dom.approvedCount) dom.approvedCount.textContent = counts.approved;
        if (dom.rejectedCount) dom.rejectedCount.textContent = counts.rejected;

        if (dom.pendingBadge)  dom.pendingBadge.textContent  = counts.pending;
        if (dom.approvedBadge) dom.approvedBadge.textContent = counts.approved;
        if (dom.rejectedBadge) dom.rejectedBadge.textContent = counts.rejected;
    }

    // ---------------------------------------------------------
    // Render
    // ---------------------------------------------------------

    function render() {
        if (!dom.listingsContainer) return;

        if (State.view === 'users') {
            renderUsersPlaceholder();
            return;
        }

        const list = getFilteredListings();
        if (!list.length) {
            dom.listingsContainer.innerHTML = '';
            if (dom.emptyState) dom.emptyState.style.display = 'block';
            return;
        }
        if (dom.emptyState) dom.emptyState.style.display = 'none';

        dom.listingsContainer.innerHTML = list.map(renderCard).join('');

        // Wire clicks
        dom.listingsContainer.querySelectorAll('[data-listing-id]').forEach(card => {
            card.addEventListener('click', () => {
                openDetailModal(card.dataset.listingId);
            });
        });
    }

    function renderUsersPlaceholder() {
        if (!dom.listingsContainer) return;
        if (dom.emptyState) dom.emptyState.style.display = 'none';

        dom.listingsContainer.innerHTML = `
            <div class="empty-state" style="display:block;grid-column:1/-1;">
                <div class="empty-icon">👥</div>
                <h3>User management coming soon</h3>
                <p>User moderation tools are not yet available.</p>
            </div>
        `;
    }

    function getFilteredListings() {
        let out = State.listings.slice();

        if (State.view !== 'all') {
            out = out.filter(l => l.status === State.view);
        }

        if (State.searchText) {
            const q = State.searchText;
            out = out.filter(l => {
                const t = (l.title || '').toLowerCase();
                const sub = (l.suburb || '').toLowerCase();
                const c = (l.city || '').toLowerCase();
                return t.includes(q) || sub.includes(q) || c.includes(q);
            });
        }

        return out;
    }

    function renderCard(l) {
        const card = l.card || {};
        const title    = l.title || 'Untitled';
        const location = [l.suburb, l.city].filter(Boolean).join(', ') || '—';
        const price    = window.Biome.Utils.formatCurrency(l.price || 0);
        const status   = l.status || 'pending';
        const statusLabel = window.Biome.Utils.getStatusDisplay(status);
        const statusClass = window.Biome.Utils.getStatusClass(status);
        const cover    = card.cover_url
            ? window.Biome.Storage.getSafeImageUrl(card.cover_url)
            : window.Biome.Storage.getPlaceholderUrl();

        return `
            <article class="listing-card" data-listing-id="${l.listing_id}"
                     style="background:var(--surface);border:1px solid var(--border);
                            border-radius:14px;overflow:hidden;cursor:pointer;
                            transition:transform .2s ease, box-shadow .2s ease;">
                <div style="position:relative;height:150px;background:#E8EBE4;">
                    <img src="${cover}" alt="${escapeHtml(title)}"
                         style="width:100%;height:100%;object-fit:cover;display:block;">
                    <span class="status-badge ${statusClass}"
                          style="position:absolute;top:10px;left:10px;">
                        ${statusLabel}
                    </span>
                </div>
                <div style="padding:14px 16px 16px;">
                    <h3 style="font-size:14.5px;font-weight:700;margin:0 0 4px;
                               color:var(--text);">${escapeHtml(title)}</h3>
                    <p style="font-size:12px;color:var(--text-muted);margin:0 0 8px;">
                        ${escapeHtml(location)}
                    </p>
                    <div style="font-size:15px;font-weight:700;color:var(--primary);">
                        ${price} <span style="font-size:11px;font-weight:500;
                                              color:var(--text-muted);">/month</span>
                    </div>
                </div>
            </article>
        `;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ---------------------------------------------------------
    // Detail modal
    // ---------------------------------------------------------

    function wireModal() {
        const close = () => closeDetailModal();
        if (dom.modalCloseBtn) dom.modalCloseBtn.addEventListener('click', close);
        if (dom.modalClose)    dom.modalClose.addEventListener('click', close);

        if (dom.detailModal) {
            dom.detailModal.addEventListener('click', (e) => {
                if (e.target === dom.detailModal) close();
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dom.detailModal
                && dom.detailModal.style.display !== 'none') {
                close();
            }
        });
    }

    function openDetailModal(listingId) {
        const l = State.listings.find(x => x.listing_id === listingId);
        if (!l) return;

        const card = l.card || {};
        const cover = card.cover_url
            ? window.Biome.Storage.getSafeImageUrl(card.cover_url)
            : window.Biome.Storage.getPlaceholderUrl();
        const location = [l.suburb, l.city, l.province]
            .filter(Boolean).join(', ');

        if (dom.modalTitle) dom.modalTitle.textContent = l.title || 'Listing Details';

        if (dom.modalBody) {
            dom.modalBody.innerHTML = `
                <div style="margin-bottom:16px;">
                    <img src="${cover}" alt=""
                         style="width:100%;height:220px;object-fit:cover;
                                border-radius:10px;">
                </div>
                <div class="form-section">
                    <h3>Listing</h3>
                    <div style="font-size:13.5px;line-height:1.7;color:var(--text);">
                        <div><strong>Title:</strong> ${escapeHtml(l.title || '—')}</div>
                        <div><strong>Type:</strong> ${escapeHtml(l.property_type || '—')}</div>
                        <div><strong>Price:</strong> ${window.Biome.Utils.formatCurrency(l.price || 0)}</div>
                        <div><strong>Bedrooms:</strong> ${l.bedrooms || 0}</div>
                        <div><strong>Bathrooms:</strong> ${l.bathrooms || 0}</div>
                        <div><strong>Location:</strong> ${escapeHtml(location || '—')}</div>
                        <div><strong>Status:</strong> ${window.Biome.Utils.getStatusDisplay(l.status)}</div>
                        <div><strong>Submitted:</strong> ${window.Biome.Utils.formatDate(l.submitted_at)}</div>
                    </div>
                </div>
                <div class="form-section" style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button type="button" class="btn btn-primary"
                            id="approveListingBtn">
                        <i class="fa-solid fa-check"></i> Approve
                    </button>
                    <button type="button" class="btn btn-outline"
                            id="rejectListingBtn"
                            style="color:var(--danger);border-color:var(--red);">
                        <i class="fa-solid fa-times"></i> Reject
                    </button>
                </div>
            `;

            const approveBtn = document.getElementById('approveListingBtn');
            const rejectBtn  = document.getElementById('rejectListingBtn');

            if (approveBtn) {
                approveBtn.addEventListener('click', () =>
                    moderate(listingId, 'approved')
                );
            }
            if (rejectBtn) {
                rejectBtn.addEventListener('click', () =>
                    moderate(listingId, 'rejected')
                );
            }
        }

        if (dom.detailModal) {
            dom.detailModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    function closeDetailModal() {
        if (!dom.detailModal) return;
        dom.detailModal.style.display = 'none';
        document.body.style.overflow = '';
    }

    async function moderate(listingId, newStatus) {
        if (!State.userId) return;

        let reason = null;
        if (newStatus === 'rejected') {
            reason = window.prompt('Reason for rejection (optional):') || '';
        }

        try {
            if (newStatus === 'approved') {
                await window.Biome.Services.Listings.approveListing(
                    listingId, State.userId
                );
                window.Biome.UI.showToast('Listing approved.', 'success');
            } else {
                await window.Biome.Services.Listings.rejectListing(
                    listingId, State.userId, reason || 'No reason provided.'
                );
                window.Biome.UI.showToast('Listing rejected.', 'success');
            }

            closeDetailModal();
            await loadListings();
        } catch (e) {
            console.error('[AdminDashboard] Moderation error:', e);
            window.Biome.UI.showToast('Could not update listing.', 'error');
        }
    }
})();