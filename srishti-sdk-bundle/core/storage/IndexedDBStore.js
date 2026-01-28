/**
 * Srishti Blockchain - IndexedDB Storage
 * 
 * Persistent storage for the blockchain using IndexedDB.
 * Handles storing blocks, chain state, and node keys.
 * 
 * Storage version is tied to CHAIN_EPOCH. Old caches (missing or older version)
 * are wiped; users must create a new node. Non–backward compatible.
 */

const STORAGE_VERSION_KEY = 'storage_version';

class IndexedDBStore {
    constructor(dbName = 'srishti_blockchain', version = 3) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
    }

    /**
     * Read metadata from an open DB without calling open() (avoids recursion).
     * @private
     */
    _getMetadataRaw(db, key) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['metadata'], 'readonly');
            const store = tx.objectStore('metadata');
            const req = store.get(key);
            req.onsuccess = () => {
                const r = req.result;
                resolve(r != null ? r.value : null);
            };
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Write metadata to an open DB without calling open().
     * @private
     */
    _setMetadataRaw(db, key, value) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['metadata'], 'readwrite');
            const store = tx.objectStore('metadata');
            const req = store.put({ key, value });
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Clear Srishti node identity from localStorage. Used when wiping old cache.
     * @private
     */
    _clearSrishtiLocalStorage() {
        try {
            localStorage.removeItem('srishti_node_id');
            localStorage.removeItem('srishti_node_name');
            localStorage.removeItem('srishti_public_key');
            localStorage.removeItem('srishti_private_key');
        } catch (e) {
            console.warn('Failed to clear Srishti localStorage:', e);
        }
    }
    
    /**
     * Open/initialize the database.
     * Old storage (no storage_version or version < CHAIN_EPOCH) is wiped;
     * IndexedDB and node localStorage are cleared, then we start fresh.
     * @param {boolean} [skipVersionCheck] - Internal: skip check after wipe and just write version
     * @returns {Promise<IDBDatabase>}
     */
    async open(skipVersionCheck = false) {
        if (this.db) return this.db;
        
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const d = event.target.result;
                if (!d.objectStoreNames.contains('blocks')) {
                    const blockStore = d.createObjectStore('blocks', { keyPath: 'index' });
                    blockStore.createIndex('hash', 'hash', { unique: true });
                    blockStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                if (!d.objectStoreNames.contains('keys')) {
                    d.createObjectStore('keys', { keyPath: 'nodeId' });
                }
                if (!d.objectStoreNames.contains('metadata')) {
                    d.createObjectStore('metadata', { keyPath: 'key' });
                }
                if (!d.objectStoreNames.contains('checkpoints')) {
                    const checkpointStore = d.createObjectStore('checkpoints', { keyPath: 'index' });
                    checkpointStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                if (!d.objectStoreNames.contains('headers')) {
                    const headerStore = d.createObjectStore('headers', { keyPath: 'index' });
                    headerStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });

        const required = (typeof window !== 'undefined' && window.SrishtiConfig?.CHAIN_EPOCH) ?? 1;

        if (skipVersionCheck) {
            await this._setMetadataRaw(db, STORAGE_VERSION_KEY, required);
            this.db = db;
            return db;
        }

        const storedVersion = await this._getMetadataRaw(db, STORAGE_VERSION_KEY);
        if (storedVersion == null || storedVersion < required) {
            db.close();
            await new Promise((res, rej) => {
                const req = indexedDB.deleteDatabase(this.dbName);
                req.onsuccess = () => res();
                req.onerror = () => rej(req.error);
            });
            this._clearSrishtiLocalStorage();
            this.db = null;
            console.warn(`🔄 Storage version outdated or missing (found: ${storedVersion}, required: ${required}). Cleared IndexedDB and node localStorage. Start fresh.`);
            return this.open(true);
        }

        this.db = db;
        return db;
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
     * Delete metadata
     * @param {string} key
     * @returns {Promise<void>}
     */
    async deleteMetadata(key) {
        const db = await this.open();
        const transaction = db.transaction(['metadata'], 'readwrite');
        const store = transaction.objectStore('metadata');
        
        return new Promise((resolve, reject) => {
            const request = store.delete(key);
            request.onsuccess = () => resolve();
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
     * Save a block header (for light clients)
     * @param {number} index - Header index
     * @param {Object} headerData - Header JSON object
     * @returns {Promise<void>}
     */
    async saveHeader(index, headerData) {
        const db = await this.open();
        const transaction = db.transaction(['headers'], 'readwrite');
        const store = transaction.objectStore('headers');
        
        const headerWithIndex = {
            index: index,
            ...headerData
        };
        
        return new Promise((resolve, reject) => {
            const request = store.put(headerWithIndex);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a header by index
     * @param {number} index
     * @returns {Promise<Object|null>}
     */
    async getHeader(index) {
        const db = await this.open();
        const transaction = db.transaction(['headers'], 'readonly');
        const store = transaction.objectStore('headers');
        
        return new Promise((resolve, reject) => {
            const request = store.get(index);
            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    // Remove index from result (it's the key)
                    const { index, ...headerData } = result;
                    resolve(headerData);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all headers
     * @returns {Promise<Array>}
     */
    async getAllHeaders() {
        const db = await this.open();
        const transaction = db.transaction(['headers'], 'readonly');
        const store = transaction.objectStore('headers');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const headers = request.result;
                // Sort by index
                headers.sort((a, b) => a.index - b.index);
                // Remove index from each header
                const headerData = headers.map(({ index, ...header }) => header);
                resolve(headerData);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get headers in a range
     * @param {number} fromIndex - Start index (inclusive)
     * @param {number} toIndex - End index (exclusive)
     * @returns {Promise<Array>}
     */
    async getHeadersRange(fromIndex, toIndex) {
        const db = await this.open();
        const transaction = db.transaction(['headers'], 'readonly');
        const store = transaction.objectStore('headers');
        
        const headers = [];
        for (let i = fromIndex; i < toIndex; i++) {
            const header = await this.getHeader(i);
            if (header) {
                headers.push(header);
            } else {
                break; // Stop if we hit a gap
            }
        }
        
        return headers;
    }

    /**
     * Clear all data (use with caution!)
     * @returns {Promise<void>}
     */
    async clear() {
        const db = await this.open();
        const transaction = db.transaction(['blocks', 'keys', 'metadata', 'checkpoints', 'headers'], 'readwrite');
        
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
            }),
            new Promise((resolve, reject) => {
                const request = transaction.objectStore('headers').clear();
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
