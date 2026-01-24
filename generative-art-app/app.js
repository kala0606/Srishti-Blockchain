/**
 * Srishti Generative Art App - Standalone Application
 * 
 * A standalone generative art marketplace app that connects to the Srishti blockchain.
 */

class GenerativeArtAppUI {
    constructor() {
        this.sdk = null;
        this.artApp = null;
        this.srishtiApp = null;
        this.initialized = false;
    }

    async init() {
        try {
            console.log('🌐 Generative Art App Domain:', window.location.hostname);

            // Wait for blockchain instance to be available
            if (!window.srishtiAppInstance) {
                throw new Error('Srishti blockchain instance not loaded. Check script loading.');
            }

            this.srishtiApp = window.srishtiAppInstance;

            if (!this.srishtiApp.initialized) {
                try {
                    await this.srishtiApp.init();
                } catch (error) {
                    console.warn('⚠️ SrishtiApp init had issues:', error.message);
                }
            }

            // Wait for chain to be available
            let retries = 0;
            while (!this.srishtiApp.chain && retries < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                retries++;
            }

            if (!this.srishtiApp.chain) {
                throw new Error('Blockchain chain not available.');
            }

            // Wait for chain to be fully loaded
            retries = 0;
            while (this.srishtiApp.chain.getLength() === 0 && retries < 30) {
                await new Promise(resolve => setTimeout(resolve, 200));
                retries++;
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));

            // Session token authentication
            if (!window.SrishtiDAppAuth || !window.SrishtiSessionAuth) {
                throw new Error('Authentication libraries not loaded.');
            }

            const tokenData = await window.SrishtiDAppAuth.handleLoginCallback(this.srishtiApp.chain);
            if (tokenData) {
                console.log('✅ Authenticated via session token:', tokenData.nodeId);
                sessionStorage.removeItem('dapp_redirect_attempts');
                this.srishtiApp.nodeId = tokenData.nodeId;
                
                const nodes = this.srishtiApp.chain.buildNodeMap();
                const node = nodes[tokenData.nodeId];
                if (node) {
                    this.srishtiApp.currentUser = { id: tokenData.nodeId, name: node.name };
                    localStorage.setItem('srishti_node_name', node.name);
                }
            } else {
                const isAuthenticated = await window.SrishtiDAppAuth.isAuthenticated(this.srishtiApp.chain);
                
                if (!isAuthenticated) {
                    const redirectAttempts = parseInt(sessionStorage.getItem('dapp_redirect_attempts') || '0');
                    if (redirectAttempts < 3) {
                        sessionStorage.setItem('dapp_redirect_attempts', (redirectAttempts + 1).toString());
                        console.log('🔐 Not authenticated, redirecting to main app...');
                        window.SrishtiDAppAuth.redirectToMainApp();
                        return;
                    } else {
                        throw new Error('Authentication failed after multiple attempts. Please log in to the main app first.');
                    }
                } else {
                    const savedNodeId = localStorage.getItem('srishti_node_id');
                    if (savedNodeId) {
                        this.srishtiApp.nodeId = savedNodeId;
                    }
                }
            }

            // Initialize SDK
            const finalNodeId = this.srishtiApp.nodeId || localStorage.getItem('srishti_node_id');
            this.sdk = new window.SrishtiSDK({
                nodeId: finalNodeId
            });

            const connectionInfo = await this.sdk.connect();

            if (!connectionInfo.networkAvailable) {
                this.updateStatus('disconnected', '⚠️ Network not connected. You can view data but cannot create or purchase art.');
            }

            // Wait for GenerativeArtApp class to be available
            retries = 0;
            while (!window.SrishtiGenerativeArtApp && retries < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                retries++;
            }
            
            if (!window.SrishtiGenerativeArtApp) {
                console.error('❌ SrishtiGenerativeArtApp not found. Available window properties:', Object.keys(window).filter(k => k.includes('Srishti')));
                throw new Error('SrishtiGenerativeArtApp class not loaded. Check if sdk/apps/generative-art/GenerativeArtApp.js loaded correctly.');
            }
            
            if (typeof window.SrishtiGenerativeArtApp !== 'function') {
                console.error('❌ SrishtiGenerativeArtApp is not a function. Type:', typeof window.SrishtiGenerativeArtApp, 'Value:', window.SrishtiGenerativeArtApp);
                throw new Error('SrishtiGenerativeArtApp is not a constructor. Check the script export.');
            }
            
            console.log('✅ SrishtiGenerativeArtApp class found, initializing...');
            
            // Initialize Generative Art App
            this.artApp = new window.SrishtiGenerativeArtApp(this.sdk);

            this.initialized = true;

            const displayNodeId = this.srishtiApp.nodeId || finalNodeId;
            this.updateStatus('connected', `Connected as: ${displayNodeId}`);
            this.updateUserInfo();

            // Load initial data
            await this.loadGallery();
            await this.loadReleases();
            await this.loadMarketplace();
            await this.loadCollection();
            await this.loadProjects();

            // Set up event listeners
            this.setupEventListeners();

            console.log('✅ Generative Art app initialized');
        } catch (error) {
            console.error('Failed to initialize:', error);
            this.updateStatus('disconnected', `Error: ${error.message}`);
        }
    }

    updateStatus(type, message) {
        const statusEl = document.getElementById('status');
        statusEl.className = `status ${type}`;
        statusEl.textContent = message;
    }

    updateUserInfo() {
        const userInfoEl = document.getElementById('userInfo');
        if (!this.srishtiApp || !this.srishtiApp.nodeId) return;

        const nodeId = this.srishtiApp.nodeId;
        const karma = this.sdk ? this.sdk.getKarmaBalance() : 0;
        const nodeName = this.srishtiApp.currentUser?.name || 'Unknown';

        userInfoEl.innerHTML = `
            <div>👤 ${nodeName}</div>
            <div class="karma-balance">💰 ${karma} KARMA</div>
        `;
    }

    setupEventListeners() {
        // Create project form
        const createForm = document.getElementById('createProjectForm');
        if (createForm) {
            createForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.createProject();
            });
        }
    }

    async createProject() {
        try {
            const title = document.getElementById('projectTitle').value;
            const description = document.getElementById('projectDescription').value;
            const maxSupply = document.getElementById('projectMaxSupply').value ? 
                parseInt(document.getElementById('projectMaxSupply').value) : null;
            const mintPrice = parseFloat(document.getElementById('projectMintPrice').value) || 0;
            const code = document.getElementById('projectCode').value;

            if (!title) {
                alert('Project title is required');
                return;
            }

            // Show loading state
            const submitBtn = document.querySelector('#createProjectForm button[type="submit"]');
            const originalText = submitBtn?.textContent;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Creating project & generating thumbnail...';
            }

            const projectId = await this.artApp.createProject({
                title,
                description,
                code: code || null,
                maxSupply,
                mintPrice
            });

            // Get the created project to check thumbnail
            const project = await this.artApp.getProject(projectId);
            
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText || 'Create Project';
            }

            if (project.thumbnailUrl) {
                alert(`✅ Project created: ${projectId}\n\nThumbnail generated successfully!`);
            } else {
                alert(`✅ Project created: ${projectId}\n\n⚠️ Note: Thumbnail could not be generated. Make sure your code has a \`generate(params)\` function that returns a canvas or data URL.`);
            }
            
            // Reset form
            document.getElementById('createProjectForm').reset();
            
            // Reload projects
            await this.loadProjects();
            
            // Switch to projects tab
            const projectsTab = document.querySelector('.tab[onclick*="projects"]');
            if (projectsTab) {
                projectsTab.click();
            }
        } catch (error) {
            console.error('Failed to create project:', error);
            alert(`Failed to create project: ${error.message}`);
            
            // Re-enable button
            const submitBtn = document.querySelector('#createProjectForm button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = false;
            }
        }
    }

    async loadGallery() {
        const galleryEl = document.getElementById('galleryList');
        galleryEl.innerHTML = '<div class="loading">Loading gallery...</div>';

        try {
            const pieces = await this.artApp.getGallery();
            
            if (pieces.length === 0) {
                galleryEl.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <line x1="9" y1="3" x2="9" y2="21"/>
                            <line x1="15" y1="3" x2="15" y2="21"/>
                        </svg>
                        <p>No art pieces in gallery yet</p>
                    </div>
                `;
                return;
            }

            galleryEl.innerHTML = '<div class="gallery"></div>';
            const gallery = galleryEl.querySelector('.gallery');

            for (const piece of pieces) {
                const card = await this.createArtCard(piece);
                gallery.appendChild(card);
            }
        } catch (error) {
            console.error('Failed to load gallery:', error);
            galleryEl.innerHTML = `<div class="empty-state">Error loading gallery: ${error.message}</div>`;
        }
    }

    async loadMarketplace() {
        const marketplaceEl = document.getElementById('marketplaceList');
        marketplaceEl.innerHTML = '<div class="loading">Loading marketplace...</div>';

        try {
            const pieces = await this.artApp.getListedPieces();
            
            if (pieces.length === 0) {
                marketplaceEl.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="9" cy="21" r="1"/>
                            <circle cx="20" cy="21" r="1"/>
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                        </svg>
                        <p>No art pieces listed for sale</p>
                    </div>
                `;
                return;
            }

            marketplaceEl.innerHTML = '<div class="gallery"></div>';
            const gallery = marketplaceEl.querySelector('.gallery');

            for (const piece of pieces) {
                const card = await this.createArtCard(piece, true);
                gallery.appendChild(card);
            }
        } catch (error) {
            console.error('Failed to load marketplace:', error);
            marketplaceEl.innerHTML = `<div class="empty-state">Error loading marketplace: ${error.message}</div>`;
        }
    }

    async loadCollection() {
        const collectionEl = document.getElementById('collectionList');
        collectionEl.innerHTML = '<div class="loading">Loading collection...</div>';

        try {
            const pieces = await this.artApp.getMyPieces();
            
            if (pieces.length === 0) {
                collectionEl.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                        </svg>
                        <p>You don't own any art pieces yet</p>
                    </div>
                `;
                return;
            }

            collectionEl.innerHTML = '<div class="gallery"></div>';
            const gallery = collectionEl.querySelector('.gallery');

            for (const piece of pieces) {
                const card = await this.createArtCard(piece, false, true);
                gallery.appendChild(card);
            }
        } catch (error) {
            console.error('Failed to load collection:', error);
            collectionEl.innerHTML = `<div class="empty-state">Error loading collection: ${error.message}</div>`;
        }
    }

    async loadReleases() {
        const releasesEl = document.getElementById('releasesList');
        releasesEl.innerHTML = '<div class="loading">Loading releases...</div>';

        try {
            console.log('🔄 Loading released projects...');
            const projects = await this.artApp.getReleasedProjects();
            console.log('✅ Found released projects:', projects.length, projects.map(p => ({ id: p.id, status: p.status, hasCode: !!p.code, hasThumbnail: !!p.thumbnailUrl })));
            
            if (projects.length === 0) {
                // Check if there are any projects at all
                const allProjects = await this.artApp.getAllProjects();
                const draftProjects = allProjects.filter(p => (p.status || 'DRAFT') === 'DRAFT');
                
                if (draftProjects.length > 0) {
                    releasesEl.innerHTML = `
                        <div class="empty-state">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                            </svg>
                            <p>No released projects yet.</p>
                            <p style="font-size: 0.9em; color: var(--text-secondary); margin-top: 8px;">
                                There are ${draftProjects.length} project${draftProjects.length > 1 ? 's' : ''} that need to be released first.
                                <br>Go to "My Projects" to release them.
                            </p>
                        </div>
                    `;
                } else {
                    releasesEl.innerHTML = `
                        <div class="empty-state">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                            </svg>
                            <p>No released projects yet. Check back soon!</p>
                        </div>
                    `;
                }
                return;
            }

            releasesEl.innerHTML = '<div class="gallery"></div>';
            const gallery = releasesEl.querySelector('.gallery');

            // Generate thumbnails for projects that don't have them
            for (const project of projects) {
                console.log('📦 Processing project:', project.id, 'hasCode:', !!project.code, 'hasThumbnail:', !!project.thumbnailUrl, 'status:', project.status);
                
                const card = this.createReleaseCard(project);
                gallery.appendChild(card);
                
                // Generate thumbnail in background if missing
                if (!project.thumbnailUrl && project.code) {
                    console.log('🎨 Generating thumbnail for project:', project.id);
                    this.artApp.getProject(project.id, true).then(updatedProject => {
                        if (updatedProject && updatedProject.thumbnailUrl) {
                            console.log('✅ Thumbnail generated for project:', project.id, 'URL length:', updatedProject.thumbnailUrl.length);
                            // Find the card by project ID
                            const cardToUpdate = gallery.querySelector(`[data-project-id="${project.id}"]`);
                            if (cardToUpdate) {
                                const artImage = cardToUpdate.querySelector('.art-image');
                                if (artImage) {
                                    artImage.innerHTML = `<img src="${updatedProject.thumbnailUrl}" alt="${updatedProject.title}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.innerHTML='<div>🎨</div>';">`;
                                    console.log('✅ Thumbnail updated in UI for project:', project.id);
                                }
                            }
                        } else {
                            console.warn('⚠️ Thumbnail generation returned no image for project:', project.id);
                        }
                    }).catch(err => {
                        console.error('❌ Failed to generate thumbnail for project:', project.id, err);
                    });
                } else if (!project.code) {
                    console.warn('⚠️ Project has no code:', project.id);
                } else if (project.thumbnailUrl) {
                    console.log('✅ Project already has thumbnail:', project.id);
                }
            }
        } catch (error) {
            console.error('❌ Failed to load releases:', error);
            console.error('Error stack:', error.stack);
            releasesEl.innerHTML = `<div class="empty-state">Error loading releases: ${error.message}<br><small>Check console for details</small></div>`;
        }
    }

    async loadProjects() {
        const projectsEl = document.getElementById('projectsList');
        projectsEl.innerHTML = '<div class="loading">Loading projects...</div>';

        try {
            const projects = await this.artApp.getMyProjects();
            
            if (projects.length === 0) {
                projectsEl.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                        </svg>
                        <p>You haven't created any projects yet</p>
                    </div>
                `;
                return;
            }

            projectsEl.innerHTML = '<div class="gallery"></div>';
            const gallery = projectsEl.querySelector('.gallery');

            // Render live canvases for all projects
            for (const project of projects) {
                const card = this.createProjectCard(project);
                gallery.appendChild(card);
                
                // Live canvas rendering happens in createProjectCard
            }
        } catch (error) {
            console.error('Failed to load projects:', error);
            projectsEl.innerHTML = `<div class="empty-state">Error loading projects: ${error.message}</div>`;
        }
    }

    async createArtCard(piece, showPurchase = false, showActions = false) {
        const card = document.createElement('div');
        card.className = 'art-card';
        card.dataset.pieceId = piece.id;
        
        const emoji = this.getArtEmoji(piece.seed || piece.id);
        
        // Use live canvas container instead of static image
        card.innerHTML = `
            <div class="art-image" style="position: relative; overflow: hidden;">
                <div class="live-canvas-container" data-piece-id="${piece.id}" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #1a1a1a;">
                    <div style="color: rgba(255,255,255,0.5); font-size: 0.8em;">Loading...</div>
                </div>
            </div>
            <div class="art-info">
                <div class="art-title">${piece.projectTitle || 'Untitled'}</div>
                <div class="art-artist">by ${piece.artistName || 'Unknown'}</div>
                ${piece.price ? `<div class="art-price">${piece.price} KARMA</div>` : ''}
                ${piece.status === 'LISTED' ? '<span class="art-status listed">For Sale</span>' : ''}
                ${showActions && piece.ownerId === this.srishtiApp.nodeId ? '<span class="art-status owned">Owned</span>' : ''}
                <button class="btn" style="margin-top: 8px; width: 100%; font-size: 0.85em; padding: 6px;" onclick="event.stopPropagation(); artAppUI.viewFullRender('${piece.id}')">View Full</button>
            </div>
        `;

        card.addEventListener('click', () => {
            this.showPieceModal(piece, showPurchase, showActions);
        });

        // Render live canvas - get project code from piece
        if (piece.projectId) {
            setTimeout(async () => {
                try {
                    const project = await this.artApp.getProject(piece.projectId);
                    if (project && project.code) {
                        const container = card.querySelector('.live-canvas-container');
                        if (container) {
                            // Use piece seed for unique rendering
                            const params = {
                                seed: piece.seed || piece.id,
                                ...(project.parameters || {})
                            };
                            await this.renderLiveCanvas(piece.projectId, project.code, params, container);
                        }
                    } else {
                        // Fallback to emoji if no project code
                        const container = card.querySelector('.live-canvas-container');
                        if (container) {
                            container.innerHTML = `<div style="font-size: 2em;">${emoji}</div>`;
                        }
                    }
                } catch (error) {
                    console.error('Failed to render live canvas for piece:', piece.id, error);
                    const container = card.querySelector('.live-canvas-container');
                    if (container) {
                        container.innerHTML = `<div style="font-size: 2em;">${emoji}</div>`;
                    }
                }
            }, 100);
        } else {
            // No project ID - show emoji
            const container = card.querySelector('.live-canvas-container');
            if (container) {
                container.innerHTML = `<div style="font-size: 2em;">${emoji}</div>`;
            }
        }

        return card;
    }

    createReleaseCard(project) {
        const card = document.createElement('div');
        card.className = 'art-card';
        card.dataset.projectId = project.id; // Store project ID for thumbnail updates
        
        const canMint = !project.maxSupply || (project.pieceCount || 0) < project.maxSupply;
        
        card.innerHTML = `
            <div class="art-image" style="position: relative; overflow: hidden;">
                <div class="live-canvas-container" data-project-id="${project.id}" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #1a1a1a;">
                    <div style="color: rgba(255,255,255,0.5); font-size: 0.8em;">Loading...</div>
                </div>
            </div>
            <div class="art-info">
                <div class="art-title">${project.title}</div>
                <div class="art-artist">by ${project.artistName || 'Unknown'}</div>
                <div style="font-size: 0.85em; color: var(--text-secondary); margin-top: 8px;">
                    ${project.pieceCount || 0} pieces minted
                    ${project.maxSupply ? ` / ${project.maxSupply} max` : ''}
                </div>
                ${project.mintPrice > 0 ? `<div style="font-size: 0.9em; color: var(--text-secondary); margin-top: 4px;">Mint: ${project.mintPrice} KARMA</div>` : '<div style="font-size: 0.9em; color: var(--text-secondary); margin-top: 4px;">Free to mint</div>'}
                <span class="art-status" style="background: rgba(16, 185, 129, 0.2); color: #10b981; margin-top: 8px; display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.75em;">RELEASED</span>
                <div style="display: flex; gap: 8px; margin-top: 12px;">
                    <button class="btn btn-primary" style="flex: 1; font-size: 0.85em; padding: 8px;" onclick="event.stopPropagation(); artAppUI.mintFromProject('${project.id}')" ${!canMint ? 'disabled' : ''}>${canMint ? 'Mint' : 'Sold Out'}</button>
                    <button class="btn" style="flex: 1; font-size: 0.85em; padding: 8px;" onclick="event.stopPropagation(); artAppUI.viewProjectFull('${project.id}')">View</button>
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            this.showProjectModal(project);
        });

        // Render live canvas after card is added to DOM
        if (project.code) {
            setTimeout(() => {
                const container = card.querySelector('.live-canvas-container');
                if (container) {
                    this.renderLiveCanvas(project.id, project.code, project.parameters || {}, container);
                }
            }, 100);
        }

        return card;
    }
    
    /**
     * Render live canvas from code using p5.js and three.js
     */
    async renderLiveCanvas(projectId, code, parameters, container) {
        if (!container) return;
        
        try {
            console.log('🎨 Rendering live canvas for project:', projectId);
            
            // Check if p5.js and three.js are loaded
            if (typeof p5 === 'undefined') {
                throw new Error('p5.js library not loaded. Please refresh the page.');
            }
            
            // Create a container div for p5.js
            const p5Container = document.createElement('div');
            p5Container.style.width = '100%';
            p5Container.style.height = '100%';
            p5Container.style.position = 'relative';
            container.innerHTML = '';
            container.appendChild(p5Container);
            
            // Prepare parameters
            const params = {
                seed: `preview_${projectId}`,
                ...parameters
            };
            
            // Use p5.js instance mode to execute the code
            const sketch = (p) => {
                // Execute user code with p5.js and three.js available
                // Make p5.js functions available as globals for the user code
                const userCode = new Function('p', 'params', 'THREE', `
                    // p5.js instance is available as 'p'
                    // three.js is available as 'THREE' (if loaded)
                    // params is available for seed-based generation
                    // All p5.js functions are available through 'p' (p.background, p.fill, etc.)
                    // We'll also make them available as globals for convenience
                    
                    // Store params in a way that setup() and draw() can access it
                    // Make params available globally
                    if (typeof params !== 'undefined') {
                        // params is already in scope from Function parameters
                    }
                    
                    // Expose p5.js functions globally for user code
                    const background = p.background.bind(p);
                    const fill = p.fill.bind(p);
                    const stroke = p.stroke.bind(p);
                    const noStroke = p.noStroke.bind(p);
                    const noFill = p.noFill.bind(p);
                    const ellipse = p.ellipse.bind(p);
                    const rect = p.rect.bind(p);
                    const line = p.line.bind(p);
                    const point = p.point.bind(p);
                    const triangle = p.triangle.bind(p);
                    const translate = p.translate.bind(p);
                    const rotate = p.rotate.bind(p);
                    const scale = p.scale.bind(p);
                    const push = p.push.bind(p);
                    const pop = p.pop.bind(p);
                    const map = p.map.bind(p);
                    const lerp = p.lerp.bind(p);
                    const random = p.random.bind(p);
                    const noise = p.noise.bind(p);
                    const color = p.color.bind(p);
                    const createCanvas = p.createCanvas.bind(p);
                    const createGraphics = p.createGraphics.bind(p);
                    const image = p.image.bind(p);
                    const text = p.text.bind(p);
                    const textSize = p.textSize.bind(p);
                    const textAlign = p.textAlign.bind(p);
                    // WEBGL 3D functions
                    const rotateX = p.rotateX ? p.rotateX.bind(p) : () => {};
                    const rotateY = p.rotateY ? p.rotateY.bind(p) : () => {};
                    const rotateZ = p.rotateZ ? p.rotateZ.bind(p) : () => {};
                    const box = p.box ? p.box.bind(p) : () => {};
                    const sphere = p.sphere ? p.sphere.bind(p) : () => {};
                    const cylinder = p.cylinder ? p.cylinder.bind(p) : () => {};
                    const cone = p.cone ? p.cone.bind(p) : () => {};
                    const plane = p.plane ? p.plane.bind(p) : () => {};
                    const torus = p.torus ? p.torus.bind(p) : () => {};
                    // Math functions
                    const floor = Math.floor;
                    const ceil = Math.ceil;
                    const round = Math.round;
                    const sin = Math.sin;
                    const cos = Math.cos;
                    const tan = Math.tan;
                    const abs = Math.abs;
                    const sqrt = Math.sqrt;
                    const pow = Math.pow;
                    const min = Math.min;
                    const max = Math.max;
                    // p5.js utility functions
                    const noiseSeed = p.noiseSeed ? p.noiseSeed.bind(p) : () => {};
                    const strokeWeight = p.strokeWeight ? p.strokeWeight.bind(p) : () => {};
                    const rectMode = p.rectMode ? p.rectMode.bind(p) : () => {};
                    const lerpColor = p.lerpColor ? p.lerpColor.bind(p) : () => {};
                    // Constants
                    const width = p.width;
                    const height = p.height;
                    const TWO_PI = p.TWO_PI;
                    const PI = p.PI;
                    const WEBGL = p.WEBGL || 'webgl';
                    const P2D = p.P2D || 'p2d';
                    
                    // Make params available as a variable (not just parameter) so setup()/draw() can access it
                    // params is passed as Function parameter, but we need to make sure it's accessible
                    // Store it in a way that persists for setup() and draw() calls
                    var params = params; // This makes params available in the closure
                    
                    ${code}
                `);
                
                p.setup = () => {
                    // Create canvas - user can recreate it in WEBGL if needed
                    p.createCanvas(400, 400);
                    
                    try {
                        // Execute user code - this defines setup(), draw(), generate(), etc.
                        // Pass params so it's available in the code scope
                        userCode(p, params, typeof THREE !== 'undefined' ? THREE : null);
                        
                        // If user defined setup(), call it
                        // setup() should have access to params from the Function closure
                        if (typeof setup === 'function') {
                            try {
                                setup();
                            } catch (setupError) {
                                console.error('Error in setup():', setupError);
                            }
                        }
                        
                        // If code defines generate function, call it for static generation
                        if (typeof generate === 'function') {
                            const result = generate(params);
                            // If result is a canvas, draw it
                            if (result && result.nodeName === 'CANVAS') {
                                p.image(result, 0, 0, p.width, p.height);
                            }
                            // If result is a p5.Graphics, draw it
                            if (result && result.canvas) {
                                p.image(result, 0, 0, p.width, p.height);
                            }
                            // If result is a data URL string, load and draw it
                            if (typeof result === 'string' && result.startsWith('data:image')) {
                                p.loadImage(result, (img) => {
                                    p.image(img, 0, 0, p.width, p.height);
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Error executing user code:', error);
                        p.background(20);
                        p.fill(255, 0, 0);
                        p.text('Code Error: ' + error.message, 10, 20);
                    }
                };
                
                p.draw = () => {
                    // If user defined draw(), call it for live rendering
                    if (typeof draw === 'function') {
                        try {
                            draw();
                        } catch (error) {
                            console.error('Error in draw():', error);
                        }
                    }
                };
            };
            
            // Create p5 instance
            new p5(sketch, p5Container);
            
            console.log('✅ Live canvas rendered with p5.js for project:', projectId);
        } catch (error) {
            console.error('❌ Failed to render live canvas:', projectId, error);
            container.innerHTML = '<div style="color: rgba(255,255,255,0.5); font-size: 0.8em;">Render Error: ' + error.message + '</div>';
        }
    }
    
    /**
     * OLD METHOD - Render live canvas from code (fallback)
     */
    async renderLiveCanvasOld(projectId, code, parameters, container) {
        if (!container) return;
        
        try {
            console.log('🎨 Rendering live canvas for project:', projectId);
            
            // Create canvas element
            const canvas = document.createElement('canvas');
            canvas.width = 400; // Thumbnail size
            canvas.height = 400;
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.objectFit = 'cover';
            
            const ctx = canvas.getContext('2d');
            
            // Prepare parameters
            const params = {
                seed: `preview_${projectId}`,
                ...parameters
            };
            
            // Execute code in safe context with p5.js-like functions
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
                
                // Seeded random
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
                    // If result is a canvas, copy it to our canvas
                    if (result && result.nodeName === 'CANVAS') {
                        ctx.drawImage(result, 0, 0, canvas.width, canvas.height);
                        return;
                    }
                    // If result is a canvas-like object
                    if (result && typeof result.toDataURL === 'function' && typeof result.getContext === 'function') {
                        ctx.drawImage(result, 0, 0, canvas.width, canvas.height);
                        return;
                    }
                    // If result is null/undefined, code may have drawn directly to ctx
                }
            `);
            
            // Execute the code
            generateFunction(params, canvas, ctx);
            
            // Clear container and add canvas
            container.innerHTML = '';
            container.appendChild(canvas);
            
            console.log('✅ Live canvas rendered for project:', projectId);
        } catch (error) {
            console.error('❌ Failed to render live canvas:', projectId, error);
            container.innerHTML = '<div style="color: rgba(255,255,255,0.5); font-size: 0.8em;">Render Error</div>';
        }
    }

    createProjectCard(project) {
        const card = document.createElement('div');
        card.className = 'art-card';
        card.dataset.projectId = project.id;
        
        card.innerHTML = `
            <div class="art-image" style="position: relative; overflow: hidden;">
                <div class="live-canvas-container" data-project-id="${project.id}" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #1a1a1a;">
                    <div style="color: rgba(255,255,255,0.5); font-size: 0.8em;">Loading...</div>
                </div>
            </div>
            <div class="art-info">
                <div class="art-title">${project.title}</div>
                <div class="art-artist">by ${project.artistName || 'You'}</div>
                <div style="font-size: 0.85em; color: var(--text-secondary); margin-top: 8px;">
                    ${project.pieceCount || 0} pieces minted
                    ${project.maxSupply ? ` / ${project.maxSupply} max` : ''}
                </div>
                ${project.mintPrice > 0 ? `<div style="font-size: 0.9em; color: var(--text-secondary); margin-top: 4px;">Mint: ${project.mintPrice} KARMA</div>` : ''}
                ${(project.status || 'DRAFT') === 'DRAFT' ? '<span class="art-status" style="background: rgba(255, 193, 7, 0.2); color: #ffc107; margin-top: 8px; display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.75em;">DRAFT</span>' : '<span class="art-status" style="background: rgba(16, 185, 129, 0.2); color: #10b981; margin-top: 8px; display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.75em;">RELEASED</span>'}
                <button class="btn" style="margin-top: 12px; width: 100%; font-size: 0.85em; padding: 8px;" onclick="event.stopPropagation(); artAppUI.viewProjectFull('${project.id}')">View Full Render</button>
            </div>
        `;

        card.addEventListener('click', () => {
            this.showProjectModal(project);
        });

        // Render live canvas after card is added to DOM
        if (project.code) {
            setTimeout(() => {
                const container = card.querySelector('.live-canvas-container');
                if (container) {
                    this.renderLiveCanvas(project.id, project.code, project.parameters || {}, container);
                }
            }, 100);
        }

        return card;
    }

    getArtEmoji(seed) {
        const emojis = ['🎨', '🖼️', '✨', '🌟', '💫', '🌈', '🎭', '🦋', '🌸', '🌺', '🌻', '🌷', '🌹', '🌼', '🌿', '🍀', '🌱', '🌳', '🌲', '🌴'];
        if (!seed) return emojis[0];
        const index = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % emojis.length;
        return emojis[index];
    }

    async showPieceModal(piece, showPurchase = false, showActions = false) {
        const modal = document.getElementById('pieceModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');

        modalTitle.textContent = piece.projectTitle || 'Art Piece';
        
        const isOwner = piece.ownerId === this.srishtiApp.nodeId;
        const isListed = piece.status === 'LISTED';
        
        // Get project to check if code is available for rendering
        const project = piece.projectId ? await this.artApp.getProject(piece.projectId) : null;

        modalBody.innerHTML = `
            <div style="margin-bottom: 24px;">
                <div class="art-image" style="height: 400px; border-radius: 16px; overflow: hidden;">
                    ${piece.imageUrl ? 
                        `<img src="${piece.imageUrl}" alt="${piece.projectTitle}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                        `<div style="display: flex; align-items: center; justify-content: center; height: 100%; font-size: 6em;">${this.getArtEmoji(piece.seed || piece.id)}</div>`
                    }
                </div>
            </div>
            <div style="margin-bottom: 16px;">
                <strong>Artist:</strong> ${piece.artistName || 'Unknown'}<br>
                <strong>Owner:</strong> ${piece.ownerName || 'Unknown'}<br>
                <strong>Minted:</strong> ${new Date(piece.mintedAt).toLocaleDateString()}<br>
                ${piece.seed ? `<strong>Seed:</strong> ${piece.seed.substring(0, 20)}...<br>` : ''}
            </div>
            ${isListed ? `<div style="font-size: 1.5em; font-weight: 700; color: #10b981; margin-bottom: 16px;">${piece.price} KARMA</div>` : ''}
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                ${piece.imageUrl || (project && project.code) ? 
                    `<button class="btn btn-primary" onclick="artAppUI.viewFullRender('${piece.id}')">View Full Render</button>` : ''}
                ${showPurchase && isListed && !isOwner ? 
                    `<button class="btn btn-primary" onclick="artAppUI.purchasePiece('${piece.id}')">Purchase</button>` : ''}
                ${showActions && isOwner && !isListed ? 
                    `<button class="btn" onclick="artAppUI.showListForm('${piece.id}')">List for Sale</button>` : ''}
                ${showActions && isOwner && isListed ? 
                    `<button class="btn" onclick="artAppUI.unlistPiece('${piece.id}')">Unlist</button>` : ''}
                ${showActions && isOwner ? 
                    `<button class="btn" onclick="artAppUI.showTransferForm('${piece.id}')">Transfer</button>` : ''}
            </div>
        `;

        modal.classList.add('active');
    }

    async showProjectModal(project) {
        const modal = document.getElementById('pieceModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');

        modalTitle.textContent = project.title;
        
        const pieces = await this.artApp.getProjectPieces(project.id);

        const piecesHtml = pieces.map(p => {
            const pieceJson = JSON.stringify(p).replace(/'/g, "&#39;").replace(/"/g, '&quot;');
            return `
                <div class="art-card" style="cursor: pointer;" onclick="artAppUI.showPieceModalFromData('${pieceJson}', false, false)">
                    <div class="art-image" style="height: 120px;">
                        <div>${this.getArtEmoji(p.seed || p.id)}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Check if user is the artist and project is draft
        const isDraft = (project.status || 'DRAFT') === 'DRAFT';
        const isArtist = project.artistId === this.srishtiApp.nodeId;
        const showReleaseButton = isDraft && isArtist;
        
        console.log('🔍 Project Modal Debug:', {
            projectId: project.id,
            status: project.status || 'DRAFT',
            artistId: project.artistId,
            currentNodeId: this.srishtiApp.nodeId,
            isDraft,
            isArtist,
            showReleaseButton
        });

        modalBody.innerHTML = `
            <div style="margin-bottom: 24px;">
                <p style="color: var(--text-secondary); margin-bottom: 16px;">${project.description || 'No description'}</p>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px;">
                    ${piecesHtml}
                </div>
            </div>
            <div style="margin-bottom: 16px;">
                <strong>Status:</strong> ${isDraft ? '<span style="color: #ffc107;">DRAFT</span> (Only you can mint)' : '<span style="color: #10b981;">RELEASED</span> (Anyone can mint)'}<br>
                <strong>Pieces:</strong> ${project.pieceCount || 0}${project.maxSupply ? ` / ${project.maxSupply}` : ''}<br>
                <strong>Mint Price:</strong> ${project.mintPrice || 0} KARMA<br>
                <strong>Created:</strong> ${new Date(project.createdAt).toLocaleDateString()}
            </div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                ${showReleaseButton ? 
                    `<button class="btn btn-primary" onclick="artAppUI.releaseProject('${project.id}')">Release Project</button>` : ''}
                <button class="btn btn-primary" onclick="artAppUI.mintFromProject('${project.id}')">Mint New Piece</button>
            </div>
        `;

        modal.classList.add('active');
    }

    showPieceModalFromData(pieceJson, showPurchase, showActions) {
        const piece = JSON.parse(pieceJson.replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
        this.showPieceModal(piece, showPurchase, showActions);
    }

    async purchasePiece(pieceId) {
        if (!confirm('Purchase this art piece?')) return;

        try {
            await this.artApp.purchasePiece(pieceId);
            alert('✅ Purchase successful!');
            closeModal();
            await this.loadMarketplace();
            await this.loadCollection();
            this.updateUserInfo();
        } catch (error) {
            console.error('Failed to purchase:', error);
            alert(`Failed to purchase: ${error.message}`);
        }
    }

    async unlistPiece(pieceId) {
        try {
            await this.artApp.unlistFromSale(pieceId);
            alert('✅ Piece unlisted');
            closeModal();
            await this.loadCollection();
            await this.loadMarketplace();
        } catch (error) {
            console.error('Failed to unlist:', error);
            alert(`Failed to unlist: ${error.message}`);
        }
    }

    showListForm(pieceId) {
        const price = prompt('Enter sale price (KARMA):');
        if (!price) return;

        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum <= 0) {
            alert('Invalid price');
            return;
        }

        this.listPiece(pieceId, priceNum);
    }

    async listPiece(pieceId, price) {
        try {
            await this.artApp.listForSale(pieceId, price);
            alert('✅ Piece listed for sale!');
            closeModal();
            await this.loadCollection();
            await this.loadMarketplace();
        } catch (error) {
            console.error('Failed to list:', error);
            alert(`Failed to list: ${error.message}`);
        }
    }

    showTransferForm(pieceId) {
        const recipientId = prompt('Enter recipient node ID:');
        if (!recipientId) return;

        this.transferPiece(pieceId, recipientId);
    }

    async transferPiece(pieceId, recipientId) {
        try {
            await this.artApp.transferPiece(pieceId, recipientId);
            alert('✅ Piece transferred!');
            closeModal();
            await this.loadCollection();
        } catch (error) {
            console.error('Failed to transfer:', error);
            alert(`Failed to transfer: ${error.message}`);
        }
    }

    async mintFromProject(projectId) {
        try {
            const pieceId = await this.artApp.mintPiece(projectId);
            alert(`✅ Piece minted: ${pieceId}`);
            closeModal();
            await this.loadCollection();
            await this.loadGallery();
            this.updateUserInfo();
        } catch (error) {
            console.error('Failed to mint:', error);
            alert(`Failed to mint: ${error.message}`);
        }
    }
    
    async releaseProject(projectId) {
        if (!confirm('Release this project? Once released, anyone will be able to mint pieces from it.')) {
            return;
        }
        
        try {
            await this.artApp.releaseProject(projectId);
            alert('✅ Project released! Anyone can now mint from it.');
            closeModal();
            await this.loadProjects();
        } catch (error) {
            console.error('Failed to release project:', error);
            alert(`Failed to release project: ${error.message}`);
        }
    }
    
    async viewFullRender(pieceId) {
        try {
            const piece = await this.artApp.getPiece(pieceId);
            if (!piece) {
                throw new Error('Piece not found');
            }
            
            // If piece has image, show it
            if (piece.imageUrl) {
                this.showFullRenderModal(piece.imageUrl, piece.projectTitle || 'Art Piece');
                return;
            }
            
            // Otherwise, generate from project code
            const project = await this.artApp.getProject(piece.projectId);
            if (!project || !project.code) {
                throw new Error('Cannot generate render: project code not available');
            }
            
            // Show loading
            this.showFullRenderModal(null, piece.projectTitle || 'Art Piece', true);
            
            // Generate render - use _executeCode directly if generatePreview doesn't exist
            let imageUrl;
            if (typeof this.artApp.generatePreview === 'function') {
                imageUrl = await this.artApp.generatePreview(piece.projectId, piece.seed);
            } else {
                // Fallback: execute code directly
                const params = {
                    seed: piece.seed || `piece_${piece.id}_${Date.now()}`,
                    ...project.parameters
                };
                
                const generateFunction = new Function('params', `
                    ${project.code}
                    return typeof generate === 'function' ? generate(params) : null;
                `);
                
                const result = generateFunction(params);
                
                if (typeof result === 'string' && result.startsWith('data:image')) {
                    imageUrl = result;
                } else if (result && result.nodeName === 'CANVAS') {
                    imageUrl = result.toDataURL('image/png');
                } else {
                    throw new Error('Code did not return a valid image');
                }
            }
            
            if (imageUrl) {
                // Update piece with generated image
                piece.imageUrl = imageUrl;
                await this.artApp.store.put(pieceId, piece);
                
                // Show the render
                this.showFullRenderModal(imageUrl, piece.projectTitle || 'Art Piece');
            } else {
                throw new Error('Failed to generate render');
            }
        } catch (error) {
            console.error('Failed to view render:', error);
            alert(`Failed to generate render: ${error.message}`);
            closeModal();
        }
    }
    
    async viewProjectFull(projectId) {
        try {
            const project = await this.artApp.getProject(projectId);
            if (!project || !project.code) {
                throw new Error('Project code not available');
            }
            
            // Show loading
            this.showFullRenderModal(null, project.title, true);
            
            // Generate fresh render - use _executeCode directly if generatePreview doesn't exist
            let imageUrl;
            console.log('🔍 Checking generatePreview method:', typeof this.artApp.generatePreview);
            console.log('🔍 ArtApp methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.artApp)));
            
            if (typeof this.artApp.generatePreview === 'function') {
                console.log('✅ Using generatePreview method');
                imageUrl = await this.artApp.generatePreview(projectId);
            } else {
                console.log('⚠️ generatePreview not found, using fallback');
                // Fallback: execute code directly
                const params = {
                    seed: `preview_${projectId}_${Date.now()}`,
                    ...project.parameters
                };
                
                // Use the internal _executeCode method
                const generateFunction = new Function('params', `
                    ${project.code}
                    return typeof generate === 'function' ? generate(params) : null;
                `);
                
                const result = generateFunction(params);
                
                if (typeof result === 'string' && result.startsWith('data:image')) {
                    imageUrl = result;
                } else if (result && result.nodeName === 'CANVAS') {
                    imageUrl = result.toDataURL('image/png');
                } else {
                    throw new Error('Code did not return a valid image');
                }
            }
            
            if (imageUrl) {
                this.showFullRenderModal(imageUrl, project.title);
            } else {
                throw new Error('Failed to generate render');
            }
        } catch (error) {
            console.error('Failed to view project render:', error);
            alert(`Failed to generate render: ${error.message}`);
            closeModal();
        }
    }
    
    showFullRenderModal(imageUrl, title, loading = false) {
        const modal = document.getElementById('pieceModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        modalTitle.textContent = title;
        
        if (loading) {
            modalBody.innerHTML = `
                <div style="text-align: center; padding: 60px;">
                    <div style="font-size: 2em; margin-bottom: 16px;">🎨</div>
                    <div style="color: var(--text-secondary);">Generating render...</div>
                </div>
            `;
        } else {
            modalBody.innerHTML = `
                <div style="margin-bottom: 24px;">
                    <div style="width: 100%; max-width: 1000px; margin: 0 auto; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);">
                        <img src="${imageUrl}" alt="${title}" style="width: 100%; height: auto; display: block;">
                    </div>
                </div>
                <div style="text-align: center;">
                    <button class="btn" onclick="artAppUI.downloadImage('${imageUrl}', '${title.replace(/[^a-z0-9]/gi, '_')}')">Download Image</button>
                </div>
            `;
        }
        
        modal.classList.add('active');
    }
    
    downloadImage(imageUrl, filename) {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `${filename || 'art_piece'}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Global functions
function showTab(tabName, clickedElement) {
    // Update tabs
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    clickedElement.classList.add('active');

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');

    // Load data if needed
    if (tabName === 'gallery' && artAppUI) {
        artAppUI.loadGallery();
    } else if (tabName === 'releases' && artAppUI) {
        artAppUI.loadReleases();
    } else if (tabName === 'marketplace' && artAppUI) {
        artAppUI.loadMarketplace();
    } else if (tabName === 'collection' && artAppUI) {
        artAppUI.loadCollection();
    } else if (tabName === 'projects' && artAppUI) {
        artAppUI.loadProjects();
    }
}

function closeModal() {
    document.getElementById('pieceModal').classList.remove('active');
}

// Initialize app - wait for blockchain to be ready
let artAppUI;
async function initializeApp() {
    // Wait for blockchain instance to be available
    let retries = 0;
    while (!window.srishtiAppInstance && retries < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }
    
    if (!window.srishtiAppInstance) {
        console.error('❌ Blockchain instance not available after waiting');
        return;
    }
    
    artAppUI = new GenerativeArtAppUI();
    await artAppUI.init();
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
