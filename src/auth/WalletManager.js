/**
 * Srishti Wallet Manager
 * 
 * Manages wallet state and enforces login-first architecture.
 * The main blockchain app acts as a wallet that users must log into
 * before accessing any features or dApps.
 */

class WalletManager {
    constructor() {
        this.isAuthenticated = false;
        this.currentUser = null;
        this.app = null;
    }

    /**
     * Initialize wallet manager
     * @param {SrishtiApp} app - Main blockchain app instance
     */
    init(app) {
        this.app = app;
        this.checkAuthState();
    }

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    checkAuthState() {
        const nodeId = localStorage.getItem('srishti_node_id');
        const privateKey = localStorage.getItem('srishti_private_key');
        const publicKey = localStorage.getItem('srishti_public_key');

        // User is authenticated if they have all credentials
        this.isAuthenticated = !!(nodeId && privateKey && publicKey);

        if (this.isAuthenticated && this.app) {
            this.currentUser = {
                nodeId: nodeId,
                name: localStorage.getItem('srishti_node_name') || 'Unknown',
                hasPrivateKey: !!privateKey
            };
        }

        return this.isAuthenticated;
    }

    /**
     * Check if user needs to log in
     * @returns {boolean}
     */
    requiresLogin() {
        return !this.checkAuthState();
    }

    /**
     * Get current authenticated user
     * @returns {Object|null}
     */
    getCurrentUser() {
        if (!this.isAuthenticated) {
            return null;
        }
        return this.currentUser;
    }

    /**
     * Mark user as authenticated after login
     * @param {string} nodeId - Node ID
     * @param {string} name - Node name
     */
    setAuthenticated(nodeId, name) {
        this.isAuthenticated = true;
        this.currentUser = {
            nodeId: nodeId,
            name: name,
            hasPrivateKey: true
        };
    }

    /**
     * Logout - clear authentication
     */
    logout() {
        // Don't clear localStorage - just mark as not authenticated
        // This allows users to stay logged in across sessions
        // If they want to fully logout, they can clear browser data
        this.isAuthenticated = false;
        this.currentUser = null;
    }

    /**
     * Generate session token for dApp
     * @param {string} dAppUrl - dApp URL (must be absolute)
     * @returns {Promise<string>} Session token
     */
    async generateSessionTokenForDApp(dAppUrl) {
        if (!this.isAuthenticated || !this.app || !this.app.keyPair || !this.app.keyPair.privateKey) {
            throw new Error('Wallet not authenticated. Please log in first.');
        }

        if (!window.SrishtiSessionAuth) {
            throw new Error('SessionAuth not available');
        }

        try {
            // Ensure dAppUrl is an absolute URL
            let absoluteUrl = dAppUrl;
            if (!dAppUrl.startsWith('http://') && !dAppUrl.startsWith('https://')) {
                // If relative, convert to absolute using current origin
                const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
                absoluteUrl = new URL(dAppUrl, baseUrl).toString();
            }
            
            const dAppOrigin = new URL(absoluteUrl).origin;
            const token = await window.SrishtiSessionAuth.generateToken(
                this.app.nodeId,
                this.app.keyPair.privateKey,
                {
                    expiresIn: 24 * 60 * 60, // 24 hours
                    dAppOrigin: dAppOrigin
                }
            );

            return token;
        } catch (error) {
            console.error('Failed to generate session token:', error);
            throw new Error(`Failed to generate session token: ${error.message}`);
        }
    }

    /**
     * Launch a dApp with authentication
     * @param {string} dAppUrl - dApp URL (can be relative or absolute)
     * @param {boolean} [newWindow=true] - Open in new window
     */
    async launchDApp(dAppUrl, newWindow = true) {
        if (!this.isAuthenticated) {
            throw new Error('Please log in to access dApps');
        }

        try {
            // Ensure dAppUrl is an absolute URL
            let absoluteUrl = dAppUrl;
            if (!dAppUrl.startsWith('http://') && !dAppUrl.startsWith('https://')) {
                // If relative, convert to absolute using current origin
                const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
                absoluteUrl = new URL(dAppUrl, baseUrl).toString();
            }
            
            // Generate session token (uses absoluteUrl internally)
            const token = await this.generateSessionTokenForDApp(absoluteUrl);

            // Add token to URL
            const url = new URL(absoluteUrl);
            url.searchParams.set('session_token', token);

            // Launch dApp
            if (newWindow) {
                window.open(url.toString(), '_blank');
            } else {
                window.location.href = url.toString();
            }
        } catch (error) {
            console.error('Failed to launch dApp:', error);
            throw error;
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WalletManager;
} else {
    window.SrishtiWalletManager = WalletManager;
}
