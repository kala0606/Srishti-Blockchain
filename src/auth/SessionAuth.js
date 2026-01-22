/**
 * Srishti Session Authentication
 * 
 * Secure authentication system for dApps that don't store private keys.
 * Uses signed session tokens that can be verified using public keys from the chain.
 * 
 * Architecture:
 * - Main blockchain app stores private keys securely
 * - Generates signed session tokens for dApps
 * - dApps verify tokens using public keys from chain
 * - For signing transactions, dApps request signatures from main app via postMessage
 */

class SessionAuth {
    /**
     * Generate a session token for a dApp
     * @param {string} nodeId - Node ID
     * @param {CryptoKey} privateKey - Private key to sign the token
     * @param {Object} options - Token options
     * @param {number} [options.expiresIn] - Expiration time in seconds (default: 24 hours)
     * @param {string} [options.dAppOrigin] - Origin of the dApp (for security)
     * @returns {Promise<string>} Base64-encoded session token
     */
    static async generateToken(nodeId, privateKey, options = {}) {
        try {
            if (!nodeId) {
                throw new Error('nodeId is required');
            }
            
            if (!privateKey) {
                throw new Error('privateKey is required');
            }
            
            if (!window.SrishtiKeys) {
                throw new Error('SrishtiKeys library not loaded');
            }
            
            const expiresIn = options.expiresIn || 24 * 60 * 60; // 24 hours default
            const expiresAt = Date.now() + (expiresIn * 1000);
            const nonce = crypto.getRandomValues(new Uint8Array(16));
            const nonceBase64 = btoa(String.fromCharCode(...nonce));
            
            const tokenData = {
                nodeId: nodeId,
                expiresAt: expiresAt,
                nonce: nonceBase64,
                dAppOrigin: options.dAppOrigin || null,
                issuedAt: Date.now()
            };
            
            // Sign the token data
            const tokenString = JSON.stringify(tokenData);
            
            if (typeof window.SrishtiKeys.sign !== 'function') {
                throw new Error('SrishtiKeys.sign is not a function');
            }
            
            const signature = await window.SrishtiKeys.sign(privateKey, tokenString);
            
            if (!signature) {
                throw new Error('Signature generation returned null or undefined');
            }
            
            // Create token object
            const token = {
                data: tokenData,
                signature: signature
            };
            
            // Encode as base64
            const tokenJson = JSON.stringify(token);
            return btoa(tokenJson);
        } catch (error) {
            console.error('SessionAuth.generateToken error:', error);
            throw new Error(`Failed to generate session token: ${error.message}`);
        }
    }
    
    /**
     * Verify a session token
     * @param {string} tokenBase64 - Base64-encoded token
     * @param {Chain} chain - Chain instance to get public key from
     * @param {string} [expectedOrigin] - Expected dApp origin (optional)
     * @returns {Promise<Object>} Decoded token data if valid, null if invalid
     */
    static async verifyToken(tokenBase64, chain, expectedOrigin = null) {
        try {
            // Decode token
            const tokenJson = atob(tokenBase64);
            const token = JSON.parse(tokenJson);
            
            if (!token.data || !token.signature) {
                return null;
            }
            
            // Check expiration
            if (token.data.expiresAt < Date.now()) {
                console.warn('Session token expired');
                return null;
            }
            
            // Check origin if provided
            if (expectedOrigin && token.data.dAppOrigin && token.data.dAppOrigin !== expectedOrigin) {
                console.warn('Token origin mismatch');
                return null;
            }
            
            // Get public key from chain
            const nodes = chain.buildNodeMap();
            const node = nodes[token.data.nodeId];
            
            if (!node || !node.publicKey) {
                console.warn('Node not found on chain or missing public key', {
                    nodeId: token.data.nodeId,
                    nodeExists: !!node,
                    hasPublicKey: node ? !!node.publicKey : false,
                    availableNodes: Object.keys(nodes).length
                });
                return null;
            }
            
            // Import public key
            let publicKey;
            try {
                publicKey = await window.SrishtiKeys.importPublicKey(node.publicKey);
            } catch (error) {
                console.error('Failed to import public key:', error, {
                    nodeId: token.data.nodeId,
                    publicKeyFormat: typeof node.publicKey,
                    publicKeyLength: node.publicKey ? node.publicKey.length : 0
                });
                return null;
            }
            
            // Verify signature
            const tokenString = JSON.stringify(token.data);
            const isValid = await window.SrishtiKeys.verify(publicKey, tokenString, token.signature);
            
            if (!isValid) {
                console.warn('Token signature invalid', {
                    nodeId: token.data.nodeId,
                    tokenData: token.data,
                    signatureLength: token.signature ? token.signature.length : 0,
                    publicKeyAvailable: !!publicKey
                });
                return null;
            }
            
            return token.data;
        } catch (error) {
            console.error('Token verification failed:', error);
            return null;
        }
    }
    
    /**
     * Store token in sessionStorage (cleared on browser close)
     * @param {string} token - Token to store
     * @param {string} [key] - Storage key (default: 'srishti_session_token')
     */
    static storeToken(token, key = 'srishti_session_token') {
        sessionStorage.setItem(key, token);
    }
    
    /**
     * Get stored token from sessionStorage
     * @param {string} [key] - Storage key (default: 'srishti_session_token')
     * @returns {string|null} Stored token or null
     */
    static getStoredToken(key = 'srishti_session_token') {
        return sessionStorage.getItem(key);
    }
    
    /**
     * Clear stored token
     * @param {string} [key] - Storage key (default: 'srishti_session_token')
     */
    static clearToken(key = 'srishti_session_token') {
        sessionStorage.removeItem(key);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionAuth;
} else {
    window.SrishtiSessionAuth = SessionAuth;
}
