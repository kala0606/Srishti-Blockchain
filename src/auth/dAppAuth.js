/**
 * dApp Authentication Helper
 * 
 * Simple authentication flow for dApps:
 * 1. Check for existing session token
 * 2. If valid, use it
 * 3. If invalid/missing, redirect to main app for login
 * 4. Main app generates token and redirects back
 */

class dAppAuth {
    /**
     * Authenticate with session token
     * @param {Chain} chain - Chain instance
     * @param {string} [expectedOrigin] - Expected origin for security
     * @returns {Promise<Object|null>} Token data if authenticated, null otherwise
     */
    static async authenticate(chain, expectedOrigin = null) {
        // Check for stored token
        const token = window.SrishtiSessionAuth.getStoredToken();
        
        if (!token) {
            return null;
        }
        
        // Verify token
        const tokenData = await window.SrishtiSessionAuth.verifyToken(
            token, 
            chain, 
            expectedOrigin
        );
        
        return tokenData;
    }
    
    /**
     * Initiate login flow - redirects to main app
     * @param {string} returnUrl - URL to return to after login
     * @param {string} [blockchainUrl] - Main blockchain app URL
     */
    static initiateLogin(returnUrl, blockchainUrl = null) {
        const url = blockchainUrl || window.SRISHTI_BLOCKCHAIN_URL || 'https://kala0606.github.io/Srishti-Blockchain/';
        const loginUrl = new URL(url);
        loginUrl.searchParams.set('dapp_login', 'true');
        loginUrl.searchParams.set('return_url', returnUrl);
        
        window.location.href = loginUrl.toString();
    }
    
    /**
     * Handle login callback (called after redirect from main app)
     * @param {Chain} chain - Chain instance
     * @returns {Promise<Object|null>} Token data if valid
     */
    static async handleLoginCallback(chain) {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('session_token');
        
        if (!token) {
            return null;
        }
        
        // Wait for chain to be fully loaded (node map built)
        // This ensures we can verify the token with the node's public key
        let retries = 0;
        while (chain.getLength() === 0 && retries < 30) {
            await new Promise(resolve => setTimeout(resolve, 200));
            retries++;
        }
        
        // Give chain a moment to build node map
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Verify and store token
        const tokenData = await window.SrishtiSessionAuth.verifyToken(token, chain);
        
        if (tokenData) {
            window.SrishtiSessionAuth.storeToken(token);
            
            // Clean up URL
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete('session_token');
            window.history.replaceState({}, '', cleanUrl.toString());
            
            return tokenData;
        }
        
        return null;
    }
    
    /**
     * Check if user is authenticated
     * @param {Chain} chain - Chain instance
     * @returns {Promise<boolean>}
     */
    static async isAuthenticated(chain) {
        const tokenData = await this.authenticate(chain);
        return tokenData !== null;
    }
    
    /**
     * Get authenticated node ID
     * @param {Chain} chain - Chain instance
     * @returns {Promise<string|null>}
     */
    static async getNodeId(chain) {
        const tokenData = await this.authenticate(chain);
        return tokenData ? tokenData.nodeId : null;
    }
    
    /**
     * Logout (clear token)
     */
    static logout() {
        window.SrishtiSessionAuth.clearToken();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = dAppAuth;
} else {
    window.SrishtiDAppAuth = dAppAuth;
}
