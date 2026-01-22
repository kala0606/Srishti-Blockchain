/**
 * Srishti SDK - Off-Chain App Data Store
 * 
 * Provides IndexedDB-based storage for app-specific data.
 * This is where the bulk of app data lives - only hashes/proofs go on-chain.
 * 
 * Features:
 * - Per-app isolated database
 * - CRUD operations
 * - Query by index
 * - Auto-initialization
 * 
 * @version 1.0.0
 */

class AppDataStore {
    /**
     * Create a new app data store
     * @param {string} appId - Unique app identifier
     */
    constructor(appId) {
        this.appId = appId;
        this.dbName = `srishti_app_${appId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        this.db = null;
        this.initPromise = null;
    }
    
    /**
     * Initialize the IndexedDB database
     * @returns {Promise<AppDataStore>} This store instance
     */
    async init() {
        // Prevent multiple simultaneous initializations
        if (this.initPromise) {
            return this.initPromise;
        }
        
        if (this.db) {
            return this;
        }
        
        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onerror = () => {
                this.initPromise = null;
                reject(new Error(`Failed to open database: ${request.error}`));
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                this.initPromise = null;
                resolve(this);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Main data store
                if (!db.objectStoreNames.contains('data')) {
                    const store = db.createObjectStore('data', { keyPath: 'id' });
                    
                    // Common indexes for efficient queries
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });
                    store.createIndex('type', 'type', { unique: false });
                    store.createIndex('owner', 'owner', { unique: false });
                }
                
                // Metadata store for app settings, sync state, etc.
                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'key' });
                }
            };
        });
        
        return this.initPromise;
    }
    
    /**
     * Ensure database is initialized before operations
     * @private
     */
    async _ensureInit() {
        if (!this.db) {
            await this.init();
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CRUD OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Store or update a record
     * @param {string} id - Record ID
     * @param {Object} data - Data to store
     * @returns {Promise<boolean>} Success status
     * 
     * @example
     * await store.put('sess_123', {
     *     title: 'Blockchain 101',
     *     description: 'Introduction to blockchain',
     *     startTime: Date.now()
     * });
     */
    async put(id, data) {
        await this._ensureInit();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['data'], 'readwrite');
            const store = tx.objectStore('data');
            
            const record = {
                ...data,
                id: id,
                updatedAt: Date.now(),
                createdAt: data.createdAt || Date.now()
            };
            
            const request = store.put(record);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(new Error(`Failed to store: ${request.error}`));
        });
    }
    
    /**
     * Get a record by ID
     * @param {string} id - Record ID
     * @returns {Promise<Object|null>} Record or null if not found
     * 
     * @example
     * const session = await store.get('sess_123');
     * console.log(session.title);
     */
    async get(id) {
        await this._ensureInit();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['data'], 'readonly');
            const store = tx.objectStore('data');
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(new Error(`Failed to get: ${request.error}`));
        });
    }
    
    /**
     * Delete a record
     * @param {string} id - Record ID
     * @returns {Promise<boolean>} Success status
     */
    async delete(id) {
        await this._ensureInit();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['data'], 'readwrite');
            const store = tx.objectStore('data');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(new Error(`Failed to delete: ${request.error}`));
        });
    }
    
    /**
     * Get all records
     * @returns {Promise<Array>} All records
     */
    async getAll() {
        await this._ensureInit();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['data'], 'readonly');
            const store = tx.objectStore('data');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(new Error(`Failed to get all: ${request.error}`));
        });
    }
    
    /**
     * Query records by index
     * @param {string} indexName - Index to query (type, owner, createdAt, updatedAt)
     * @param {*} value - Value to match
     * @returns {Promise<Array>} Matching records
     * 
     * @example
     * // Get all sessions owned by a user
     * const mySessions = await store.query('owner', 'node_abc123');
     * 
     * // Get all records of a specific type
     * const sessions = await store.query('type', 'session');
     */
    async query(indexName, value) {
        await this._ensureInit();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['data'], 'readonly');
            const store = tx.objectStore('data');
            
            try {
                const index = store.index(indexName);
                const request = index.getAll(value);
                
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(new Error(`Failed to query: ${request.error}`));
            } catch (error) {
                // Index doesn't exist - fall back to full scan
                const request = store.getAll();
                request.onsuccess = () => {
                    const results = (request.result || []).filter(r => r[indexName] === value);
                    resolve(results);
                };
                request.onerror = () => reject(new Error(`Failed to query: ${request.error}`));
            }
        });
    }
    
    /**
     * Query with custom filter function
     * @param {Function} filterFn - Filter function (record) => boolean
     * @returns {Promise<Array>} Matching records
     * 
     * @example
     * // Get recent sessions
     * const recent = await store.filter(r => r.createdAt > Date.now() - 86400000);
     */
    async filter(filterFn) {
        const all = await this.getAll();
        return all.filter(filterFn);
    }
    
    /**
     * Count records
     * @returns {Promise<number>} Record count
     */
    async count() {
        await this._ensureInit();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['data'], 'readonly');
            const store = tx.objectStore('data');
            const request = store.count();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error(`Failed to count: ${request.error}`));
        });
    }
    
    /**
     * Clear all records
     * @returns {Promise<boolean>} Success status
     */
    async clear() {
        await this._ensureInit();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['data'], 'readwrite');
            const store = tx.objectStore('data');
            const request = store.clear();
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(new Error(`Failed to clear: ${request.error}`));
        });
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // METADATA OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Store metadata (app settings, sync state, etc.)
     * @param {string} key - Metadata key
     * @param {*} value - Value to store
     * @returns {Promise<boolean>}
     */
    async setMeta(key, value) {
        await this._ensureInit();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['meta'], 'readwrite');
            const store = tx.objectStore('meta');
            const request = store.put({ key, value, updatedAt: Date.now() });
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(new Error(`Failed to set meta: ${request.error}`));
        });
    }
    
    /**
     * Get metadata
     * @param {string} key - Metadata key
     * @param {*} [defaultValue] - Default value if not found
     * @returns {Promise<*>}
     */
    async getMeta(key, defaultValue = null) {
        await this._ensureInit();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['meta'], 'readonly');
            const store = tx.objectStore('meta');
            const request = store.get(key);
            
            request.onsuccess = () => {
                resolve(request.result?.value ?? defaultValue);
            };
            request.onerror = () => reject(new Error(`Failed to get meta: ${request.error}`));
        });
    }
    
    /**
     * Delete metadata
     * @param {string} key - Metadata key
     * @returns {Promise<boolean>}
     */
    async deleteMeta(key) {
        await this._ensureInit();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['meta'], 'readwrite');
            const store = tx.objectStore('meta');
            const request = store.delete(key);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(new Error(`Failed to delete meta: ${request.error}`));
        });
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BATCH OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Store multiple records
     * @param {Array<{id: string, data: Object}>} records - Records to store
     * @returns {Promise<boolean>}
     */
    async putMany(records) {
        await this._ensureInit();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['data'], 'readwrite');
            const store = tx.objectStore('data');
            
            for (const { id, data } of records) {
                store.put({
                    ...data,
                    id: id,
                    updatedAt: Date.now(),
                    createdAt: data.createdAt || Date.now()
                });
            }
            
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(new Error(`Failed to store many: ${tx.error}`));
        });
    }
    
    /**
     * Get multiple records by IDs
     * @param {Array<string>} ids - Record IDs
     * @returns {Promise<Array>} Records (in same order, null for missing)
     */
    async getMany(ids) {
        const results = await Promise.all(ids.map(id => this.get(id)));
        return results;
    }
    
    /**
     * Delete multiple records
     * @param {Array<string>} ids - Record IDs to delete
     * @returns {Promise<boolean>}
     */
    async deleteMany(ids) {
        await this._ensureInit();
        
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['data'], 'readwrite');
            const store = tx.objectStore('data');
            
            for (const id of ids) {
                store.delete(id);
            }
            
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(new Error(`Failed to delete many: ${tx.error}`));
        });
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITY
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Check if a record exists
     * @param {string} id - Record ID
     * @returns {Promise<boolean>}
     */
    async exists(id) {
        const record = await this.get(id);
        return record !== null;
    }
    
    /**
     * Export all data (for backup/sync)
     * @returns {Promise<Object>} Export object with data and meta
     */
    async export() {
        await this._ensureInit();
        
        const data = await this.getAll();
        
        const meta = await new Promise((resolve, reject) => {
            const tx = this.db.transaction(['meta'], 'readonly');
            const store = tx.objectStore('meta');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(new Error(`Failed to export meta: ${request.error}`));
        });
        
        return {
            appId: this.appId,
            exportedAt: Date.now(),
            data: data,
            meta: meta
        };
    }
    
    /**
     * Import data (from backup/sync)
     * @param {Object} exportData - Data from export()
     * @param {boolean} [merge=true] - Merge with existing or replace
     * @returns {Promise<boolean>}
     */
    async import(exportData, merge = true) {
        if (exportData.appId !== this.appId) {
            throw new Error(`Import app ID mismatch: expected ${this.appId}, got ${exportData.appId}`);
        }
        
        if (!merge) {
            await this.clear();
        }
        
        // Import data
        if (exportData.data && exportData.data.length > 0) {
            await this.putMany(exportData.data.map(d => ({ id: d.id, data: d })));
        }
        
        // Import meta
        if (exportData.meta && exportData.meta.length > 0) {
            for (const { key, value } of exportData.meta) {
                await this.setMeta(key, value);
            }
        }
        
        return true;
    }
    
    /**
     * Close the database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
    
    /**
     * Delete the entire database
     * @returns {Promise<boolean>}
     */
    async destroy() {
        this.close();
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this.dbName);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(new Error(`Failed to delete database: ${request.error}`));
        });
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppDataStore;
} else {
    window.SrishtiAppDataStore = AppDataStore;
}
