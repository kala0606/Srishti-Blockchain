/**
 * Srishti Generative Art App - NFT Marketplace for Generative Art
 * 
 * A decentralized generative art platform similar to ArtBlocks and fxhash.
 * 
 * Features:
 * - Artists upload generative art projects (code + parameters)
 * - Mint unique generative art pieces
 * - Buy/sell art pieces on marketplace
 * - Display gallery of all art pieces
 * - Ownership tracking on-chain
 * 
 * Data Architecture:
 * - ON-CHAIN: Art piece ownership, minting events, sales transactions
 * - OFF-CHAIN: Full art metadata, code, images, parameters
 * 
 * @version 1.0.0
 * @requires SrishtiSDK
 * @requires SrishtiAppDataStore
 */

class GenerativeArtApp {
    // App identifier - used for all on-chain events
    static APP_ID = 'srishti.generative-art.v1';
    
    // App-specific action types
    static ACTIONS = {
        PROJECT_CREATE: 'PROJECT_CREATE',
        PIECE_MINT: 'PIECE_MINT',
        PIECE_LIST: 'PIECE_LIST',
        PIECE_UNLIST: 'PIECE_UNLIST',
        PIECE_PURCHASE: 'PIECE_PURCHASE',
        PIECE_TRANSFER: 'PIECE_TRANSFER'
    };
    
    // Art piece status
    static STATUS = {
        MINTED: 'MINTED',
        LISTED: 'LISTED',
        SOLD: 'SOLD',
        TRANSFERRED: 'TRANSFERRED'
    };
    
    // Project status
    static PROJECT_STATUS = {
        DRAFT: 'DRAFT',      // Only artist can mint
        RELEASED: 'RELEASED' // Anyone can mint
    };
    
    /**
     * Create a new Generative Art App instance
     * @param {SrishtiSDK} sdk - Initialized SDK instance
     */
    constructor(sdk) {
        if (!sdk) {
            throw new Error('GenerativeArtApp requires a SrishtiSDK instance');
        }
        
        this.sdk = sdk;
        this.store = sdk.getAppStore(GenerativeArtApp.APP_ID);
        
        // Initialize store and sync data
        this._initPromise = this._initializeStore();
        
        // Set up event listener for real-time updates
        this._setupEventListener();
    }
    
    /**
     * Initialize the store and sync data from IndexedDB
     * @private
     */
    async _initializeStore() {
        // Ensure store is initialized
        await this.store.init();
        
        // Sync on-chain events with local data
        await this._syncWithChain();
    }
    
    /**
     * Sync local data with on-chain events
     * Reconstructs any missing local data from blockchain
     * @private
     */
    async _syncWithChain() {
        // Get all on-chain project events
        const projectEvents = this.sdk.queryAppEvents(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PROJECT_CREATE
        );
        
        // Group events by project ID and get the latest event for each project
        const projectEventMap = new Map();
        for (const event of projectEvents) {
            const projectId = event.payload.ref;
            const existing = projectEventMap.get(projectId);
            if (!existing || event.timestamp > existing.timestamp) {
                projectEventMap.set(projectId, event);
            }
        }
        
        // Ensure all projects exist locally
        for (const [projectId, event] of projectEventMap) {
            const existing = await this.store.get(projectId);
            
            // Extract code and parameters from on-chain metadata
            // Code is stored on-chain, so anyone can access it
            const codeFromChain = event.payload.metadata?.code ? event.payload.metadata.code.trim() : null;
            let parametersFromChain = {};
            try {
                if (event.payload.metadata?.parameters) {
                    parametersFromChain = typeof event.payload.metadata.parameters === 'string' 
                        ? JSON.parse(event.payload.metadata.parameters)
                        : event.payload.metadata.parameters;
                }
            } catch (e) {
                console.warn('Failed to parse parameters from chain:', e);
            }
            
            // Extract status from latest event metadata (releases update the status in metadata)
            const statusFromChain = event.payload.metadata?.status || 'DRAFT';
            const projectStatus = (statusFromChain === 'RELEASED' || 
                                  statusFromChain === GenerativeArtApp.PROJECT_STATUS.RELEASED ||
                                  String(statusFromChain).toUpperCase() === 'RELEASED')
                ? GenerativeArtApp.PROJECT_STATUS.RELEASED
                : GenerativeArtApp.PROJECT_STATUS.DRAFT;
            
            console.log(`📋 Project ${projectId} status from chain:`, statusFromChain, '->', projectStatus);
            
            if (!existing) {
                // Project exists on-chain but not locally - reconstruct from chain
                const project = {
                    id: projectId,
                    type: 'project',
                    title: event.payload.metadata?.title || 'Unknown Project',
                    description: '',
                    code: codeFromChain, // Extract code from on-chain metadata
                    parameters: parametersFromChain,
                    maxSupply: event.payload.metadata?.maxSupply || null,
                    mintPrice: event.payload.metadata?.mintPrice || 0,
                    artistId: event.sender,
                    artistName: event.payload.metadata?.artistName || 'Unknown',
                    createdAt: event.timestamp,
                    pieceCount: 0,
                    status: projectStatus, // Use status from latest event
                    thumbnailUrl: null // Will be generated below if code exists
                };
                
                // Generate thumbnail if code is available
                if (codeFromChain) {
                    try {
                        console.log('🎨 Generating thumbnail from on-chain code for project:', projectId);
                        const thumbnailUrl = await this._executeCode(codeFromChain, {
                            seed: `preview_${projectId}`,
                            ...parametersFromChain
                        });
                        if (thumbnailUrl) {
                            project.thumbnailUrl = thumbnailUrl;
                            console.log('✅ Thumbnail generated from on-chain code');
                        }
                    } catch (error) {
                        console.warn('Failed to generate thumbnail from on-chain code:', projectId, error);
                    }
                }
                
                await this.store.put(projectId, project);
            } else {
                // Update existing project: ensure code, parameters, and status are synced from chain
                let needsUpdate = false;
                
                // Update status from chain (important for releases!)
                if (existing.status !== projectStatus) {
                    existing.status = projectStatus;
                    needsUpdate = true;
                    console.log(`🔄 Updated project status from chain: ${projectId} -> ${projectStatus}`);
                }
                
                // Update code from chain if missing locally
                if (!existing.code && codeFromChain) {
                    existing.code = codeFromChain;
                    needsUpdate = true;
                }
                
                // Update parameters from chain if missing locally
                if (Object.keys(existing.parameters || {}).length === 0 && Object.keys(parametersFromChain).length > 0) {
                    existing.parameters = parametersFromChain;
                    needsUpdate = true;
                }
                
                // Generate thumbnail if code exists but thumbnail is missing
                if (!existing.thumbnailUrl && (existing.code || codeFromChain)) {
                    const codeToUse = existing.code || codeFromChain;
                    const paramsToUse = Object.keys(existing.parameters || {}).length > 0 
                        ? existing.parameters 
                        : parametersFromChain;
                    
                    try {
                        console.log('🎨 Regenerating thumbnail for project:', projectId);
                        const thumbnailUrl = await this._executeCode(codeToUse, {
                            seed: `preview_${projectId}`,
                            ...paramsToUse
                        });
                        if (thumbnailUrl) {
                            existing.thumbnailUrl = thumbnailUrl;
                            needsUpdate = true;
                            console.log('✅ Thumbnail regenerated');
                        }
                    } catch (error) {
                        console.warn('Failed to regenerate thumbnail for project:', projectId, error);
                    }
                }
                
                if (needsUpdate) {
                    await this.store.put(projectId, existing);
                }
            }
        }
        
        // Get all on-chain mint events
        const mintEvents = this.sdk.queryAppEvents(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PIECE_MINT
        );
        
        // Ensure all pieces exist locally
        for (const event of mintEvents) {
            const pieceId = event.payload.target;
            const existing = await this.store.get(pieceId);
            if (!existing) {
                // Piece exists on-chain but not locally - reconstruct basic info
                const projectId = event.payload.ref;
                const project = await this.store.get(projectId);
                
                const piece = {
                    id: pieceId,
                    type: 'piece',
                    projectId: projectId,
                    projectTitle: project?.title || event.payload.metadata?.projectTitle || 'Unknown',
                    artistId: event.payload.metadata?.artistId || event.sender,
                    artistName: project?.artistName || 'Unknown',
                    ownerId: event.payload.metadata?.ownerId || event.sender,
                    ownerName: this._getNodeName(event.payload.metadata?.ownerId || event.sender),
                    mintedAt: event.payload.metadata?.mintedAt || event.timestamp,
                    seed: event.payload.metadata?.seed || null,
                    parameters: {},
                    imageUrl: null,
                    status: GenerativeArtApp.STATUS.MINTED,
                    price: null,
                    transferHistory: [{
                        from: null,
                        to: event.payload.metadata?.ownerId || event.sender,
                        timestamp: event.payload.metadata?.mintedAt || event.timestamp,
                        type: 'MINT'
                    }]
                };
                await this.store.put(pieceId, piece);
            } else {
                // Update status from on-chain events (listings, purchases, etc.)
                await this._updatePieceStatusFromChain(pieceId);
            }
        }
    }
    
