/**
 * Srishti SDK Bundle Loader
 * 
 * Automatically loads all required blockchain and SDK files
 * Usage: <script src="loader.js"></script>
 * 
 * @version 1.0.0
 */

(function() {
    'use strict';
    
    const SDK_VERSION = '1.0.0';
    
    // Auto-detect base URL from loader.js location
    // This allows the loader to work from any subdirectory
    function getBaseUrl() {
        // Allow manual override
        if (window.SRISHTI_SDK_BASE_URL) {
            const url = window.SRISHTI_SDK_BASE_URL;
            return url.endsWith('/') ? url : url + '/';
        }
        
        // Find the loader.js script tag
        const scripts = document.getElementsByTagName('script');
        for (let i = scripts.length - 1; i >= 0; i--) {
            const script = scripts[i];
            if (script.src && script.src.includes('loader.js')) {
                try {
                    // Handle both absolute URLs and relative paths
                    let scriptPath;
                    if (script.src.startsWith('http://') || script.src.startsWith('https://') || script.src.startsWith('//')) {
                        // Absolute URL
                        const url = new URL(script.src);
                        scriptPath = url.pathname;
                    } else {
                        // Relative path - resolve it
                        const base = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
                        const url = new URL(script.src, base);
                        scriptPath = url.pathname;
                    }
                    
                    // Get the directory containing loader.js
                    const lastSlash = scriptPath.lastIndexOf('/');
                    if (lastSlash >= 0) {
                        return scriptPath.substring(0, lastSlash + 1);
                    }
                } catch (e) {
                    console.warn('Could not parse loader.js URL, using fallback:', e);
                    // Fallback: extract path from src string
                    const src = script.src;
                    const lastSlash = src.lastIndexOf('/');
                    if (lastSlash >= 0) {
                        return src.substring(0, lastSlash + 1);
                    }
                }
            }
        }
        
        // Fallback to current directory
        return './';
    }
    
    const BASE_URL = getBaseUrl();
    console.log('📍 SDK Base URL:', BASE_URL);
    
    // Core blockchain files (in dependency order)
    const CORE_SCRIPTS = [
        'core/core/Hasher.js',
        'core/core/Event.js',
        'core/core/MerkleTree.js',
        'core/core/BlockHeader.js',
        'core/core/BlockBody.js',
        'core/core/Block.js',
        'core/core/Chain.js',
        'core/core/KarmaManager.js',
        'core/core/LightClient.js',
        'core/crypto/Keys.js',
        'core/crypto/BIP39.js',
        'core/crypto/Recovery.js',
        'core/storage/IndexedDBStore.js',
        'core/consensus/ProofOfParticipation.js',
        'core/p2p/Protocol.js',
        'core/p2p/WebSocketClient.js',
        'core/p2p/Network.js',
        'core/ui/BlockchainAdapter.js',
        'config.js'
    ];
    
    // SDK files
    const SDK_SCRIPTS = [
        'sdk/SrishtiSDK.js',
        'sdk/AppDataStore.js',
        'sdk/index.js'
    ];
    
    /**
     * Load a script file
     */
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = BASE_URL + src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }
    
    /**
     * Initialize the blockchain
     */
    async function initBlockchain() {
        // Load main app.js which creates SrishtiApp instance
        await loadScript('app.js');
        
        // Wait for SrishtiApp instance to be available
        // Note: app.js creates an instance, not a class
        let retries = 0;
        while (!window.SrishtiApp && retries < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }
        
        if (!window.SrishtiApp) {
            throw new Error('SrishtiApp not found. Check if app.js loaded correctly.');
        }
        
        // app.js already creates an instance, so use it
        // But we need to make sure it's initialized
        const app = window.SrishtiApp;
        
        // Check if already initialized
        if (!app.initialized) {
            await app.init();
        }
        
        // Store reference for consistency
        window.srishtiAppInstance = app;
        
        return app;
    }
    
    /**
     * Main loader function
     */
    async function load() {
        try {
            console.log(`🚀 Loading Srishti SDK Bundle v${SDK_VERSION}...`);
            
            // Load core blockchain files
            console.log('📦 Loading blockchain core...');
            for (const src of CORE_SCRIPTS) {
                await loadScript(src);
            }
            console.log('✅ Blockchain core loaded');
            
            // Initialize blockchain
            console.log('🔗 Initializing blockchain...');
            const app = await initBlockchain();
            console.log('✅ Blockchain initialized');
            
            // Load SDK files
            console.log('🔧 Loading SDK...');
            for (const src of SDK_SCRIPTS) {
                await loadScript(src);
            }
            console.log('✅ SDK loaded');
            
            // Expose SDK helper
            window.SrishtiSDKLoader = {
                version: SDK_VERSION,
                app: app,
                ready: true,
                
                // Quick start helper
                async quickStart() {
                    const sdk = new window.SrishtiSDK();
                    await sdk.connect();
                    return sdk;
                }
            };
            
            // Trigger ready event
            window.dispatchEvent(new CustomEvent('srishti-sdk-ready', {
                detail: { app, version: SDK_VERSION }
            }));
            
            console.log('🎉 Srishti SDK Bundle ready!');
            console.log('   Use: window.SrishtiSDKLoader.quickStart()');
            
        } catch (error) {
            console.error('❌ Failed to load Srishti SDK Bundle:', error);
            throw error;
        }
    }
    
    // Auto-load if script is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', load);
    } else {
        load();
    }
})();
