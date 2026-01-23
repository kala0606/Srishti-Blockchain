/**
 * Srishti Blockchain - Cryptographic Hasher
 * 
 * Provides SHA-256 hashing using Web Crypto API.
 * All hashing in the blockchain uses this utility.
 */

class Hasher {
    /**
     * Hash data using SHA-256
     * @param {string|Object} data - Data to hash (will be JSON stringified if object)
     * @returns {Promise<string>} - Hex-encoded hash
     */
    static async hash(data) {
        const dataString = typeof data === 'string' ? data : JSON.stringify(data);
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(dataString);
        
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        return hashHex;
    }
    
    /**
     * Hash a block's data
     * @param {Object} blockData - Block data object
     * @returns {Promise<string>} - Block hash
     */
    static async hashBlock(blockData) {
        const { index, timestamp, previousHash, data, proposer, participationProof } = blockData;
        
        // Create a canonical representation (important for consistent hashing)
        const blockString = JSON.stringify({
            index,
            timestamp,
            previousHash,
            data,
            proposer,
            participationProof
        });
        
        return await this.hash(blockString);
    }
    
    /**
     * Create a hash chain (hash of previous hash + new data)
     * @param {string} previousHash - Previous block's hash
     * @param {Object} newData - New data to add
     * @returns {Promise<string>} - New hash
     */
    static async hashChain(previousHash, newData) {
        const combined = previousHash + JSON.stringify(newData);
        return await this.hash(combined);
    }
    
    /**
     * Verify a hash matches expected value
     * @param {string} data - Data to hash
     * @param {string} expectedHash - Expected hash value
     * @returns {Promise<boolean>}
     */
    static async verify(data, expectedHash) {
        const computedHash = await this.hash(data);
        return computedHash === expectedHash;
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Hasher;
} else {
    window.SrishtiHasher = Hasher;
}
