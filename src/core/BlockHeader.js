/**
 * Srishti Blockchain - Block Header
 * 
 * Represents the header of a block containing:
 * - previousHash: Hash of the previous block
 * - timestamp: Block creation timestamp
 * - nonce: Proof-of-work nonce (or other consensus value)
 * - merkleRoot: Root of the Merkle tree of transactions
 */

class BlockHeader {
    /**
     * Create a new block header
     * @param {Object} params
     * @param {string} params.previousHash - Hash of previous block
     * @param {number} params.timestamp - Block timestamp
     * @param {number} params.nonce - Nonce value
     * @param {string} params.merkleRoot - Merkle root of transactions
     */
    constructor(params) {
        this.previousHash = params.previousHash || null;
        this.timestamp = params.timestamp || Date.now();
        this.nonce = params.nonce || 0;
        this.merkleRoot = params.merkleRoot || null;
    }

    /**
     * Compute the hash of this header
     * @returns {Promise<string>} Header hash
     */
    async computeHash() {
        if (!window.SrishtiHasher) {
            throw new Error('SrishtiHasher not loaded');
        }

        const headerData = {
            previousHash: this.previousHash,
            timestamp: this.timestamp,
            nonce: this.nonce,
            merkleRoot: this.merkleRoot
        };

        return await window.SrishtiHasher.hash(JSON.stringify(headerData));
    }

    /**
     * Serialize header to JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            previousHash: this.previousHash,
            timestamp: this.timestamp,
            nonce: this.nonce,
            merkleRoot: this.merkleRoot
        };
    }

    /**
     * Create a BlockHeader from JSON
     * @param {Object} json
     * @returns {BlockHeader}
     */
    static fromJSON(json) {
        return new BlockHeader({
            previousHash: json.previousHash,
            timestamp: json.timestamp,
            nonce: json.nonce,
            merkleRoot: json.merkleRoot
        });
    }

    /**
     * Validate header structure
     * @returns {boolean}
     */
    isValid() {
        if (this.timestamp === undefined || this.timestamp === null) return false;
        if (this.nonce === undefined || this.nonce === null) return false;
        if (!this.merkleRoot) return false;
        // previousHash can be null for genesis block
        return true;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BlockHeader;
} else {
    window.SrishtiBlockHeader = BlockHeader;
}
