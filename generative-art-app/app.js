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

            // Initialize Generative Art App
            this.artApp = new window.SrishtiGenerativeArtApp(this.sdk);

            this.initialized = true;

            const displayNodeId = this.srishtiApp.nodeId || finalNodeId;
            this.updateStatus('connected', `Connected as: ${displayNodeId}`);
            this.updateUserInfo();

            // Load initial data
            await this.loadGallery();
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

            const projectId = await this.artApp.createProject({
                title,
                description,
                code: code || null,
                maxSupply,
                mintPrice
            });

            alert(`✅ Project created: ${projectId}`);
            
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
                const card = this.createArtCard(piece);
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
                const card = this.createArtCard(piece, true);
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
                const card = this.createArtCard(piece, false, true);
                gallery.appendChild(card);
            }
        } catch (error) {
            console.error('Failed to load collection:', error);
            collectionEl.innerHTML = `<div class="empty-state">Error loading collection: ${error.message}</div>`;
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

            for (const project of projects) {
                const card = this.createProjectCard(project);
                gallery.appendChild(card);
            }
        } catch (error) {
            console.error('Failed to load projects:', error);
            projectsEl.innerHTML = `<div class="empty-state">Error loading projects: ${error.message}</div>`;
        }
    }

    createArtCard(piece, showPurchase = false, showActions = false) {
        const card = document.createElement('div');
        card.className = 'art-card';
        
        const imageUrl = piece.imageUrl || null;
        const emoji = this.getArtEmoji(piece.seed || piece.id);
        
        card.innerHTML = `
            <div class="art-image">
                ${imageUrl ? `<img src="${imageUrl}" alt="${piece.projectTitle}">` : `<div>${emoji}</div>`}
            </div>
            <div class="art-info">
                <div class="art-title">${piece.projectTitle || 'Untitled'}</div>
                <div class="art-artist">by ${piece.artistName || 'Unknown'}</div>
                ${piece.price ? `<div class="art-price">${piece.price} KARMA</div>` : ''}
                ${piece.status === 'LISTED' ? '<span class="art-status listed">For Sale</span>' : ''}
                ${showActions && piece.ownerId === this.srishtiApp.nodeId ? '<span class="art-status owned">Owned</span>' : ''}
            </div>
        `;

        card.addEventListener('click', () => {
            this.showPieceModal(piece, showPurchase, showActions);
        });

        return card;
    }

    createProjectCard(project) {
        const card = document.createElement('div');
        card.className = 'art-card';
        
        card.innerHTML = `
            <div class="art-image">
                <div>🎨</div>
            </div>
            <div class="art-info">
                <div class="art-title">${project.title}</div>
                <div class="art-artist">by ${project.artistName || 'You'}</div>
                <div style="font-size: 0.85em; color: var(--text-secondary); margin-top: 8px;">
                    ${project.pieceCount || 0} pieces minted
                    ${project.maxSupply ? ` / ${project.maxSupply} max` : ''}
                </div>
                ${project.mintPrice > 0 ? `<div style="font-size: 0.9em; color: var(--text-secondary); margin-top: 4px;">Mint: ${project.mintPrice} KARMA</div>` : ''}
            </div>
        `;

        card.addEventListener('click', () => {
            this.showProjectModal(project);
        });

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

        modalBody.innerHTML = `
            <div style="margin-bottom: 24px;">
                <p style="color: var(--text-secondary); margin-bottom: 16px;">${project.description || 'No description'}</p>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px;">
                    ${piecesHtml}
                </div>
            </div>
            <div style="margin-bottom: 16px;">
                <strong>Pieces:</strong> ${project.pieceCount || 0}${project.maxSupply ? ` / ${project.maxSupply}` : ''}<br>
                <strong>Mint Price:</strong> ${project.mintPrice || 0} KARMA<br>
                <strong>Created:</strong> ${new Date(project.createdAt).toLocaleDateString()}
            </div>
            <button class="btn btn-primary" onclick="artAppUI.mintFromProject('${project.id}')">Mint New Piece</button>
        `;

        modal.classList.add('active');
    }

    showPieceModalFromData(pieceJson, showPurchase, showActions) {
        const piece = JSON.parse(pieceJson.replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
        this.showPieceModal(piece, showPurchase, showActions);
    }

    async showProjectModal(project) {
        const modal = document.getElementById('pieceModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');

        modalTitle.textContent = project.title;
        
        const pieces = await this.artApp.getProjectPieces(project.id);

        modalBody.innerHTML = `
            <div style="margin-bottom: 24px;">
                <p style="color: var(--text-secondary); margin-bottom: 16px;">${project.description || 'No description'}</p>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px;">
                    ${pieces.map(p => `
                        <div class="art-card" style="cursor: pointer;" onclick="artAppUI.showPieceModal(${JSON.stringify(p).replace(/"/g, '&quot;')}, false, false)">
                            <div class="art-image" style="height: 120px;">
                                <div>${this.getArtEmoji(p.seed || p.id)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div style="margin-bottom: 16px;">
                <strong>Pieces:</strong> ${project.pieceCount || 0}${project.maxSupply ? ` / ${project.maxSupply}` : ''}<br>
                <strong>Mint Price:</strong> ${project.mintPrice || 0} KARMA<br>
                <strong>Created:</strong> ${new Date(project.createdAt).toLocaleDateString()}
            </div>
            <button class="btn btn-primary" onclick="artAppUI.mintFromProject('${project.id}')">Mint New Piece</button>
        `;

        modal.classList.add('active');
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

// Initialize app
let artAppUI;
window.addEventListener('DOMContentLoaded', async () => {
    artAppUI = new GenerativeArtAppUI();
    await artAppUI.init();
});
