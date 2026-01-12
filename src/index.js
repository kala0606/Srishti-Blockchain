/**
 * Srishti Blockchain - Main Entry Point
 * 
 * Initializes all components and provides the main Srishti API.
 */

(function() {
    'use strict';
    
    console.log('🌱 Initializing Srishti Blockchain...');
    
    // Check dependencies
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        console.error('❌ Web Crypto API not available. HTTPS required for production.');
        return;
    }
    
    if (typeof indexedDB === 'undefined') {
        console.error('❌ IndexedDB not available in this browser.');
        return;
    }
    
    if (typeof RTCPeerConnection === 'undefined') {
        console.warn('⚠️ WebRTC not available. P2P features will be limited.');
    }
    
    console.log('✅ Srishti Blockchain initialized');
    
    // Export global namespace
    window.Srishti = {
        version: '1.0.0',
        initialized: true
    };
})();