    /**
     * Update piece status from on-chain events
     * @private
     */
    async _updatePieceStatusFromChain(pieceId) {
        const piece = await this.store.get(pieceId);
        if (!piece) return;
        
        // Check for listing events
        const listEvents = this.sdk.queryAppEvents(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PIECE_LIST,
            { ref: pieceId }
        );
        
        if (listEvents.length > 0) {
            const latest = listEvents[listEvents.length - 1];
            const unlistEvents = this.sdk.queryAppEvents(
                GenerativeArtApp.APP_ID,
                GenerativeArtApp.ACTIONS.PIECE_UNLIST,
                { ref: pieceId }
            );
            
            // If there's a more recent unlist, or no unlist, check purchase
            if (unlistEvents.length === 0 || unlistEvents[unlistEvents.length - 1].timestamp < latest.timestamp) {
                const purchaseEvents = this.sdk.queryAppEvents(
                    GenerativeArtApp.APP_ID,
                    GenerativeArtApp.ACTIONS.PIECE_PURCHASE,
                    { ref: pieceId }
                );
                
                if (purchaseEvents.length > 0) {
                    const purchase = purchaseEvents[purchaseEvents.length - 1];
                    piece.status = GenerativeArtApp.STATUS.SOLD;
                    piece.ownerId = purchase.payload.metadata?.newOwnerId || piece.ownerId;
                    piece.ownerName = this._getNodeName(piece.ownerId);
                    piece.price = null;
                } else {
                    piece.status = GenerativeArtApp.STATUS.LISTED;
                    piece.price = latest.payload.metadata?.price || piece.price;
                }
            }
        }
        
        // Check for transfer events
        const transferEvents = this.sdk.queryAppEvents(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PIECE_TRANSFER,
            { ref: pieceId }
        );
        
        if (transferEvents.length > 0) {
            const latest = transferEvents[transferEvents.length - 1];
            piece.ownerId = latest.payload.target;
            piece.ownerName = this._getNodeName(piece.ownerId);
            piece.status = GenerativeArtApp.STATUS.TRANSFERRED;
        }
        
        await this.store.put(pieceId, piece);
    }
    
