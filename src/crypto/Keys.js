/**
 * Srishti Blockchain - Cryptographic Keys
 * 
 * Generates and manages Ed25519 key pairs for node identity.
 * Each node has a unique key pair used for signing blocks and events.
 */

class KeyManager {
    /**
     * Generate a new Ed25519 key pair
     * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey}>}
     */
    static async generateKeyPair() {
        const keyPair = await crypto.subtle.generateKey(
            {
                name: 'Ed25519',
                namedCurve: 'Ed25519'
            },
            true, // extractable
            ['sign', 'verify']
        );
        
        return keyPair;
    }
    
    /**
     * Export public key to raw bytes
     * @param {CryptoKey} publicKey
     * @returns {Promise<Uint8Array>}
     */
    static async exportPublicKey(publicKey) {
        return await crypto.subtle.exportKey('raw', publicKey);
    }
    
    /**
     * Export public key to base64 string
     * @param {CryptoKey} publicKey
     * @returns {Promise<string>}
     */
    static async exportPublicKeyBase64(publicKey) {
        const raw = await this.exportPublicKey(publicKey);
        const base64 = btoa(String.fromCharCode(...new Uint8Array(raw)));
        return base64;
    }
    
    /**
     * Import public key from base64
     * @param {string} base64Key
     * @returns {Promise<CryptoKey>}
     */
    static async importPublicKey(base64Key) {
        const binary = atob(base64Key);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        
        return await crypto.subtle.importKey(
            'raw',
            bytes,
            {
                name: 'Ed25519',
                namedCurve: 'Ed25519'
            },
            true,
            ['verify']
        );
    }
    
    /**
     * Export private key to base64 (for storage)
     * @param {CryptoKey} privateKey
     * @returns {Promise<string>}
     */
    static async exportPrivateKeyBase64(privateKey) {
        const raw = await crypto.subtle.exportKey('pkcs8', privateKey);
        const base64 = btoa(String.fromCharCode(...new Uint8Array(raw)));
        return base64;
    }
    
    /**
     * Import private key from base64
     * @param {string} base64Key
     * @returns {Promise<CryptoKey>}
     */
    static async importPrivateKey(base64Key) {
        const binary = atob(base64Key);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        
        return await crypto.subtle.importKey(
            'pkcs8',
            bytes,
            {
                name: 'Ed25519',
                namedCurve: 'Ed25519'
            },
            true,
            ['sign']
        );
    }
    
    /**
     * Sign data with private key
     * @param {CryptoKey} privateKey
     * @param {string|Object} data - Data to sign
     * @returns {Promise<string>} - Base64-encoded signature
     */
    static async sign(privateKey, data) {
        const dataString = typeof data === 'string' ? data : JSON.stringify(data);
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(dataString);
        
        const signature = await crypto.subtle.sign(
            'Ed25519',
            privateKey,
            dataBuffer
        );
        
        const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
        return base64;
    }
    
    /**
     * Verify signature with public key
     * @param {CryptoKey} publicKey
     * @param {string|Object} data - Original data
     * @param {string} signature - Base64-encoded signature
     * @returns {Promise<boolean>}
     */
    static async verify(publicKey, data, signature) {
        const dataString = typeof data === 'string' ? data : JSON.stringify(data);
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(dataString);
        
        const binary = atob(signature);
        const signatureBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            signatureBytes[i] = binary.charCodeAt(i);
        }
        
        try {
            return await crypto.subtle.verify(
                'Ed25519',
                publicKey,
                signatureBytes,
                dataBuffer
            );
        } catch (e) {
            return false;
        }
    }
    
    /**
     * Generate a node ID from public key (deterministic)
     * @param {CryptoKey} publicKey
     * @returns {Promise<string>}
     */
    static async generateNodeId(publicKey) {
        const raw = await this.exportPublicKey(publicKey);
        const hash = await crypto.subtle.digest('SHA-256', raw);
        const hashArray = Array.from(new Uint8Array(hash));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return 'node_' + hashHex.substring(0, 16);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KeyManager;
} else {
    window.SrishtiKeys = KeyManager;
}
