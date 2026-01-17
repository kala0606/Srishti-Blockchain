/**
 * Srishti Blockchain - Block Body
 * 
 * Represents the body of a block containing transactions/events.
 */

class BlockBody {
    /**
     * Create a new block body
     * @param {Object|Array} transactions - Single transaction/event or array of transactions
     */
    constructor(transactions) {
        // Normalize to array
        if (Array.isArray(transactions)) {
            this.transactions = transactions;
        } else {
            this.transactions = [transactions];
        }
    }

    /**
     * Get all transactions
     * @returns {Array}
     */
    getTransactions() {
        return this.transactions;
    }

    /**
     * Get transaction count
     * @returns {number}
     */
    getTransactionCount() {
        return this.transactions.length;
    }

    /**
     * Get transaction by index
     * @param {number} index
     * @returns {Object|null}
     */
    getTransaction(index) {
        if (index < 0 || index >= this.transactions.length) {
            return null;
        }
        return this.transactions[index];
    }

    /**
     * Find transaction by ID (hash)
     * @param {string} txId - Transaction hash/ID
     * @returns {Promise<{transaction: Object, index: number}|null>}
     */
    async findTransaction(txId) {
        if (!window.SrishtiMerkleTree) {
            throw new Error('SrishtiMerkleTree not loaded');
        }

        for (let i = 0; i < this.transactions.length; i++) {
            const txHash = await window.SrishtiMerkleTree.hashTransaction(this.transactions[i]);
            if (txHash === txId) {
                return { transaction: this.transactions[i], index: i };
            }
        }
        return null;
    }

    /**
     * Serialize body to JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            transactions: this.transactions
        };
    }

    /**
     * Create a BlockBody from JSON
     * @param {Object} json
     * @returns {BlockBody}
     */
    static fromJSON(json) {
        return new BlockBody(json.transactions || []);
    }

    /**
     * Validate body structure
     * @returns {boolean}
     */
    isValid() {
        return Array.isArray(this.transactions) && this.transactions.length > 0;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BlockBody;
} else {
    window.SrishtiBlockBody = BlockBody;
}
