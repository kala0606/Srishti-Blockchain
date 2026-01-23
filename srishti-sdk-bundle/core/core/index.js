/**
 * Srishti Blockchain - Core Module Loader
 * 
 * Loads all core blockchain components in the correct order.
 * Include this file in your HTML to initialize the blockchain.
 */

// Load order is important!
// 1. Hasher (needed by Block)
// 2. Event (needed by Chain)
// 3. Block (needed by Chain)
// 4. Chain (depends on all above)

(function() {
    console.log('🌱 Loading Srishti Blockchain Core...');
    
    // Check dependencies
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        console.error('❌ Web Crypto API not available. HTTPS required for production.');
        return;
    }
    
    if (typeof indexedDB === 'undefined') {
        console.error('❌ IndexedDB not available in this browser.');
        return;
    }
    
    console.log('✅ Srishti Blockchain Core loaded');
})();
