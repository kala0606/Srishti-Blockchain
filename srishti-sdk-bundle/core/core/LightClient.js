/**
 * Srishti Blockchain - Light Client (SPV Mode)
 * 
 * Implements Simplified Payment Verification (SPV) for light clients.
 * Light clients only store block headers, not full blocks.
 */

class LightClient {
    /**
     * Create a new light client
     * @param {Object} options
     * @param {IndexedDBStore} options.storage - Storage instance for headers
     */
    constructor(options) {
        this.storage = options.storage;
        this.headers = []; // Array of BlockHeader objects
        this.headerHashes = new Map(); // Map<hash, index> for quick lookup
    }

    /**
     * Initialize the light client
     * Load headers from storage
     * @returns {Promise<void>}
     */
    async init() {
        if (!window.SrishtiBlockHeader) {
            throw new Error('SrishtiBlockHeader not loaded');
        }

        // Load headers from storage
        const storedHeaders = await this.storage.getAllHeaders();
        if (storedHeaders.length > 0) {
            this.headers = storedHeaders.map(h => window.SrishtiBlockHeader.fromJSON(h));
            // Compute hashes for all headers
            for (let i = 0; i < this.headers.length; i++) {
                const header = this.headers[i];
                const hash = await header.computeHash();
                this.headerHashes.set(hash, i);
            }
        }
    }

    /**
     * Verify a transaction using Merkle proof
     * @param {Object} transaction - Transaction/event object to verify
     * @param {Object} proof - Merkle proof object from full node
     * @param {Object} blockHeader - Block header JSON object
     * @returns {Promise<boolean>} - True if verification succeeds
     */
    async verifyTransaction(transaction, proof, blockHeader) {
        if (!window.SrishtiMerkleTree || !window.SrishtiBlockHeader) {
            throw new Error('Required dependencies not loaded');
        }

        // Validate block header structure
        const header = window.SrishtiBlockHeader.fromJSON(blockHeader);
        if (!header.isValid()) {
            return false;
        }

        // Verify Merkle proof
        const isValid = await window.SrishtiMerkleTree.verifyProof(
            transaction,
            proof,
            header.merkleRoot
        );

        return isValid;
    }

    /**
     * Add a block header to the light client chain
     * @param {Object|BlockHeader} headerData - Header JSON or BlockHeader object
     * @returns {Promise<boolean>} - Success status
     */
    async addHeader(headerData) {
        if (!window.SrishtiBlockHeader) {
            throw new Error('SrishtiBlockHeader not loaded');
        }

        let header;
        if (headerData instanceof window.SrishtiBlockHeader) {
            header = headerData;
        } else {
            header = window.SrishtiBlockHeader.fromJSON(headerData);
        }

        // Validate header
        if (!header.isValid()) {
            throw new Error('Invalid block header');
        }

        // Verify previous hash (if not genesis)
        if (this.headers.length > 0) {
            const previousHeader = this.headers[this.headers.length - 1];
            const previousHash = await previousHeader.computeHash();
            if (header.previousHash !== previousHash) {
                throw new Error('Previous hash mismatch');
            }
        } else {
            // Genesis block - previousHash should be null
            if (header.previousHash !== null) {
                throw new Error('Genesis block must have null previousHash');
            }
        }

        // Add header
        this.headers.push(header);
        const headerHash = await header.computeHash();
        this.headerHashes.set(headerHash, this.headers.length - 1);

        // Save to storage
        await this.storage.saveHeader(this.headers.length - 1, header.toJSON());

        return true;
    }

    /**
     * Sync headers from a full node
     * @param {Function} requestHeaders - Function to request headers from peer
     * @param {number} fromIndex - Starting index (default: current length)
     * @returns {Promise<number>} - Number of headers synced
     */
    async syncHeaders(requestHeaders, fromIndex = null) {
        if (fromIndex === null) {
            fromIndex = this.headers.length;
        }

        try {
            // Request headers from peer
            const headers = await requestHeaders(fromIndex);
            if (!headers || headers.length === 0) {
                return 0;
            }

            let synced = 0;
            for (const headerData of headers) {
                try {
                    await this.addHeader(headerData);
                    synced++;
                } catch (error) {
                    console.error('Failed to add header:', error);
                    break; // Stop on first error
                }
            }

            return synced;
        } catch (error) {
            console.error('Header sync failed:', error);
            return synced;
        }
    }

    /**
     * Get header by index
     * @param {number} index
     * @returns {BlockHeader|null}
     */
    getHeader(index) {
        if (index < 0 || index >= this.headers.length) {
            return null;
        }
        return this.headers[index];
    }

    /**
     * Get header by hash
     * @param {string} hash
     * @returns {BlockHeader|null}
     */
    async getHeaderByHash(hash) {
        const index = this.headerHashes.get(hash);
        if (index !== undefined) {
            return this.headers[index];
        }
        return null;
    }

    /**
     * Get latest header
     * @returns {BlockHeader|null}
     */
    getLatestHeader() {
        if (this.headers.length === 0) return null;
        return this.headers[this.headers.length - 1];
    }

    /**
     * Get chain length (number of headers)
     * @returns {number}
     */
    getLength() {
        return this.headers.length;
    }

    /**
     * Verify transaction with full proof data from full node
     * This is a convenience method that extracts header from proof data
     * @param {Object} transaction - Transaction to verify
     * @param {Object} proofData - Full proof data from Chain.generateMerkleProof
     * @returns {Promise<boolean>}
     */
    async verifyTransactionWithProof(transaction, proofData) {
        if (!proofData || !proofData.proof || !proofData.header) {
            return false;
        }

        return await this.verifyTransaction(transaction, proofData.proof, proofData.header);
    }

    /**
     * Validate header chain integrity
     * @returns {Promise<{valid: boolean, errors: Array}>}
     */
    async validateHeaderChain() {
        const errors = [];

        if (this.headers.length === 0) {
            errors.push('No headers in chain');
            return { valid: false, errors };
        }

        // Check genesis
        const genesis = this.headers[0];
        if (genesis.previousHash !== null) {
            errors.push('Genesis header must have null previousHash');
        }

        // Check each header
        for (let i = 1; i < this.headers.length; i++) {
            const header = this.headers[i];
            const previous = this.headers[i - 1];

            // Verify previous hash
            const previousHash = await previous.computeHash();
            if (header.previousHash !== previousHash) {
                errors.push(`Header ${i} previous hash mismatch`);
            }

            // Verify header structure
            if (!header.isValid()) {
                errors.push(`Header ${i} is invalid`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LightClient;
} else {
    window.SrishtiLightClient = LightClient;
}