    /**
     * Set up listener for art-related events
     * @private
     */
    _setupEventListener() {
        this.sdk.onAppEvent(GenerativeArtApp.APP_ID, async (event) => {
            console.log(`🎨 Art event: ${event.action}`, event.payload);
            
            // Trigger custom callbacks if set
            if (this.onProjectEvent && event.action === GenerativeArtApp.ACTIONS.PROJECT_CREATE) {
                this.onProjectEvent(event);
            }
            if (this.onMintEvent && event.action === GenerativeArtApp.ACTIONS.PIECE_MINT) {
                this.onMintEvent(event);
            }
            if (this.onSaleEvent && event.action === GenerativeArtApp.ACTIONS.PIECE_PURCHASE) {
                this.onSaleEvent(event);
            }
        });
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PROJECT MANAGEMENT (Artists)
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Create a generative art project
     * 
     * @param {Object} options - Project options
     * @param {string} options.title - Project title
     * @param {string} [options.description] - Project description
     * @param {string} [options.code] - Generative art code (JavaScript)
     * @param {Object} [options.parameters] - Parameter ranges for generation
     * @param {number} [options.maxSupply] - Maximum number of pieces (null for unlimited)
     * @param {number} [options.mintPrice] - Price to mint a piece (in KARMA)
     * @param {string} [options.artistName] - Artist name
     * @returns {Promise<string>} Project ID
     * 
     * @example
     * const projectId = await app.createProject({
     *     title: 'Fractal Dreams',
     *     description: 'Generative fractal art',
     *     code: 'function generate() { ... }',
     *     maxSupply: 100,
     *     mintPrice: 10
     * });
     */
    async createProject(options) {
        // Ensure store is initialized
        await this._initPromise;
        
        if (!options.title) {
            throw new Error('Project title is required');
        }
        
        const projectId = this.sdk.generateId('proj');
        
        // Get artist name from chain
        let artistName = options.artistName || null;
        if (!artistName && this.sdk.chain) {
            const nodes = this.sdk.chain.buildNodeMap();
            const node = nodes[this.sdk.nodeId];
            if (node) {
                artistName = node.name;
            }
        }
        
        // Generate preview thumbnail if code is provided
        let thumbnailUrl = null;
        if (options.code && options.code.trim()) {
            try {
                console.log('🎨 Generating thumbnail for project:', projectId);
                thumbnailUrl = await this._executeCode(options.code, {
                    seed: `preview_${projectId}`,
                    ...options.parameters
                });
                
                if (thumbnailUrl) {
                    console.log('✅ Thumbnail generated successfully');
                } else {
                    console.warn('⚠️ Thumbnail generation returned null - code may not have returned an image');
                }
            } catch (error) {
                console.error('❌ Failed to generate preview thumbnail:', error);
                console.error('   This will not prevent project creation, but thumbnail will be missing');
            }
        } else {
            console.log('ℹ️ No code provided, skipping thumbnail generation');
        }
        
        // Full project data (stored OFF-CHAIN)
        const projectData = {
            id: projectId,
            type: 'project',
            title: options.title,
            description: options.description || '',
            code: options.code || null,
            parameters: options.parameters || {},
            maxSupply: options.maxSupply || null,
            mintPrice: options.mintPrice || 0,
            artistId: this.sdk.nodeId,
            artistName: artistName,
            createdAt: Date.now(),
            pieceCount: 0,
            status: GenerativeArtApp.PROJECT_STATUS.DRAFT, // Projects start as DRAFT
            thumbnailUrl: thumbnailUrl
        };
        
        // Store full data OFF-CHAIN (including thumbnail)
        await this.store.put(projectId, projectData);
        
        console.log('💾 Project stored with thumbnail:', {
            projectId,
            hasThumbnail: !!projectData.thumbnailUrl,
            thumbnailSize: projectData.thumbnailUrl ? projectData.thumbnailUrl.length : 0
        });
        
        // Hash for on-chain reference (exclude thumbnail from hash - too large)
        const dataForHash = { ...projectData };
        delete dataForHash.thumbnailUrl;
        const dataHash = await this.sdk.hashData(dataForHash);
        
        // Submit proof ON-CHAIN
        // Store code on-chain in metadata so anyone can generate thumbnails and mint pieces
        // Code is stored as a clean string (trimmed, no extra whitespace)
        const codeForChain = options.code ? options.code.trim() : null;
        
        const success = await this.sdk.submitAppEvent(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PROJECT_CREATE,
            {
                ref: projectId,
                dataHash: dataHash,
                metadata: {
                    title: options.title,
                    artistName: artistName,
                    maxSupply: options.maxSupply,
                    mintPrice: options.mintPrice || 0,
                    hasThumbnail: !!thumbnailUrl,
                    code: codeForChain, // ✅ p5.js code stored ON-CHAIN (trimmed, clean)
                    parameters: JSON.stringify(options.parameters || {}), // Parameters as JSON string
                    thumbnailUrl: thumbnailUrl ? thumbnailUrl.substring(0, 100) + '...' : null // Preview only
                }
            }
        );
        
        if (!success) {
            // Rollback off-chain data
            await this.store.delete(projectId);
            throw new Error('Failed to submit project to blockchain');
        }
        
        console.log(`✅ Project created: ${projectId}`);
        return projectId;
    }
    
    /**
     * Release a project so anyone can mint from it
     * Only the artist can release their project
     * 
     * @param {string} projectId - Project ID
     * @returns {Promise<boolean>} Success
     */
    async releaseProject(projectId) {
        // Ensure store is initialized
        await this._initPromise;
        
        const project = await this.store.get(projectId);
        if (!project) {
            throw new Error('Project not found');
        }
        
        // Only artist can release
        if (project.artistId !== this.sdk.nodeId) {
            throw new Error('Only the artist can release their project');
        }
        
        // Already released?
        if (project.status === GenerativeArtApp.PROJECT_STATUS.RELEASED) {
            console.log('Project is already released');
            return true;
        }
        
        // Update status
        project.status = GenerativeArtApp.PROJECT_STATUS.RELEASED;
        await this.store.put(projectId, project);
        
        // Submit on-chain event (optional - for tracking releases)
        const dataHash = await this.sdk.hashData({ projectId, status: 'RELEASED' });
        await this.sdk.submitAppEvent(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PROJECT_CREATE, // Reuse PROJECT_CREATE with updated metadata
            {
                ref: projectId,
                dataHash: dataHash,
                metadata: {
                    ...project,
                    status: 'RELEASED',
                    releasedAt: Date.now()
                }
            }
        );
        
        console.log(`✅ Project released: ${projectId}`);
        return true;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // MINTING (Artists and Collectors)
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Mint a generative art piece from a project
     * 
     * @param {string} projectId - Project ID
     * @param {Object} [options] - Minting options
     * @param {Object} [options.parameters] - Specific parameters for this piece
     * @param {string} [options.seed] - Random seed for generation
     * @param {string} [options.imageUrl] - Pre-generated image URL
     * @returns {Promise<string>} Piece ID
     * 
     * @example
     * const pieceId = await app.mintPiece(projectId, {
     *     seed: 'random_seed_123',
     *     parameters: { color: 'blue', size: 100 }
     * });
     */
    async mintPiece(projectId, options = {}) {
        // Ensure store is initialized
        await this._initPromise;
        
        const project = await this.store.get(projectId);
        if (!project) {
            throw new Error('Project not found');
        }
        
        // Check project status: only released projects can be minted by anyone
        // Artists can mint their own draft projects
        const isArtist = project.artistId === this.sdk.nodeId;
        if (project.status !== GenerativeArtApp.PROJECT_STATUS.RELEASED && !isArtist) {
            throw new Error('Project is not released yet. Only the artist can mint from draft projects.');
        }
        
        // Check max supply
        if (project.maxSupply && project.pieceCount >= project.maxSupply) {
            throw new Error(`Project has reached maximum supply of ${project.maxSupply}`);
        }
        
        // Check if mint price is set and user has enough KARMA
        if (project.mintPrice > 0) {
            const balance = this.sdk.getKarmaBalance();
            if (balance < project.mintPrice) {
                throw new Error(`Insufficient KARMA. Required: ${project.mintPrice}, You have: ${balance}`);
            }
            
            // Transfer KARMA to artist (if not the artist themselves)
            if (project.artistId !== this.sdk.nodeId) {
                try {
                    await window.SrishtiApp.transferKarma(project.artistId, project.mintPrice, `Mint payment for ${project.title}`);
                } catch (error) {
                    throw new Error(`Failed to pay mint fee: ${error.message}`);
                }
            }
        }
        
        const pieceId = this.sdk.generateId('piece');
        const seed = options.seed || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Generate parameters if not provided
        let parameters = options.parameters || {};
        if (!options.parameters && project.parameters) {
            // Auto-generate parameters from ranges
            parameters = this._generateParameters(project.parameters, seed);
        }
        
        // Generate image if code is available
        let imageUrl = options.imageUrl || null;
        if (!imageUrl && project.code) {
            try {
                imageUrl = await this._executeCode(project.code, {
                    seed: seed,
                    ...parameters
                });
            } catch (error) {
                console.warn('Failed to generate image for piece:', error);
            }
        }
        
        // Full piece data (OFF-CHAIN)
        const pieceData = {
            id: pieceId,
            type: 'piece',
            projectId: projectId,
            projectTitle: project.title,
            artistId: project.artistId,
            artistName: project.artistName,
            ownerId: this.sdk.nodeId,
            ownerName: this._getNodeName(this.sdk.nodeId),
            mintedAt: Date.now(),
            seed: seed,
            parameters: parameters,
            imageUrl: imageUrl,
            status: GenerativeArtApp.STATUS.MINTED,
            price: null, // Not listed for sale yet
            transferHistory: [{
                from: null,
                to: this.sdk.nodeId,
                timestamp: Date.now(),
                type: 'MINT'
            }]
        };
        
        // Store off-chain
        await this.store.put(pieceId, pieceData);
        
        // Update project piece count
        project.pieceCount = (project.pieceCount || 0) + 1;
        await this.store.put(projectId, project);
        
        // Hash for verification
        const dataHash = await this.sdk.hashData(pieceData);
        
        // Submit proof ON-CHAIN
        const success = await this.sdk.submitAppEvent(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PIECE_MINT,
            {
                ref: projectId,
                target: pieceId,
                dataHash: dataHash,
                metadata: {
                    projectTitle: project.title,
                    artistId: project.artistId,
                    ownerId: this.sdk.nodeId,
                    mintedAt: pieceData.mintedAt,
                    seed: seed
                }
            }
        );
        
        if (!success) {
            // Rollback
            await this.store.delete(pieceId);
            project.pieceCount--;
            await this.store.put(projectId, project);
            throw new Error('Failed to submit mint to blockchain');
        }
        
        console.log(`✅ Piece minted: ${pieceId}`);
        return pieceId;
    }
    
    /**
     * Generate parameters from parameter ranges using seed
     * @private
     */
    _generateParameters(parameterRanges, seed) {
        const params = {};
        const rng = this._seededRandom(seed);
        
        for (const [key, range] of Object.entries(parameterRanges)) {
            if (range.type === 'number') {
                params[key] = range.min + (range.max - range.min) * rng();
            } else if (range.type === 'choice') {
                params[key] = range.options[Math.floor(rng() * range.options.length)];
            } else if (range.type === 'color') {
                params[key] = `hsl(${Math.floor(rng() * 360)}, ${50 + rng() * 50}%, ${40 + rng() * 40}%)`;
            }
        }
        
        return params;
    }
    
    /**
     * Seeded random number generator
     * @private
     */
    _seededRandom(seed) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash = hash & hash;
        }
        let value = Math.abs(hash) / 2147483647;
        return () => {
            value = (value * 9301 + 49297) % 233280;
            return value / 233280;
        };
    }
    
