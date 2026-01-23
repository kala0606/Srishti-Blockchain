/**
 * Srishti Blockchain - Merkle Tree
 * 
 * Implements Merkle Tree for transaction verification.
 * Used for calculating MerkleRoot and generating Merkle proofs.
 */

class MerkleTree {
    /**
     * Calculate Merkle root from an array of transactions
     * @param {Array} transactions - Array of transaction/event objects
     * @returns {Promise<string>} - Merkle root hash
     */
    static async calculateMerkleRoot(transactions) {
        if (!window.SrishtiHasher) {
            throw new Error('SrishtiHasher not loaded');
        }

        if (!transactions || transactions.length === 0) {
            // Empty tree - return hash of empty string
            return await window.SrishtiHasher.hash('');
        }

        if (transactions.length === 1) {
            // Single transaction - hash it
            return await this.hashTransaction(transactions[0]);
        }

        // Convert transactions to hashes
        const hashes = await Promise.all(
            transactions.map(tx => this.hashTransaction(tx))
        );

        // Build tree bottom-up
        return await this.buildTree(hashes);
    }

    /**
     * Build Merkle tree from array of hashes
     * @param {Array<string>} hashes - Array of transaction hashes
     * @returns {Promise<string>} - Root hash
     */
    static async buildTree(hashes) {
        if (hashes.length === 1) {
            return hashes[0];
        }

        const nextLevel = [];

        // Pair up hashes and hash them together
        for (let i = 0; i < hashes.length; i += 2) {
            if (i + 1 < hashes.length) {
                // Pair of hashes
                const combined = hashes[i] + hashes[i + 1];
                const hash = await window.SrishtiHasher.hash(combined);
                nextLevel.push(hash);
            } else {
                // Odd number - duplicate last hash
                const combined = hashes[i] + hashes[i];
                const hash = await window.SrishtiHasher.hash(combined);
                nextLevel.push(hash);
            }
        }

        // Recursively build next level
        return await this.buildTree(nextLevel);
    }

    /**
     * Hash a single transaction
     * @param {Object} transaction - Transaction/event object
     * @returns {Promise<string>} - Transaction hash
     */
    static async hashTransaction(transaction) {
        if (!window.SrishtiHasher) {
            throw new Error('SrishtiHasher not loaded');
        }

        // Create a canonical representation of the transaction
        // Sort keys for consistent hashing
        const canonical = JSON.stringify(transaction, Object.keys(transaction).sort());
        return await window.SrishtiHasher.hash(canonical);
    }

    /**
     * Generate Merkle proof for a specific transaction
     * @param {Array} transactions - Array of all transactions in the block
     * @param {number} transactionIndex - Index of the transaction to prove
     * @returns {Promise<Object>} - Merkle proof object with path and positions
     */
    static async generateProof(transactions, transactionIndex) {
        if (!window.SrishtiHasher) {
            throw new Error('SrishtiHasher not loaded');
        }

        if (transactionIndex < 0 || transactionIndex >= transactions.length) {
            throw new Error('Invalid transaction index');
        }

        // Hash all transactions
        const hashes = await Promise.all(
            transactions.map(tx => this.hashTransaction(tx))
        );

        const proof = {
            transactionHash: hashes[transactionIndex],
            path: [], // Array of {hash, position} where position is 'left' or 'right'
            root: null
        };

        // Build proof path
        await this.buildProofPath(hashes, transactionIndex, proof.path);

        // Calculate root
        proof.root = await this.calculateMerkleRoot(transactions);

        return proof;
    }

    /**
     * Build proof path recursively
     * @param {Array<string>} hashes - Current level hashes
     * @param {number} targetIndex - Index of target transaction at this level
     * @param {Array} proofPath - Array to accumulate proof path
     * @returns {Promise<void>}
     */
    static async buildProofPath(hashes, targetIndex, proofPath) {
        if (hashes.length === 1) {
            return; // Reached root
        }

        const nextLevel = [];
        const nextTargetIndex = Math.floor(targetIndex / 2);

        // Pair up hashes
        for (let i = 0; i < hashes.length; i += 2) {
            if (i + 1 < hashes.length) {
                // Pair
                const left = hashes[i];
                const right = hashes[i + 1];
                const combined = left + right;
                const hash = await window.SrishtiHasher.hash(combined);
                nextLevel.push(hash);

                // Add sibling to proof if this pair contains our target
                if (i === targetIndex || i + 1 === targetIndex) {
                    if (targetIndex === i) {
                        // Target is left, add right sibling
                        proofPath.push({ hash: right, position: 'right' });
                    } else {
                        // Target is right, add left sibling
                        proofPath.push({ hash: left, position: 'left' });
                    }
                }
            } else {
                // Odd number - duplicate last
                const combined = hashes[i] + hashes[i];
                const hash = await window.SrishtiHasher.hash(combined);
                nextLevel.push(hash);

                // If this is our target, no sibling to add (duplicated)
                if (i === targetIndex) {
                    proofPath.push({ hash: hashes[i], position: 'right' });
                }
            }
        }

        // Recursively build next level
        await this.buildProofPath(nextLevel, nextTargetIndex, proofPath);
    }

    /**
     * Verify a transaction using Merkle proof
     * @param {Object} transaction - Transaction to verify
     * @param {Object} proof - Merkle proof object
     * @param {string} merkleRoot - Expected Merkle root from block header
     * @returns {Promise<boolean>} - True if verification succeeds
     */
    static async verifyProof(transaction, proof, merkleRoot) {
        if (!window.SrishtiHasher) {
            throw new Error('SrishtiHasher not loaded');
        }

        // Hash the transaction
        let currentHash = await this.hashTransaction(transaction);

        // Verify transaction hash matches proof
        if (currentHash !== proof.transactionHash) {
            return false;
        }

        // Reconstruct root by following proof path
        for (const step of proof.path) {
            if (step.position === 'left') {
                // Sibling is on the left, current hash is on the right
                const combined = step.hash + currentHash;
                currentHash = await window.SrishtiHasher.hash(combined);
            } else {
                // Sibling is on the right, current hash is on the left
                const combined = currentHash + step.hash;
                currentHash = await window.SrishtiHasher.hash(combined);
            }
        }

        // Compare with expected root
        return currentHash === merkleRoot;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MerkleTree;
} else {
    window.SrishtiMerkleTree = MerkleTree;
}
