/**
 * Srishti Blockchain - IndexedDB Storage
 * 
 * Persistent storage for the blockchain using IndexedDB.
 * Handles storing blocks, chain state, and node keys.
 */

class IndexedDBStore {
    constructor(dbName = 'srishti_blockchain', version = 1) {
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
     * Clear all data (use with caution!)
     * @returns {Promise<void>}
     */
    async clear() {
        const db = await this.open();
        const transaction = db.transaction(['blocks', 'keys', 'metadata'], 'readwrite');
        
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
