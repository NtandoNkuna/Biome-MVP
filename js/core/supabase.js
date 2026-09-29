/* ============================================================
   BIOME V2 - Core Supabase Client
   Single instance, zero side effects
   ============================================================ */

(function() {
    'use strict';

    // Prevent multiple initialization
    if (window.Biome?.Core?.supabase) {
        console.warn('[Supabase] Already initialized, skipping.');
        return;
    }

    const SUPABASE_URL = 'https://cwatxxamkoukctwijomr.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3YXR4eGFta291a2N0d2lqb21yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMDU0NDYsImV4cCI6MjA5OTY4MTQ0Nn0.rfVtSuJK5xgmHCinKHbni0DLazedmvW6yKQaVTBD3PM';

    // Ensure Supabase SDK is loaded
    if (typeof window.supabase === 'undefined') {
        throw new Error('[Supabase] Supabase SDK not loaded. Please include the SDK before this script.');
    }

    // Create the single Supabase client
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Initialize namespace
    window.Biome = window.Biome || {};
    window.Biome.Core = window.Biome.Core || {};
    window.Biome.Core.supabase = supabaseClient;

    console.log('[Supabase] Client initialized successfully.');
})();