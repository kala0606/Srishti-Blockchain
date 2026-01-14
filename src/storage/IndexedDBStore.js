/**
 * Srishti Blockchain - IndexedDB Storage
 * 
 * Persistent storage for the blockchain using IndexedDB.
 * Handles storing blocks, chain state, and node keys.
 */

class IndexedDBStore {
    constructor(dbName = 'srishti_blockchain', version = 2) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
    }
    
    /**
     * Open/initialize the database
     * @returns {Promise<IDBDatabase>}
     */
    async open() {
        if (this.db) return this.db;
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Blocks store (indexed by index and hash)
                if (!db.objectStoreNames.contains('blocks')) {
                    const blockStore = db.createObjectStore('blocks', { keyPath: 'index' });
                    blockStore.createIndex('hash', 'hash', { unique: true });
                    blockStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // Keys store (for node identity)
                if (!db.objectStoreNames.contains('keys')) {
                    db.createObjectStore('keys', { keyPath: 'nodeId' });
                }
                
                // Chain metadata
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
                
                // Checkpoints store (for pruned blocks)
                if (!db.objectStoreNames.contains('checkpoints')) {
                    const checkpointStore = db.createObjectStore('checkpoints', { keyPath: 'index' });
                    checkpointStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }
    
    /**
     * Save a block to the database
     * @param {Object} blockData - Block JSON object
     * @returns {Promise<void>}
     */
    async saveBlock(blockData) {
        const db = await this.open();
        const transaction = db.transaction(['blocks'], 'readwrite');
        const store = transaction.objectStore('blocks');
        
        return new Promise((resolve, reject) => {
            const request = store.put(blockData);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Save multiple blocks
     * @param {Array} blocks - Array of block JSON objects
     * @returns {Promise<void>}
     */
    async saveBlocks(blocks) {
        const db = await this.open();
        const transaction = db.transaction(['blocks'], 'readwrite');
        const store = transaction.objectStore('blocks');
        
        return Promise.all(blocks.map(block => {
            return new Promise((resolve, reject) => {
                const request = store.put(block);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }));
    }
    
    /**
     * Get a block by index
     * @param {number} index
     * @returns {Promise<Object|null>}
     */
    async getBlock(index) {
        const db = await this.open();
        const transaction = db.transaction(['blocks'], 'readonly');
        const store = transaction.objectStore('blocks');
        
        return new Promise((resolve, reject) => {
            const request = store.get(index);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Get block by hash
     * @param {string} hash
     * @returns {Promise<Object|null>}
     */
    async getBlockByHash(hash) {
        const db = await this.open();
        const transaction = db.transaction(['blocks'], 'readonly');
        const store = transaction.objectStore('blocks');
        const index = store.index('hash');
        
        return new Promise((resolve, reject) => {
            const request = index.get(hash);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Get all blocks
     * @returns {Promise<Array>}
     */
    async getAllBlocks() {
        const db = await this.open();
        const transaction = db.transaction(['blocks'], 'readonly');
        const store = transaction.objectStore('blocks');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const blocks = request.result;
                // Sort by index
                blocks.sort((a, b) => a.index - b.index);
                resolve(blocks);
            };
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Get chain length (number of blocks)
     * @returns {Promise<number>}
     */
    async getChainLength() {
        const blocks = await this.getAllBlocks();
        return blocks.length;
    }
    
    /**
     * Get latest block
     * @returns {Promise<Object|null>}
     */
    async getLatestBlock() {
        const blocks = await this.getAllBlocks();
        if (blocks.length === 0) return null;
        return blocks[blocks.length - 1];
    }
    
    /**
     * Save node keys
     * @param {string} nodeId
     * @param {Object} keyData - {publicKey: string, privateKey: string}
     * @returns {Promise<void>}
     */
    async saveKeys(nodeId, keyData) {
        const db = await this.open();
        const transaction = db.transaction(['keys'], 'readwrite');
        const store = transaction.objectStore('keys');
        
        return new Promise((resolve, reject) => {
            const request = store.put({
                nodeId: nodeId,
                ...keyData
            });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Get node keys
     * @param {string} nodeId
     * @returns {Promise<Object|null>}
     */
    async getKeys(nodeId) {
        const db = await this.open();
        const transaction = db.transaction(['keys'], 'readonly');
        const store = transaction.objectStore('keys');
        
        return new Promise((resolve, reject) => {
            const request = store.get(nodeId);
            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    delete result.nodeId; // Remove keyPath
                    resolve(result);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Save metadata
     * @param {string} key
     * @param {*} value
     * @returns {Promise<void>}
     */
    async saveMetadata(key, value) {
        const db = await this.open();
        const transaction = db.transaction(['metadata'], 'readwrite');
        const store = transaction.objectStore('metadata');
        
        return new Promise((resolve, reject) => {
            const request = store.put({ key, value });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Get metadata
     * @param {string} key
     * @returns {Promise<*>}
     */
    async getMetadata(key) {
        const db = await this.open();
        const transaction = db.transaction(['metadata'], 'readonly');
        const store = transaction.objectStore('metadata');
        
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.value : null);
            };
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Prune blocks, keeping only the last N blocks
     * @param {number} keepLastN - Number of blocks to keep
     * @returns {Promise<number>} - Number of blocks pruned
     */
    async pruneBlocks(keepLastN) {
        const db = await this.open();
        const transaction = db.transaction(['blocks'], 'readwrite');
        const store = transaction.objectStore('blocks');
        
        // Get all blocks
        const allBlocks = await this.getAllBlocks();
        
        if (allBlocks.length <= keepLastN) {
            return 0; // Nothing to prune
        }
        
        const pruneCount = allBlocks.length - keepLastN;
        
        // Delete blocks from index 0 to (pruneCount - 1)
        const deletePromises = [];
        for (let i = 0; i < pruneCount; i++) {
            deletePromises.push(
                new Promise((resolve, reject) => {
                    const request = store.delete(i);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                })
            );
        }
        
        await Promise.all(deletePromises);
        
        return pruneCount;
    }
    
    /**
     * Save checkpoints
     * @param {Array} checkpoints - Array of checkpoint objects
     * @returns {Promise<void>}
     */
    async saveCheckpoints(checkpoints) {
        if (!checkpoints || checkpoints.length === 0) return;
        
        const db = await this.open();
        const transaction = db.transaction(['checkpoints'], 'readwrite');
        const store = transaction.objectStore('checkpoints');
        
        await Promise.all(checkpoints.map(checkpoint => {
            return new Promise((resolve, reject) => {
                const request = store.put(checkpoint);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }));
    }
    
    /**
     * Get all checkpoints
     * @returns {Promise<Array>}
     */
    async getAllCheckpoints() {
        const db = await this.open();
        const transaction = db.transaction(['checkpoints'], 'readonly');
        const store = transaction.objectStore('checkpoints');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const checkpoints = request.result;
                // Sort by index
                checkpoints.sort((a, b) => a.index - b.index);
                resolve(checkpoints);
            };
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Get checkpoint by index
     * @param {number} index
     * @returns {Promise<Object|null>}
     */
    async getCheckpoint(index) {
        const db = await this.open();
        const transaction = db.transaction(['checkpoints'], 'readonly');
        const store = transaction.objectStore('checkpoints');
        
        return new Promise((resolve, reject) => {
            const request = store.get(index);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Batch write blocks (optimized for performance)
     * @param {Array} blocks - Array of block JSON objects
     * @returns {Promise<void>}
     */
    async batchWriteBlocks(blocks) {
        if (!blocks || blocks.length === 0) return;
        
        const db = await this.open();
        const transaction = db.transaction(['blocks'], 'readwrite');
        const store = transaction.objectStore('blocks');
        
        const batchSize = window.SrishtiConfig?.BATCH?.WRITE_SIZE || 50;
        
        // Process in batches
        for (let i = 0; i < blocks.length; i += batchSize) {
            const batch = blocks.slice(i, i + batchSize);
            await Promise.all(batch.map(block => {
                return new Promise((resolve, reject) => {
                    const request = store.put(block);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }));
        }
    }
    
    /**
     * Batch read blocks (optimized for performance)
     * @param {Array<number>} indices - Array of block indices to read
     * @returns {Promise<Array>}
     */
    async batchReadBlocks(indices) {
        if (!indices || indices.length === 0) return [];
        
        const db = await this.open();
        const transaction = db.transaction(['blocks'], 'readonly');
        const store = transaction.objectStore('blocks');
        
        const batchSize = window.SrishtiConfig?.BATCH?.READ_SIZE || 100;
        const results = [];
        
        // Process in batches
        for (let i = 0; i < indices.length; i += batchSize) {
            const batch = indices.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(index => {
                return new Promise((resolve, reject) => {
                    const request = store.get(index);
                    request.onsuccess = () => resolve(request.result || null);
                    request.onerror = () => reject(request.error);
                });
            }));
            results.push(...batchResults);
        }
        
        return results.filter(block => block !== null);
    }
    
    /**
     * Clear all data (use with caution!)
     * @returns {Promise<void>}
     */
    async clear() {
        const db = await this.open();
        const transaction = db.transaction(['blocks', 'keys', 'metadata', 'checkpoints'], 'readwrite');
        
        await Promise.all([
            new Promise((resolve, reject) => {
                const request = transaction.objectStore('blocks').clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            }),
            new Promise((resolve, reject) => {
                const request = transaction.objectStore('keys').clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            }),
            new Promise((resolve, reject) => {
                const request = transaction.objectStore('metadata').clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            }),
            new Promise((resolve, reject) => {
                const request = transaction.objectStore('checkpoints').clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            })
        ]);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IndexedDBStore;
} else {
    window.SrishtiIndexedDBStore = IndexedDBStore;
    // Also provide a default instance for convenience
    window.SrishtiStorage = new IndexedDBStore();
}
