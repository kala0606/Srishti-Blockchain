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
        
        // Set up event listener for real-time updates
        this._setupEventListener();
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
        if (options.code) {
            try {
                thumbnailUrl = await this._executeCode(options.code, {
                    seed: `preview_${projectId}`,
                    ...options.parameters
                });
            } catch (error) {
                console.warn('Failed to generate preview thumbnail:', error);
            }
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
            status: 'ACTIVE',
            thumbnailUrl: thumbnailUrl
        };
        
        // Store full data OFF-CHAIN
        await this.store.put(projectId, projectData);
        
        // Hash for on-chain reference
        const dataHash = await this.sdk.hashData(projectData);
        
        // Submit minimal proof ON-CHAIN
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
                    mintPrice: options.mintPrice || 0
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
        const project = await this.store.get(projectId);
        if (!project) {
            throw new Error('Project not found');
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
        const events = this.sdk.queryAppEvents(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PROJECT_CREATE
        );
        
        const projects = [];
        for (const event of events) {
            const project = await this.store.get(event.payload.ref);
            if (project) {
                projects.push(project);
            }
        }
        
        return projects;
    }
    
    /**
     * Get my projects (projects I created)
     * @returns {Promise<Array>}
     */
    async getMyProjects() {
        return await this.store.filter(p => p.type === 'project' && p.artistId === this.sdk.nodeId);
    }
    
    /**
     * Get a specific project
     * @param {string} projectId - Project ID
     * @returns {Promise<Object|null>}
     */
    async getProject(projectId) {
        return await this.store.get(projectId);
    }
    
    /**
     * Get all art pieces
     * @returns {Promise<Array>}
     */
    async getAllPieces() {
        const events = this.sdk.queryAppEvents(
            GenerativeArtApp.APP_ID,
            GenerativeArtApp.ACTIONS.PIECE_MINT
        );
        
        const pieces = [];
        for (const event of events) {
            const piece = await this.store.get(event.payload.target);
            if (piece) {
                pieces.push(piece);
            }
        }
        
        return pieces;
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
        return await this.store.filter(p => p.type === 'piece' && p.ownerId === this.sdk.nodeId);
    }
    
    /**
     * Get pieces listed for sale
     * @returns {Promise<Array>}
     */
    async getListedPieces() {
        return await this.store.filter(p => p.type === 'piece' && p.status === GenerativeArtApp.STATUS.LISTED);
    }
    
    /**
     * Get a specific piece
     * @param {string} pieceId - Piece ID
     * @returns {Promise<Object|null>}
     */
    async getPiece(pieceId) {
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
        // Create a safe execution context
        const generateFunction = new Function('params', `
            ${code}
            return typeof generate === 'function' ? generate(params) : null;
        `);
        
        try {
            const result = generateFunction(params);
            
            // If result is a data URL, return it
            if (typeof result === 'string' && result.startsWith('data:image')) {
                return result;
            }
            
            // If result is a canvas, convert to data URL
            if (result && result.nodeName === 'CANVAS') {
                return result.toDataURL('image/png');
            }
            
            // If no result, return null
            return null;
        } catch (error) {
            console.error('Error executing generative code:', error);
            throw new Error(`Code execution failed: ${error.message}`);
        }
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
