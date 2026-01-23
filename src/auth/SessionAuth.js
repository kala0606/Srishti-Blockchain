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
            // Decode token - handle potential URL encoding issues
            let decodedToken = tokenBase64;
            try {
                // Try to decode if it looks URL-encoded
                if (tokenBase64.includes('%')) {
                    decodedToken = decodeURIComponent(tokenBase64);
                }
            } catch (e) {
                // If decode fails, use original
                console.warn('⚠️ [SessionAuth] Could not URL-decode token, using as-is');
            }
            
            // Decode base64
            const tokenJson = atob(decodedToken);
            const token = JSON.parse(tokenJson);
            
            console.log('🔍 [SessionAuth] Token decoded:', {
                hasData: !!token.data,
                hasSignature: !!token.signature,
                nodeId: token.data?.nodeId,
                expiresAt: token.data?.expiresAt,
                currentTime: Date.now(),
                isExpired: token.data?.expiresAt < Date.now()
            });
            
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
            
            console.log('🔍 [SessionAuth] Node lookup:', {
                nodeId: token.data.nodeId,
                nodeExists: !!node,
                hasPublicKey: node ? !!node.publicKey : false,
                availableNodes: Object.keys(nodes),
                nodeName: node?.name
            });
            
            if (!node || !node.publicKey) {
                console.warn('❌ Node not found on chain or missing public key', {
                    nodeId: token.data.nodeId,
                    nodeExists: !!node,
                    hasPublicKey: node ? !!node.publicKey : false,
                    availableNodes: Object.keys(nodes).length,
                    allNodeIds: Object.keys(nodes)
                });
                return null;
            }
            
            // Import public key
            let publicKey;
            try {
                console.log('🔍 [SessionAuth] Importing public key:', {
                    nodeId: token.data.nodeId,
                    publicKeyType: typeof node.publicKey,
                    publicKeyLength: node.publicKey ? node.publicKey.length : 0,
                    publicKeyPreview: node.publicKey ? node.publicKey.substring(0, 30) + '...' : 'null'
                });
                
                publicKey = await window.SrishtiKeys.importPublicKey(node.publicKey);
                
                console.log('✅ [SessionAuth] Public key imported successfully:', {
                    publicKeyType: publicKey?.constructor?.name,
                    publicKeyAlgorithm: publicKey?.algorithm?.name
                });
            } catch (error) {
                console.error('❌ Failed to import public key:', error, {
                    nodeId: token.data.nodeId,
                    publicKeyFormat: typeof node.publicKey,
                    publicKeyLength: node.publicKey ? node.publicKey.length : 0,
                    publicKeyValue: node.publicKey,
                    errorMessage: error.message,
                    errorStack: error.stack
                });
                return null;
            }
            
            // Verify signature
            // IMPORTANT: We must stringify token.data in the exact same way it was stringified when signing
            // JSON.stringify should be deterministic, but let's ensure we're using the same method
            const tokenString = JSON.stringify(token.data);
            
            // Debug: Log the exact string being verified
            console.log('🔍 [SessionAuth] Token string for verification:', {
                tokenString: tokenString,
                tokenStringLength: tokenString.length,
                tokenDataKeys: Object.keys(token.data),
                tokenDataValues: Object.values(token.data).map(v => typeof v === 'string' ? v.substring(0, 20) + '...' : v)
            });
            
            // Validate signature format
            if (!token.signature || typeof token.signature !== 'string') {
                console.error('❌ [SessionAuth] Invalid signature format:', {
                    signatureType: typeof token.signature,
                    signatureValue: token.signature
                });
                return null;
            }
            
            // Check if signature is valid base64
            const base64Regex = /^[A-Za-z0-9+/=]+$/;
            if (!base64Regex.test(token.signature)) {
                console.error('❌ [SessionAuth] Signature is not valid base64:', {
                    signature: token.signature,
                    signatureLength: token.signature.length,
                    firstChars: token.signature.substring(0, 20),
                    lastChars: token.signature.substring(token.signature.length - 20)
                });
                return null;
            }
            
            // Debug: Log what we're verifying
            console.log('🔍 [SessionAuth] Verifying token signature', {
                nodeId: token.data.nodeId,
                tokenStringLength: tokenString.length,
                tokenStringPreview: tokenString.substring(0, 100) + '...',
                signatureLength: token.signature.length,
                signaturePreview: token.signature.substring(0, 20) + '...' + token.signature.substring(token.signature.length - 20),
                publicKeyType: publicKey ? publicKey.constructor?.name : 'null',
                tokenDataKeys: Object.keys(token.data)
            });
            
            // Try to verify - but first check if signature might be double-encoded
            let signatureToVerify = token.signature;
            
            // Check if signature looks like it might be double-base64-encoded
            // (if it's very long, it might be double-encoded)
            if (signatureToVerify.length > 100) {
                console.warn('⚠️ [SessionAuth] Signature is unusually long, might be double-encoded. Trying to decode...');
                try {
                    // Try decoding once to see if it's double-encoded
                    const decoded = atob(signatureToVerify);
                    // Check if decoded result looks like base64
                    if (/^[A-Za-z0-9+/=]+$/.test(decoded) && decoded.length > 20) {
                        console.log('🔍 [SessionAuth] Signature appears to be double-encoded, using decoded version');
                        signatureToVerify = decoded;
                    }
                } catch (e) {
                    console.log('🔍 [SessionAuth] Signature is not double-encoded, using as-is');
                }
            }
            
            console.log('🔍 [SessionAuth] Final verification attempt:', {
                tokenString: tokenString,
                signatureLength: signatureToVerify.length,
                signaturePreview: signatureToVerify.substring(0, 30) + '...' + signatureToVerify.substring(signatureToVerify.length - 10),
                publicKeyAvailable: !!publicKey
            });
            
            let isValid = false;
            let verifyError = null;
            try {
                isValid = await window.SrishtiKeys.verify(publicKey, tokenString, signatureToVerify);
                console.log('🔍 [SessionAuth] Verification result:', isValid);
            } catch (error) {
                verifyError = error;
                console.error('❌ [SessionAuth] Verification threw an error:', error);
                isValid = false;
            }
            
            if (!isValid) {
                // Try to get more info about why verification failed
                console.warn('❌ Token signature invalid', {
                    nodeId: token.data.nodeId,
                    tokenData: token.data,
                    signatureLength: token.signature ? token.signature.length : 0,
                    signatureBase64: token.signature,
                    signatureToVerifyLength: signatureToVerify.length,
                    signatureToVerify: signatureToVerify,
                    publicKeyAvailable: !!publicKey,
                    tokenString: tokenString,
                    // Check if signature looks valid (base64)
                    signatureIsBase64: token.signature ? /^[A-Za-z0-9+/=]+$/.test(token.signature) : false,
                    signatureToVerifyIsBase64: /^[A-Za-z0-9+/=]+$/.test(signatureToVerify),
                    verifyError: verifyError ? {
                        message: verifyError.message,
                        stack: verifyError.stack,
                        name: verifyError.name
                    } : null
                });
                
                // Additional diagnostic: Check if we can decode the signature bytes
                try {
                    const sigBytes = atob(signatureToVerify);
                    console.log('🔍 [SessionAuth] Signature bytes info:', {
                        byteLength: sigBytes.length,
                        expectedLength: 64, // Ed25519 signatures are 64 bytes
                        matchesExpected: sigBytes.length === 64
                    });
                } catch (e) {
                    console.error('❌ [SessionAuth] Cannot decode signature bytes:', e);
                }
                
                // Additional debug: try to verify with a test signature to see if the key works
                try {
                    const testData = 'test';
                    const testSig = await window.SrishtiKeys.sign(
                        // We can't test sign without private key, but we can check if verify function works
                        null, testData
                    ).catch(() => null);
                    console.log('🔍 [SessionAuth] Test signature generation:', testSig ? 'works' : 'failed (expected - no private key)');
                } catch (e) {
                    // Expected to fail
                }
                
                return null;
            }
            
            console.log('✅ [SessionAuth] Token signature verified successfully');
            
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
