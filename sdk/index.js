/**
 * Srishti SDK - Entry Point
 * 
 * Load this file to get access to all SDK components.
 * 
 * In Browser:
 *   <script src="sdk/index.js"></script>
 *   // Then: window.SrishtiSDK, window.SrishtiAppDataStore, window.SrishtiAttendanceApp
 * 
 * In Node.js:
 *   const { SrishtiSDK, AppDataStore, AttendanceApp } = require('./sdk');
 * 
 * @version 1.0.0
 */

// Browser: Load all SDK components
if (typeof window !== 'undefined') {
    // Core SDK files should be loaded via script tags before this
    console.log('🔧 Srishti SDK loaded');
    console.log('   Available: SrishtiSDK, SrishtiAppDataStore, SrishtiAttendanceApp');
    
    // Quick start helper (only if SrishtiSDK is loaded)
    if (window.SrishtiSDK) {
        window.SrishtiSDK.quickStart = async function() {
            const sdk = new window.SrishtiSDK();
            await sdk.connect();
            console.log('✅ SDK connected:', sdk.nodeId);
            return sdk;
        };
    } else {
        console.warn('⚠️ SrishtiSDK not loaded yet. Make sure sdk/SrishtiSDK.js is loaded before sdk/index.js');
    }
}

// Node.js: Export all components
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SrishtiSDK: require('./SrishtiSDK'),
        AppDataStore: require('./AppDataStore'),
        AttendanceApp: require('./apps/attendance/AttendanceApp')
    };
}