    /**
     * Get node name from chain
     * @private
     */
    _getNodeName(nodeId) {
        if (!this.sdk.chain) return null;
        const nodes = this.sdk.chain.buildNodeMap();
        const node = nodes[nodeId];
        return node?.name || null;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // MARKETPLACE (Buy/Sell)
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * List an art piece for sale
     * 
     * @param {string} pieceId - Piece ID
     * @param {number} price - Sale price in KARMA
     * @returns {Promise<boolean>}
     */
    async listForSale(pieceId, price) {
        // Ensure store is initialized
        await this._initPromise;
        
        if (!price || price <= 0) {
            throw new Error('Price must be greater than 0');
        }
        
        const piece = await this.store.get(pieceId);
        if (!piece) {
            throw new Error('Piece not found');
        }
        
        if (piece.ownerId !== this.sdk.nodeId) {
            throw new Error('You do not own this piece');
        }
        
        if (piece.status === GenerativeArtApp.STATUS.LISTED) {
            throw new Error('Piece is already listed for sale');
        }
        
        // Update off-chain data
        piece.status = GenerativeArtApp.STATUS.LISTED;
        piece.price = price;
        piece.listedAt = Date.now();
        await this.store.put(pieceId, piece);
        
        // Submit on-chain
        const success = await this.sdk.submitAppEvent(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PIECE_LIST,
            {
                ref: pieceId,
                metadata: {
                    price: price,
                    ownerId: this.sdk.nodeId,
                    listedAt: piece.listedAt
                }
            }
        );
        
        if (!success) {
            // Rollback
            piece.status = GenerativeArtApp.STATUS.MINTED;
            piece.price = null;
            delete piece.listedAt;
            await this.store.put(pieceId, piece);
            throw new Error('Failed to list piece on blockchain');
        }
        
        console.log(`✅ Piece listed for sale: ${pieceId} at ${price} KARMA`);
        return true;
    }
    
    /**
     * Unlist an art piece from sale
     * 
     * @param {string} pieceId - Piece ID
     * @returns {Promise<boolean>}
     */
    async unlistFromSale(pieceId) {
        // Ensure store is initialized
        await this._initPromise;
        
        const piece = await this.store.get(pieceId);
        if (!piece) {
            throw new Error('Piece not found');
        }
        
        if (piece.ownerId !== this.sdk.nodeId) {
            throw new Error('You do not own this piece');
        }
        
        if (piece.status !== GenerativeArtApp.STATUS.LISTED) {
            throw new Error('Piece is not listed for sale');
        }
        
        // Update off-chain data
        piece.status = GenerativeArtApp.STATUS.MINTED;
        const oldPrice = piece.price;
        piece.price = null;
        delete piece.listedAt;
        await this.store.put(pieceId, piece);
        
        // Submit on-chain
        const success = await this.sdk.submitAppEvent(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PIECE_UNLIST,
            {
                ref: pieceId,
                metadata: {
                    oldPrice: oldPrice
                }
            }
        );
        
        if (!success) {
            // Rollback
            piece.status = GenerativeArtApp.STATUS.LISTED;
            piece.price = oldPrice;
            piece.listedAt = Date.now();
            await this.store.put(pieceId, piece);
            throw new Error('Failed to unlist piece on blockchain');
        }
        
        console.log(`✅ Piece unlisted: ${pieceId}`);
        return true;
    }
    
    /**
     * Purchase an art piece from the marketplace
     * 
     * @param {string} pieceId - Piece ID
     * @returns {Promise<boolean>}
     */
    async purchasePiece(pieceId) {
        // Ensure store is initialized
        await this._initPromise;
        
        const piece = await this.store.get(pieceId);
        if (!piece) {
            throw new Error('Piece not found');
        }
        
        if (piece.status !== GenerativeArtApp.STATUS.LISTED) {
            throw new Error('Piece is not listed for sale');
        }
        
        if (piece.ownerId === this.sdk.nodeId) {
            throw new Error('You already own this piece');
        }
        
        // Check balance
        const balance = this.sdk.getKarmaBalance();
        if (balance < piece.price) {
            throw new Error(`Insufficient KARMA. Required: ${piece.price}, You have: ${balance}`);
        }
        
        const previousOwnerId = piece.ownerId;
        const previousOwnerName = piece.ownerName;
        const salePrice = piece.price; // Save price before clearing it
        
        // Transfer KARMA to previous owner
        try {
            await window.SrishtiApp.transferKarma(previousOwnerId, salePrice, `Purchase of ${piece.projectTitle} #${pieceId}`);
        } catch (error) {
            throw new Error(`Failed to transfer payment: ${error.message}`);
        }
        
        // Update ownership
        piece.ownerId = this.sdk.nodeId;
        piece.ownerName = this._getNodeName(this.sdk.nodeId);
        piece.status = GenerativeArtApp.STATUS.SOLD;
        piece.soldAt = Date.now();
        piece.price = null;
        delete piece.listedAt;
        
        // Add to transfer history
        piece.transferHistory.push({
            from: previousOwnerId,
            to: this.sdk.nodeId,
            timestamp: Date.now(),
            type: 'PURCHASE',
            price: salePrice
        });
        
        await this.store.put(pieceId, piece);
        
        // Submit on-chain
        const success = await this.sdk.submitAppEvent(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PIECE_PURCHASE,
            {
                ref: pieceId,
                target: previousOwnerId,
                metadata: {
                    newOwnerId: this.sdk.nodeId,
                    price: salePrice,
                    soldAt: piece.soldAt
                }
            }
        );
        
        if (!success) {
            // Rollback is complex - would need to reverse KARMA transfer
            throw new Error('Failed to record purchase on blockchain');
        }
        
        console.log(`✅ Piece purchased: ${pieceId} from ${previousOwnerName}`);
        return true;
    }
    
    /**
     * Transfer an art piece to another user (gift)
     * 
     * @param {string} pieceId - Piece ID
     * @param {string} recipientId - Recipient node ID
     * @returns {Promise<boolean>}
     */
    async transferPiece(pieceId, recipientId) {
        // Ensure store is initialized
        await this._initPromise;
        
        const piece = await this.store.get(pieceId);
        if (!piece) {
            throw new Error('Piece not found');
        }
        
        if (piece.ownerId !== this.sdk.nodeId) {
            throw new Error('You do not own this piece');
        }
        
        if (piece.status === GenerativeArtApp.STATUS.LISTED) {
            throw new Error('Cannot transfer listed piece. Unlist it first.');
        }
        
        // Verify recipient exists
        if (!this.sdk.nodeExists(recipientId)) {
            throw new Error('Recipient node does not exist');
        }
        
        const previousOwnerId = piece.ownerId;
        
        // Update ownership
        piece.ownerId = recipientId;
        piece.ownerName = this._getNodeName(recipientId);
        piece.status = GenerativeArtApp.STATUS.TRANSFERRED;
        
        // Add to transfer history
        piece.transferHistory.push({
            from: previousOwnerId,
            to: recipientId,
            timestamp: Date.now(),
            type: 'TRANSFER'
        });
        
        await this.store.put(pieceId, piece);
        
        // Submit on-chain
        const success = await this.sdk.submitAppEvent(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PIECE_TRANSFER,
            {
                ref: pieceId,
                target: recipientId,
                metadata: {
                    previousOwnerId: previousOwnerId,
                    transferredAt: Date.now()
                }
            }
        );
        
        if (!success) {
            // Rollback
            piece.ownerId = previousOwnerId;
            piece.ownerName = this._getNodeName(previousOwnerId);
            piece.status = GenerativeArtApp.STATUS.MINTED;
            piece.transferHistory.pop();
            await this.store.put(pieceId, piece);
            throw new Error('Failed to record transfer on blockchain');
        }
        
        console.log(`✅ Piece transferred: ${pieceId} to ${recipientId}`);
        return true;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // QUERIES
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Get all projects
     * @returns {Promise<Array>}
     */
    async getAllProjects() {
        // Ensure store is initialized
        await this._initPromise;
        
        // First, sync with chain to ensure we have all data
        await this._syncWithChain();
        
        // Get all projects from store (more reliable than just on-chain events)
        const allProjects = await this.store.filter(p => p.type === 'project');
        
        // Also check on-chain events to catch any we might have missed
        const events = this.sdk.queryAppEvents(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PROJECT_CREATE
        );
        
        const projectMap = new Map();
        allProjects.forEach(p => projectMap.set(p.id, p));
        
        // Add any from on-chain that aren't in local store
        for (const event of events) {
            const projectId = event.payload.ref;
            if (!projectMap.has(projectId)) {
                const project = await this.store.get(projectId);
                if (project) {
                    projectMap.set(projectId, project);
                }
            }
        }
        
        return Array.from(projectMap.values());
    }
    
    /**
     * Get my projects (projects I created)
     * @returns {Promise<Array>}
     */
    async getMyProjects() {
        // Ensure store is initialized and synced
        await this._initPromise;
        await this._syncWithChain();
        
        // Get all projects and filter by artist
        const allProjects = await this.getAllProjects();
        return allProjects.filter(p => p.artistId === this.sdk.nodeId);
    }
    
    /**
     * Get released projects (projects that anyone can mint from)
     * @returns {Promise<Array>}
     */
    async getReleasedProjects() {
        // Ensure store is initialized and synced
        await this._initPromise;
        await this._syncWithChain();
        
        const allProjects = await this.getAllProjects();
        console.log('🔍 All projects:', allProjects.length, allProjects.map(p => ({ 
            id: p.id, 
            status: p.status, 
            statusType: typeof p.status,
            title: p.title,
            isReleasedConstant: p.status === GenerativeArtApp.PROJECT_STATUS.RELEASED,
            isReleasedString: p.status === 'RELEASED',
            constantValue: GenerativeArtApp.PROJECT_STATUS.RELEASED
        })));
        
        // Filter for released projects (check both constant and string)
        const released = allProjects.filter(p => {
            const status = p.status || 'DRAFT';
            // Check multiple ways the status might be stored
            const isReleased = status === GenerativeArtApp.PROJECT_STATUS.RELEASED || 
                              status === 'RELEASED' ||
                              status === GenerativeArtApp.PROJECT_STATUS.RELEASED.toString() ||
                              String(status).toUpperCase() === 'RELEASED';
            
            if (isReleased) {
                console.log('✅ Found released project:', p.id, 'status:', status, 'type:', typeof status);
            }
            return isReleased;
        });
        
        console.log('✅ Released projects:', released.length, released.map(p => ({ id: p.id, status: p.status, title: p.title })));
        return released;
    }
    
    /**
     * Get a specific project
     * @param {string} projectId - Project ID
     * @param {boolean} generateThumbnailIfMissing - Generate thumbnail if missing (default: true)
     * @returns {Promise<Object|null>}
     */
    async getProject(projectId, generateThumbnailIfMissing = true) {
        // Ensure store is initialized and synced
        await this._initPromise;
        await this._syncWithChain();
        
        const project = await this.store.get(projectId);
        
        // Generate thumbnail on-demand if missing
        if (project && generateThumbnailIfMissing && !project.thumbnailUrl && project.code) {
            try {
                console.log('🎨 Generating thumbnail on-demand for project:', projectId);
                const thumbnailUrl = await this._executeCode(project.code, {
                    seed: `preview_${projectId}`,
                    ...(project.parameters || {})
                });
                if (thumbnailUrl) {
                    project.thumbnailUrl = thumbnailUrl;
                    await this.store.put(projectId, project);
                    console.log('✅ Thumbnail generated on-demand');
                }
            } catch (error) {
                console.warn('Failed to generate thumbnail on-demand:', projectId, error);
            }
        }
        
        return project;
    }
    
    /**
     * Get all art pieces
     * @returns {Promise<Array>}
     */
    async getAllPieces() {
        // Ensure store is initialized
        await this._initPromise;
        
        // First, sync with chain to ensure we have all data
        await this._syncWithChain();
        
        // Get all pieces from store (more reliable than just on-chain events)
        const allPieces = await this.store.filter(p => p.type === 'piece');
        
        // Also check on-chain events to catch any we might have missed
        const events = this.sdk.queryAppEvents(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PIECE_MINT
        );
        
        const pieceMap = new Map();
        allPieces.forEach(p => pieceMap.set(p.id, p));
        
        // Add any from on-chain that aren't in local store
        for (const event of events) {
            const pieceId = event.payload.target;
            if (!pieceMap.has(pieceId)) {
                const piece = await this.store.get(pieceId);
                if (piece) {
                    pieceMap.set(pieceId, piece);
                }
            }
        }
        
        return Array.from(pieceMap.values());
    }
    
    /**
     * Get pieces for a project
     * @param {string} projectId - Project ID
     * @returns {Promise<Array>}
     */
    async getProjectPieces(projectId) {
        return await this.store.filter(p => p.type === 'piece' && p.projectId === projectId);
    }
    
    /**
     * Get my art pieces (pieces I own)
     * @returns {Promise<Array>}
     */
    async getMyPieces() {
        // Ensure store is initialized and synced
        await this._initPromise;
        await this._syncWithChain();
        
        // Get all pieces and filter by owner
        const allPieces = await this.getAllPieces();
        return allPieces.filter(p => p.ownerId === this.sdk.nodeId);
    }
    
    /**
     * Get pieces listed for sale
     * @returns {Promise<Array>}
     */
    async getListedPieces() {
        // Ensure store is initialized and synced
        await this._initPromise;
        await this._syncWithChain();
        
        // Get all pieces and filter for listed ones
        // We'll update status on-demand for listed pieces only
        const allPieces = await this.store.filter(p => p.type === 'piece');
        const listedPieces = [];
        
        for (const piece of allPieces) {
            // Update status from chain
            await this._updatePieceStatusFromChain(piece.id);
            
            // Re-fetch to get updated status
            const updatedPiece = await this.store.get(piece.id);
            if (updatedPiece && updatedPiece.status === GenerativeArtApp.STATUS.LISTED) {
                listedPieces.push(updatedPiece);
            }
        }
        
        return listedPieces;
    }
    
    /**
     * Get a specific piece
     * @param {string} pieceId - Piece ID
     * @returns {Promise<Object|null>}
     */
    async getPiece(pieceId) {
        // Ensure store is initialized and synced
        await this._initPromise;
        await this._syncWithChain();
        
        // Update status from chain before returning
        await this._updatePieceStatusFromChain(pieceId);
        
        return await this.store.get(pieceId);
    }
    
    /**
     * Get gallery (all pieces with images)
     * @returns {Promise<Array>}
     */
    async getGallery() {
        const allPieces = await this.getAllPieces();
        return allPieces.filter(p => p.imageUrl || p.parameters); // Has visual representation
    }
    
    /**
     * Execute generative code and generate an image
     * @private
     */
    async _executeCode(code, params) {
        try {
            console.log('🎨 Executing generative code with params:', params);
            
            // Check if p5.js is available
            if (typeof p5 !== 'undefined') {
                return await this._executeCodeWithP5(code, params);
            }
            
            // Fallback to canvas-based execution
            // Create a canvas element for rendering
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');
            
            // Create a safe execution context with p5.js-like functions
            const generateFunction = new Function('params', 'canvas', 'ctx', `
                // Helper functions
                function hash(str) {
                    let h = 0;
                    for (let i = 0; i < str.length; i++) {
                        h = ((h << 5) - h) + str.charCodeAt(i);
                        h = h & h;
                    }
                    return Math.abs(h);
                }
                
                // Canvas dimensions (p5.js width/height)
                const width = canvas.width;
                const height = canvas.height;
                
                // p5.js color() function
                function color(r, g, b, a = 255) {
                    if (arguments.length === 1) return r;
                    if (arguments.length === 3) return \`rgb(\${r}, \${g}, \${b})\`;
                    return \`rgba(\${r}, \${g}, \${b}, \${a / 255})\`;
                }
                
                // p5.js background()
                function background(...args) {
                    ctx.fillStyle = args.length === 1 ? args[0] : color(...args);
                    ctx.fillRect(0, 0, width, height);
                }
                
                // p5.js fill()
                function fill(...args) {
                    ctx.fillStyle = args.length === 1 ? args[0] : color(...args);
                }
                
                // p5.js stroke()
                function stroke(...args) {
                    ctx.strokeStyle = args.length === 1 ? args[0] : color(...args);
                }
                
                // p5.js noStroke()
                function noStroke() {
                    ctx.strokeStyle = 'transparent';
                }
                
                // p5.js noFill()
                function noFill() {
                    ctx.fillStyle = 'transparent';
                }
                
                // p5.js strokeWeight()
                function strokeWeight(w) {
                    ctx.lineWidth = w;
                }
                
                // p5.js ellipse()
                function ellipse(x, y, w, h) {
                    ctx.beginPath();
                    ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    if (ctx.strokeStyle !== 'transparent') ctx.stroke();
                }
                
                // p5.js rect()
                function rect(x, y, w, h) {
                    ctx.fillRect(x, y, w, h);
                    if (ctx.strokeStyle !== 'transparent') ctx.strokeRect(x, y, w, h);
                }
                
                // p5.js line()
                function line(x1, y1, x2, y2) {
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                
                // p5.js point()
                function point(x, y) {
                    ctx.fillRect(x, y, 1, 1);
                }
                
                // p5.js triangle()
                function triangle(x1, y1, x2, y2, x3, y3) {
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.lineTo(x3, y3);
                    ctx.closePath();
                    ctx.fill();
                    if (ctx.strokeStyle !== 'transparent') ctx.stroke();
                }
                
                // p5.js map()
                function map(value, start1, stop1, start2, stop2) {
                    return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
                }
                
                // p5.js lerp()
                function lerp(start, stop, amt) {
                    return start + (stop - start) * amt;
                }
                
                // p5.js constrain()
                function constrain(n, low, high) {
                    return Math.max(Math.min(n, high), low);
                }
                
                // p5.js transformations
                function push() { ctx.save(); }
                function pop() { ctx.restore(); }
                function translate(x, y) { ctx.translate(x, y); }
                function rotate(angle) { ctx.rotate(angle); }
                function scale(x, y = x) { ctx.scale(x, y); }
                
                // Seeded random (will be set up below)
                let rngSeed = hash(params.seed || 'default');
                function random(min = 0, max = 1) {
                    rngSeed = (rngSeed * 1103515245 + 12345) & 0x7fffffff;
                    const val = rngSeed / 0x7fffffff;
                    return min + val * (max - min);
                }
                
                ${code}
                
                // Call generate function if it exists
                if (typeof generate === 'function') {
                    const result = generate(params);
                    // If result is a canvas, return it
                    if (result && (result.nodeName === 'CANVAS' || (typeof result.toDataURL === 'function' && typeof result.getContext === 'function'))) {
                        return result;
                    }
                    // If result is a data URL, return it
                    if (typeof result === 'string' && result.startsWith('data:image')) {
                        return result;
                    }
                    // If result is null/undefined but code executed, return canvas
                    if (result === null || result === undefined) {
                        return canvas;
                    }
                    return result;
                }
                
                // If no generate function, return the canvas (code might have drawn directly)
                return canvas;
            `);
            
            const result = generateFunction(params, canvas, ctx);
            
            console.log('🎨 Code execution result type:', typeof result, result?.constructor?.name);
            
            // If result is a data URL, return it
            if (typeof result === 'string' && result.startsWith('data:image')) {
                console.log('✅ Generated image data URL (length:', result.length, ')');
                return result;
            }
            
            // If result is a canvas, convert to data URL
            if (result && result.nodeName === 'CANVAS') {
                console.log('✅ Generated canvas, converting to data URL');
                return result.toDataURL('image/png');
            }
            
            // If result is a canvas element (check by methods)
            if (result && typeof result.toDataURL === 'function' && typeof result.getContext === 'function') {
                console.log('✅ Generated canvas-like object, converting to data URL');
                return result.toDataURL('image/png');
            }
            
            // If result is the canvas we created, return it
            if (result === canvas) {
                console.log('✅ Code executed, returning canvas');
                return canvas.toDataURL('image/png');
            }
            
            // If no result, log warning
            console.warn('⚠️ Code execution returned no valid image. Result:', result);
            return null;
        } catch (error) {
            console.error('❌ Error executing generative code:', error);
            console.error('   Code snippet:', code ? code.substring(0, 200) : 'null');
            console.error('   Params:', params);
            throw new Error(`Code execution failed: ${error.message}`);
        }
    }
    
    /**
     * Execute code using p5.js library (when available).
     * Uses SrishtiP5SketchRunner when present (setup/draw + hashData, or generate).
     * @private
     */
    async _executeCodeWithP5(code, params) {
        if (typeof window !== 'undefined' && window.SrishtiP5SketchRunner && typeof window.SrishtiP5SketchRunner.runExport === 'function') {
            try {
                const dataUrl = await window.SrishtiP5SketchRunner.runExport(code, params);
                return dataUrl || null;
            } catch (error) {
                console.error('SrishtiP5SketchRunner.runExport failed:', error);
                throw new Error(`Code execution failed: ${error.message}`);
            }
        }
        return this._executeCodeWithP5Legacy(code, params);
    }
    
    /**
     * Legacy p5 execution (generate-only). Used when runner not loaded.
     * @private
     */
    async _executeCodeWithP5Legacy(code, params) {
        return new Promise((resolve, reject) => {
            try {
                const container = document.createElement('div');
                container.style.position = 'absolute';
                container.style.left = '-9999px';
                container.style.width = '512px';
                container.style.height = '512px';
                document.body.appendChild(container);
                let p5Instance = null;
                let resolved = false;
                const sketch = (p) => {
                    p5Instance = p;
                    const userCode = new Function('p', 'params', 'THREE', `
                        const background = p.background.bind(p), fill = p.fill.bind(p), stroke = p.stroke.bind(p),
                            noStroke = p.noStroke.bind(p), noFill = p.noFill.bind(p), ellipse = p.ellipse.bind(p),
                            rect = p.rect.bind(p), line = p.line.bind(p), translate = p.translate.bind(p),
                            rotate = p.rotate.bind(p), scale = p.scale.bind(p), push = p.push.bind(p), pop = p.pop.bind(p),
                            map = p.map.bind(p), lerp = p.lerp.bind(p), random = p.random.bind(p), noise = p.noise.bind(p),
                            color = p.color.bind(p), createCanvas = p.createCanvas.bind(p), createGraphics = p.createGraphics.bind(p),
                            image = p.image.bind(p), text = p.text.bind(p), textSize = p.textSize.bind(p), textAlign = p.textAlign.bind(p);
                        const width = p.width, height = p.height, TWO_PI = p.TWO_PI, PI = p.PI;
                        const hashData = { seed: params && params.seed, ...params };
                        ${code}
                        if (typeof generate === 'function') {
                            const result = generate(hashData);
                            if (result && result.nodeName === 'CANVAS') p.image(result, 0, 0, p.width, p.height);
                            else if (result && result.canvas) p.image(result, 0, 0, p.width, p.height);
                        }
                    `);
                    p.setup = () => {
                        p.createCanvas(512, 512);
                        try {
                            userCode(p, params, typeof THREE !== 'undefined' ? THREE : null);
                        } catch (e) {
                            p.background(20);
                            p.fill(255, 0, 0);
                            p.text('Error: ' + e.message, 10, 20);
                        }
                    };
                    p.draw = () => {
                        if (p.frameCount === 1 && !resolved && p5Instance && p5Instance.canvas) {
                            resolved = true;
                            const dataUrl = p5Instance.canvas.toDataURL('image/png');
                            if (container.parentNode) container.parentNode.removeChild(container);
                            p.remove();
                            resolve(dataUrl);
                        }
                    };
                };
                new p5(sketch, container);
                setTimeout(() => {
                    if (!resolved && p5Instance && p5Instance.canvas) {
                        resolved = true;
                        const dataUrl = p5Instance.canvas.toDataURL('image/png');
                        if (container.parentNode) container.parentNode.removeChild(container);
                        p5Instance.remove();
                        resolve(dataUrl);
                    } else if (!resolved) {
                        resolved = true;
                        if (container.parentNode) container.parentNode.removeChild(container);
                        reject(new Error('p5.js execution timeout'));
                    }
                }, 3000);
            } catch (e) {
                reject(e);
            }
        });
    }
    
    /**
     * Generate a preview/render for a project or piece
     * @param {string} projectId - Project ID
     * @param {string} [seed] - Optional seed for piece-specific render
     * @returns {Promise<string>} Data URL of the image
     */
    async generatePreview(projectId, seed = null) {
        const project = await this.store.get(projectId);
        if (!project || !project.code) {
            throw new Error('Project not found or has no code');
        }
        
        const params = {
            seed: seed || `preview_${projectId}_${Date.now()}`,
            ...project.parameters
        };
        
        return await this._executeCode(project.code, params);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GenerativeArtApp;
} else {
    window.SrishtiGenerativeArtApp = GenerativeArtApp;
}
