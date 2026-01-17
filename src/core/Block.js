/**
 * Srishti Blockchain - Block
 * 
 * Represents a single block in the blockchain.
 * Each block contains events and links cryptographically to the previous block.
 * 
 * Refactored to use BlockHeader and BlockBody for SPV/Light Client support.
 */

class Block {
    /**
     * Create a new block
     * @param {Object} params
     * @param {number} params.index - Block index
     * @param {string} params.previousHash - Hash of previous block
     * @param {Object|Array} params.data - Event data (single event or array)
     * @param {string} params.proposer - Node ID of block proposer
     * @param {Object} params.participationProof - Proof of participation score
     * @param {number} params.timestamp - Block timestamp (defaults to now)
     * @param {number} params.nonce - Nonce value (defaults to 0)
     * @param {BlockHeader} params.header - Optional pre-constructed header
     * @param {BlockBody} params.body - Optional pre-constructed body
     */
    constructor(params) {
        this.index = params.index;
        this.proposer = params.proposer || null;
        this.participationProof = params.participationProof || null;
        this.hash = params.hash || null; // Will be computed if not provided
        this.signature = params.signature || null; // Optional cryptographic signature
        this.nonce = params.nonce || 0;

        // Legacy fields for backward compatibility
        this.timestamp = params.timestamp || Date.now();
        this.previousHash = params.previousHash || null;
        this.data = params.data; // Can be single event or array of events

        // New structure: BlockHeader and BlockBody
        if (params.header && params.body) {
            this.header = params.header;
            this.body = params.body;
        } else {
            // Construct from legacy params
            const transactions = Array.isArray(params.data) ? params.data : [params.data];
            this.body = new window.SrishtiBlockBody(transactions);
            
            // Header will be created when MerkleRoot is computed
            this.header = null; // Will be set in computeHash()
        }
    }
    
    /**
     * Compute the hash of this block
     * This will also compute the MerkleRoot if not already set
     * @returns {Promise<string>} Block hash
     */
    async computeHash() {
        if (!window.SrishtiHasher || !window.SrishtiMerkleTree || !window.SrishtiBlockHeader) {
            throw new Error('Required dependencies not loaded');
        }

        // Ensure body is initialized
        if (!this.body) {
            const transactions = Array.isArray(this.data) ? this.data : [this.data];
            this.body = new window.SrishtiBlockBody(transactions);
        }

        // Compute MerkleRoot from transactions
        const transactions = this.body.getTransactions();
        const merkleRoot = await window.SrishtiMerkleTree.calculateMerkleRoot(transactions);

        // Create or update header
        if (!this.header) {
            this.header = new window.SrishtiBlockHeader({
                previousHash: this.previousHash,
                timestamp: this.timestamp,
                nonce: this.nonce || 0,
                merkleRoot: merkleRoot
            });
        } else {
            // Update header fields
            this.header.previousHash = this.previousHash;
            this.header.timestamp = this.timestamp;
            this.header.nonce = this.nonce || 0;
            this.header.merkleRoot = merkleRoot;
        }

        // Compute block hash from header + metadata
        const blockData = {
            index: this.index,
            header: this.header.toJSON(),
            proposer: this.proposer,
            participationProof: this.participationProof
        };
        
        this.hash = await window.SrishtiHasher.hashBlock(blockData);
        return this.hash;
    }
    
    /**
     * Sign the block with a private key
     * @param {CryptoKey} privateKey - Private key to sign with
     * @returns {Promise<void>}
     */
    async sign(privateKey) {
        if (!window.SrishtiKeys) {
            throw new Error('SrishtiKeys not loaded');
        }
        
        // Sign block data (excluding signature itself)
        const blockData = {
            index: this.index,
            timestamp: this.timestamp,
            previousHash: this.previousHash,
            data: this.data,
            proposer: this.proposer,
            participationProof: this.participationProof,
            hash: this.hash
        };
        
        this.signature = await window.SrishtiKeys.sign(privateKey, blockData);
    }
    
