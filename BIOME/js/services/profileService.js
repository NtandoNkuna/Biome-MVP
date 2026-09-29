/* ============================================================
   BIOME V2 - Profile Service
   Updated for actual schema
   ============================================================ */

(function() {
    'use strict';

    if (window.Biome?.Services?.Profiles) {
        console.warn('[ProfileService] Already initialized, skipping.');
        return;
    }

    if (!window.Biome?.Core?.supabase) {
        throw new Error('[ProfileService] Supabase not initialized.');
    }

    const supabase = window.Biome.Core.supabase;

    const ProfileService = {

        /**
         * Get a profile by profile_id
         * @param {string} profileId - Profile ID (matches auth.users.id)
         * @returns {Promise<Object|null>} Profile object
         */
        getProfile: async function(profileId) {
            const { data, error } = await supabase
                .from('profiles')
                .select('profile_id, account_type, first_name, last_name, company_name, phone, profile_photo, is_active, created_at, updated_at, chat_link')
                .eq('profile_id', profileId)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        /**
         * Get seller profile with formatted name.
         *
         * Note on failure modes: `maybeSingle()` returns `data: null`
         * both when the seller row does not exist AND when RLS filters
         * it out. The two are indistinguishable from the response
         * alone. Callers that need to distinguish (e.g. to explain why
         * a chat link is missing) should check `Biome.Auth.getSession()`
         * to see whether the current user is authenticated; an
         * anonymous request that returns null strongly implies RLS is
         * blocking public read of seller rows.
         *
         * @param {string} sellerId - Seller's profile_id
         * @returns {Promise<Object|null>} Seller profile, or null
         */
        getSeller: async function(sellerId) {
            const { data, error } = await supabase
                .from('profiles')
                .select('profile_id, first_name, last_name, company_name, phone, profile_photo, is_active, chat_link')
                .eq('profile_id', sellerId)
                .eq('account_type', 'seller')
                .maybeSingle();

            if (error) throw error;

            if (!data) {
                // Distinguish "RLS filtered" from "genuinely absent"
                // by checking whether an unauthenticated request is
                // being made. This is advisory only — the caller
                // decides whether to surface it.
                const session = await window.Biome.Auth.getSession();
                if (!session) {
                    console.warn(
                        '[ProfileService] getSeller returned null for an ' +
                        'anonymous request. If this seller exists, the ' +
                        'profiles RLS policy is likely blocking public reads. ' +
                        'See the "Public can view active sellers" policy.'
                    );
                }
                return null;
            }

            data.full_name   = `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Property Owner';
            data.is_verified = data.is_active || false;
            data.avatar_url  = data.profile_photo || null;

            return data;
        },

        /**
         * Update a profile
         * @param {string} profileId - Profile ID
         * @param {Object} data - Profile data to update
         * @returns {Promise<Object>} Updated profile
         */
        updateProfile: async function(profileId, data) {
            const { data: profile, error } = await supabase
                .from('profiles')
                .update({
                    first_name: data.first_name,
                    last_name: data.last_name,
                    company_name: data.company_name,
                    phone: data.phone,
                    profile_photo: data.profile_photo,
                    updated_at: new Date().toISOString(),
                    chat_link: data.chat_link
                })
                .eq('profile_id', profileId)
                .select()
                .single();

            if (error) throw error;
            return profile;
        },

        /**
         * Get all sellers (for admin)
         * @param {Object} options - Query options
         * @returns {Promise<Array>} List of sellers
         */
        getSellers: async function(options = {}) {
            const { limit = 100, offset = 0 } = options;

            const { data, error } = await supabase
                .from('profiles')
                .select('profile_id, first_name, last_name, company_name, phone, profile_photo, is_active, created_at, chat_link')
                .eq('account_type', 'seller')
                .range(offset, offset + limit - 1);

            if (error) throw error;
            return data || [];
        },

        /**
         * Check if a user is active/verified
         * @param {string} profileId - Profile ID
         * @returns {Promise<boolean>} True if active
         */
        isActive: async function(profileId) {
            const profile = await this.getProfile(profileId);
            return profile?.is_active || false;
        },

        /**
         * Set user active status (admin only)
         * @param {string} profileId - Profile ID
         * @param {boolean} active - Active status
         * @returns {Promise<Object>} Updated profile
         */
        setActiveStatus: async function(profileId, active = true) {
            const { data, error } = await supabase
                .from('profiles')
                .update({
                    is_active: active,
                    updated_at: new Date().toISOString()
                })
                .eq('profile_id', profileId)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        /**
         * Get profile by email (requires auth.users access)
         * @param {string} email - Email address
         * @returns {Promise<Object|null>} Profile object
         */
        getProfileByEmail: async function(email) {
            // Note: Email is in auth.users, not profiles
            // This requires admin access to auth.users
            try {
                const { data: user, error } = await supabase
                    .from('auth.users')
                    .select('id, email')
                    .eq('email', email.toLowerCase())
                    .maybeSingle();

                if (error || !user) return null;

                return await this.getProfile(user.id);
            } catch (e) {
                console.warn('[ProfileService] Cannot access auth.users:', e);
                return null;
            }
        }
    };

    window.Biome = window.Biome || {};
    window.Biome.Services = window.Biome.Services || {};
    window.Biome.Services.Profiles = ProfileService;

    console.log('[ProfileService] Initialized successfully.');
})();