    /**
     * Verify the block signature
     * @param {CryptoKey} publicKey - Public key to verify with
     * @returns {Promise<boolean>} - True if signature is valid
     */
    async verifySignature(publicKey) {
        if (!this.signature) {
            return true; // No signature means valid (backward compatibility)
        }
        
        if (!window.SrishtiKeys) {
            return false;
        }
        
        // Verify signature against block data
        const blockData = {
            index: this.index,
            timestamp: this.timestamp,
            previousHash: this.previousHash,
            data: this.data,
            proposer: this.proposer,
            participationProof: this.participationProof,
            hash: this.hash
        };
        
        return await window.SrishtiKeys.verify(publicKey, blockData, this.signature);
    }
    
    /**
     * Serialize block to JSON
     * @returns {Object}
     */
    toJSON() {
        const json = {
            index: this.index,
            timestamp: this.timestamp,
            previousHash: this.previousHash,
            data: this.data,
            proposer: this.proposer,
            participationProof: this.participationProof,
            hash: this.hash,
            signature: this.signature || null
        };

        // Include header and body if available
        if (this.header) {
            json.header = this.header.toJSON();
        }
        if (this.body) {
            json.body = this.body.toJSON();
        }

        return json;
    }
    
    /**
     * Create a Block from JSON
     * @param {Object} json
     * @returns {Block}
     */
    static fromJSON(json) {
        // Try to reconstruct from header/body if available
        if (json.header && json.body && window.SrishtiBlockHeader && window.SrishtiBlockBody) {
            const header = window.SrishtiBlockHeader.fromJSON(json.header);
            const body = window.SrishtiBlockBody.fromJSON(json.body);
            
            const block = new Block({
                index: json.index,
                timestamp: json.timestamp || header.timestamp,
                previousHash: json.previousHash || header.previousHash,
                data: json.data || body.transactions,
                proposer: json.proposer,
                participationProof: json.participationProof,
                signature: json.signature || null,
                nonce: json.nonce || header.nonce,
                header: header,
                body: body
            });
            block.hash = json.hash;
            return block;
        } else {
            // Legacy format
            const block = new Block({
                index: json.index,
                timestamp: json.timestamp,
                previousHash: json.previousHash,
                data: json.data,
                proposer: json.proposer,
                participationProof: json.participationProof,
                signature: json.signature || null,
                nonce: json.nonce || 0
            });
            block.hash = json.hash;
            return block;
        }
    }
    
    /**
     * Get the events in this block (normalizes to array)
     * @returns {Array}
     */
    getEvents() {
        if (this.body) {
            return this.body.getTransactions();
        }
        // Legacy fallback
        if (Array.isArray(this.data)) {
            return this.data;
        }
        return [this.data];
    }

    /**
     * Get block header
     * @returns {BlockHeader|null}
     */
    getHeader() {
        return this.header;
    }

    /**
     * Get block body
     * @returns {BlockBody|null}
     */
    getBody() {
        return this.body;
    }

    /**
     * Get Merkle root (computes if needed)
     * @returns {Promise<string>}
     */
    async getMerkleRoot() {
        if (this.header && this.header.merkleRoot) {
            return this.header.merkleRoot;
        }
        // Compute if not available
        await this.computeHash();
        return this.header.merkleRoot;
    }
    
    /**
     * Validate block structure
     * @returns {boolean}
     */
    isValid() {
        // Check required fields
        if (this.index === undefined || this.index === null) return false;
        if (!this.timestamp) return false;
        if (this.index > 0 && !this.previousHash) return false;
        if (!this.data && !this.body) return false;
        if (!this.hash) return false;
        
        // Validate header if present
        if (this.header && !this.header.isValid()) {
            return false;
        }
        
        // Validate body if present
        if (this.body && !this.body.isValid()) {
            return false;
        }
        
        return true;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Block;
} else {
    window.SrishtiBlock = Block;
}
