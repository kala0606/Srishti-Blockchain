/**
 * Srishti Attendance App - Standalone Application
 * 
 * A standalone attendance management app that connects to the Srishti blockchain.
 */

class AttendanceAppUI {
    constructor() {
        this.sdk = null;
        this.attendance = null;
        this.srishtiApp = null;
        this.initialized = false;
    }

    async init() {
        try {
            // Log domain information for debugging
            console.log('🌐 Attendance App Domain:', window.location.hostname);
            console.log('🌐 Blockchain URL:', window.SRISHTI_BLOCKCHAIN_URL);

            // Wait for blockchain instance to be available
            if (!window.srishtiAppInstance) {
                throw new Error('Srishti blockchain instance not loaded. Check script loading.');
            }

            // Use the existing instance
            this.srishtiApp = window.srishtiAppInstance;

            console.log('🔍 SrishtiApp instance check:');
            console.log('  - initialized:', this.srishtiApp.initialized);
            console.log('  - nodeId:', this.srishtiApp.nodeId);

            // If not initialized, initialize it (this loads chain, but no credentials needed)
            if (!this.srishtiApp.initialized) {
                try {
                    await this.srishtiApp.init();
                } catch (error) {
                    // If init fails due to private key issues, that's okay - we'll use session tokens
                    console.warn('⚠️ SrishtiApp init had issues (expected if no private key):', error.message);
                }
            }

            // Wait for chain to be available (chain is always created)
            let retries = 0;
            while (!this.srishtiApp.chain && retries < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                retries++;
            }

            if (!this.srishtiApp.chain) {
                throw new Error('Blockchain chain not available. Initialization may have failed.');
            }

            // Wait for chain to be fully loaded (has blocks processed)
            // This ensures node map is built before token verification
            retries = 0;
            while (this.srishtiApp.chain.getLength() === 0 && retries < 30) {
                await new Promise(resolve => setTimeout(resolve, 200));
                retries++;
            }
            
            // Give it a bit more time for state to be built
            await new Promise(resolve => setTimeout(resolve, 500));

            // ═══════════════════════════════════════════════════════════════════
            // SESSION TOKEN AUTHENTICATION (No private keys needed!)
            // ═══════════════════════════════════════════════════════════════════
            
            // Check if auth libraries are loaded
            if (!window.SrishtiDAppAuth || !window.SrishtiSessionAuth) {
                throw new Error('Authentication libraries not loaded. Please ensure auth scripts are included.');
            }

            // Handle login callback (if redirected from main app with token)
            const tokenData = await window.SrishtiDAppAuth.handleLoginCallback(this.srishtiApp.chain);
            if (tokenData) {
                console.log('✅ Authenticated via session token:', tokenData.nodeId);
                // Clear redirect attempts on successful auth
                sessionStorage.removeItem('dapp_redirect_attempts');
                this.srishtiApp.nodeId = tokenData.nodeId;
                
                // Get node name from chain
                const nodes = this.srishtiApp.chain.buildNodeMap();
                const institutions = this.srishtiApp.chain.getInstitutions();
                const node = nodes[tokenData.nodeId];
                const institution = institutions.verified?.[tokenData.nodeId];
                
                if (institution) {
                    this.srishtiApp.currentUser = { id: tokenData.nodeId, name: institution.name };
                    localStorage.setItem('srishti_node_name', institution.name);
                } else if (node) {
                    this.srishtiApp.currentUser = { id: tokenData.nodeId, name: node.name };
                    localStorage.setItem('srishti_node_name', node.name);
                }
            } else {
                // Check for existing valid session
                const isAuthenticated = await window.SrishtiDAppAuth.isAuthenticated(this.srishtiApp.chain);
                
                if (!isAuthenticated) {
                    // Check if we're already in a redirect loop (prevent infinite loops)
                    const urlParams = new URLSearchParams(window.location.search);
                    const hasSessionToken = urlParams.get('session_token');
                    const redirectAttempts = sessionStorage.getItem('dapp_redirect_attempts') || '0';
                    const maxAttempts = 3;
                    
                    // If we have a session_token in URL but it's invalid, don't redirect again
                    if (hasSessionToken) {
                        console.warn('⚠️ Session token in URL but invalid. Not redirecting to prevent loop.');
                        this.updateStatus('disconnected', '⚠️ Invalid session token. Please log in to the main blockchain app first.');
                        document.getElementById('userInfo').innerHTML = `
                            <div style="background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.3); padding: 20px; border-radius: 16px; margin-top: 16px; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);">
                                <strong style="color: #fbbf24;">🔐 Login Required</strong><br>
                                <span style="color: rgba(255, 255, 255, 0.8);">Your session token is invalid or expired.</span><br>
                                <a href="${window.SRISHTI_BLOCKCHAIN_URL || 'https://kala0606.github.io/Srishti-Blockchain/'}" target="_blank" style="color: #ffffff; text-decoration: underline; margin-top: 8px; display: inline-block;">
                                    Click here to log in to the blockchain →
                                </a>
                                <br><small style="color: rgba(255, 255, 255, 0.6);">After logging in, return to this page.</small>
                            </div>
                        `;
                        this.initialized = false;
                        return;
                    }
                    
                    // Prevent redirect loops
                    if (parseInt(redirectAttempts) >= maxAttempts) {
                        console.error('❌ Too many redirect attempts. Stopping to prevent infinite loop.');
                        this.updateStatus('disconnected', '⚠️ Authentication failed. Too many redirect attempts.');
                        document.getElementById('userInfo').innerHTML = `
                            <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); padding: 20px; border-radius: 16px; margin-top: 16px; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);">
                                <strong style="color: #ef4444;">⚠️ Redirect Loop Detected</strong><br>
                                <span style="color: rgba(255, 255, 255, 0.8);">Please clear your browser data and try again, or log in to the main blockchain app first.</span><br>
                                <a href="${window.SRISHTI_BLOCKCHAIN_URL || 'https://kala0606.github.io/Srishti-Blockchain/'}" target="_blank" style="color: #ffffff; text-decoration: underline; margin-top: 8px; display: inline-block;">
                                    Go to Blockchain App →
                                </a>
                            </div>
                        `;
                        sessionStorage.removeItem('dapp_redirect_attempts');
                        this.initialized = false;
                        return;
                    }
                    
                    // Increment redirect attempts
                    sessionStorage.setItem('dapp_redirect_attempts', String(parseInt(redirectAttempts) + 1));
                    
                    // No valid session - redirect to main app for login
                    console.log('🔐 No valid session found. Redirecting to main app for login...');
                    const returnUrl = encodeURIComponent(window.location.href.split('?')[0]); // Remove any existing params
                    window.SrishtiDAppAuth.initiateLogin(returnUrl, window.SRISHTI_BLOCKCHAIN_URL);
                    return; // Exit early - will redirect
                }
                
                // Clear redirect attempts on successful auth
                sessionStorage.removeItem('dapp_redirect_attempts');
                
                // We have a valid session
                const nodeId = await window.SrishtiDAppAuth.getNodeId(this.srishtiApp.chain);
                if (nodeId) {
                    console.log('✅ Using existing session:', nodeId);
                    this.srishtiApp.nodeId = nodeId;
                    
                    // Get node name from chain
                    const nodes = this.srishtiApp.chain.buildNodeMap();
                    const institutions = this.srishtiApp.chain.getInstitutions();
                    const node = nodes[nodeId];
                    const institution = institutions.verified?.[nodeId];
                    
                    if (institution) {
                        this.srishtiApp.currentUser = { id: nodeId, name: institution.name };
                        localStorage.setItem('srishti_node_name', institution.name);
                    } else if (node) {
                        this.srishtiApp.currentUser = { id: nodeId, name: node.name };
                        localStorage.setItem('srishti_node_name', node.name);
                    }
                } else {
                    throw new Error('Failed to get node ID from session');
                }
            }

            // Initialize network in guest mode for syncing (we don't need private keys for this)
            // Guest mode allows read-only access and syncing without requiring credentials
            if (!this.srishtiApp.network && typeof this.srishtiApp.initNetwork === 'function') {
                console.log('🔄 Initializing network in guest mode (for syncing)...');
                try {
                    await this.srishtiApp.initNetwork(true); // true = guestMode
                    console.log('✅ Network initialized in guest mode');
                } catch (error) {
                    console.warn('⚠️ Failed to initialize network:', error);
                    // Continue anyway - we can still use the chain data
                }
            }

            // Wait a bit longer for network to initialize (it's async)
            retries = 0;
            while (!this.srishtiApp.network && retries < 30) {
                await new Promise(resolve => setTimeout(resolve, 200));
                retries++;
            }

            // Wait for chain to sync from network (if network exists)
            // Also try to trigger sync manually
            if (this.srishtiApp.network) {
                console.log('⏳ Waiting for chain to sync from network...');
                let initialChainLength = this.srishtiApp.chain.getLength();

                // Try to trigger sync if network has a method for it
                if (typeof this.srishtiApp.network.syncWithBestPeer === 'function') {
                    console.log('🔄 Triggering manual sync...');
                    try {
                        await this.srishtiApp.network.syncWithBestPeer();
                    } catch (error) {
                        console.warn('Sync trigger failed:', error);
                    }
                }

                retries = 0;
                // Wait up to 15 seconds for chain to sync
                while (retries < 75) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    const currentLength = this.srishtiApp.chain.getLength();
                    if (currentLength > initialChainLength) {
                        console.log(`✅ Chain synced: ${initialChainLength} → ${currentLength} blocks`);
                        break;
                    }
                    retries++;
                }

                if (this.srishtiApp.chain.getLength() === initialChainLength && initialChainLength <= 1) {
                    console.warn('⚠️ Chain did not sync. Network may not be connected or no peers available.');
                }
            } else {
                console.warn('⚠️ Network not available. Cannot sync chain from peers.');
            }

            // Verify we have a nodeId from session token
            const nodeId = this.srishtiApp.nodeId;
            
            if (!nodeId) {
                // This shouldn't happen if authentication worked, but handle it gracefully
                console.error('❌ No node ID after authentication');
                this.updateStatus('disconnected', '⚠️ Authentication failed. Please try logging in again.');
                return;
            }

            // Log node information
            console.log('📋 Node Information:');
            console.log('  - Node ID:', nodeId);
            if (this.srishtiApp.chain) {
                const nodes = this.srishtiApp.chain.buildNodeMap();
                const institutions = this.srishtiApp.chain.getInstitutions();
                const node = nodes[nodeId];
                const institution = institutions.verified?.[nodeId];
                const role = this.srishtiApp.chain.getNodeRole(nodeId);

                console.log('  - Node Name:', node?.name || institution?.name || 'Unknown');
                console.log('  - Is Institution:', !!institution);
                console.log('  - Node Role:', role);
                
                if (institution) {
                    console.log('  - Institution Name:', institution.name);
                    console.log('  - Institution Category:', institution.category);
                }
            }

            // If network still doesn't exist, try to initialize it
            if (!this.srishtiApp.network && nodeId) {
                console.log('⚠️ Network not initialized, attempting to initialize...');
                if (typeof this.srishtiApp.initNetwork === 'function') {
                    try {
                        await this.srishtiApp.initNetwork();
                    } catch (error) {
                        console.warn('Failed to initialize network:', error);
                    }
                }
            }

            // Initialize SDK (let it get chain/network from window.SrishtiApp)
            // Use the nodeId we found (from SrishtiApp or localStorage)
            const finalNodeId = this.srishtiApp.nodeId || localStorage.getItem('srishti_node_id');
            this.sdk = new window.SrishtiSDK({
                nodeId: finalNodeId
            });

            const connectionInfo = await this.sdk.connect();

            // Show warning if network is not available
            if (!connectionInfo.networkAvailable) {
                this.updateStatus('disconnected', '⚠️ Network not connected. You can view data but cannot create sessions or mark attendance. Please ensure you are connected to the blockchain network.');
                console.warn('⚠️ Network not available. Some features may not work.');
            }

            // Initialize Attendance App
            this.attendance = new window.SrishtiAttendanceApp(this.sdk);

            this.initialized = true;

            // Debug: Verify the node and role
            const displayNodeId = this.srishtiApp.nodeId || finalNodeId;
            const role = this.sdk.getNodeRole();
            const isInst = this.sdk.isInstitution();

            console.log('🔍 Final Verification:');
            console.log('  - Node ID:', displayNodeId);
            console.log('  - Role:', role);
            console.log('  - Is Institution:', isInst);

            if (displayNodeId && !isInst && role === 'USER') {
                console.warn('⚠️ WARNING: Node is USER, not INSTITUTION. This node cannot create sessions.');
                console.warn('   Make sure you are logged in with the correct institution node ID.');
            }

            // Update UI
            this.updateStatus('connected', `Connected as: ${displayNodeId}`);
            this.updateUserInfo();

            // Load initial data
            await this.loadSessions();
            await this.loadActiveSessions();
            await this.loadCurrentRegistration();
            await this.loadHistory();
            await this.loadCertificates();
            
            // Auto-refresh active sessions every 10 seconds (to catch new sessions)
            // Only if user is not an institution (students need to see new sessions)
            if (!this.sdk.isInstitution() && !this.sdk.isRoot()) {
                setInterval(async () => {
                    // Only refresh if we're on the attend tab or sessions tab
                    const attendTab = document.getElementById('attend');
                    const sessionsTab = document.getElementById('sessions');
                    if (attendTab && attendTab.classList.contains('active')) {
                        await this.loadActiveSessions();
                    } else if (sessionsTab && sessionsTab.classList.contains('active')) {
                        await this.loadSessions();
                    }
                }, 10000); // Refresh every 10 seconds
            }

            // Set up event listeners
            this.setupEventListeners();

            console.log('✅ Attendance app initialized');
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
        const userInfo = document.getElementById('userInfo');
        const role = this.sdk.getNodeRole();
        const karma = this.sdk.getKarmaBalance();
        const isInst = this.sdk.isInstitution();
        const nodeId = this.sdk.nodeId;

        // Get node name from localStorage or chain
        let nodeName = localStorage.getItem('srishti_node_name');
        if (!nodeName && this.srishtiApp && this.srishtiApp.chain) {
            const nodes = this.srishtiApp.chain.buildNodeMap();
            const node = nodes[nodeId];
            if (node) {
                nodeName = node.name;
            }
            // Also check institutions
            if (!nodeName && isInst) {
                const institutions = this.srishtiApp.chain.getInstitutions();
                const inst = institutions.verified?.[nodeId];
                if (inst) {
                    nodeName = inst.name;
                }
            }
        }

        userInfo.innerHTML = `
            <strong>Node:</strong> ${nodeName || nodeId} ${isInst ? '🏛️' : ''} | 
            <strong>Role:</strong> ${role} | 
            <strong>KARMA:</strong> ${karma} | 
            <strong>Chain:</strong> ${this.sdk.getChainLength()} blocks
        `;
    }

    setupEventListeners() {
        // Create session form
        document.getElementById('createForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.createSession();
        });

        // Refresh buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.textContent.toLowerCase().replace(/\s+/g, '');
                if (tabName.includes('sessions')) this.loadSessions();
                if (tabName.includes('attend')) this.loadActiveSessions();
                if (tabName.includes('register')) this.loadCurrentRegistration();
                if (tabName.includes('history')) this.loadHistory();
                if (tabName.includes('certificates')) this.loadCertificates();
            });
        });
        
        // Register student ID form
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.registerStudent();
        });
    }

    async createSession() {
        const errorEl = document.getElementById('createError');
        errorEl.innerHTML = '';

        try {
            if (!this.sdk.isInstitution() && !this.sdk.isRoot()) {
                throw new Error('Only verified institutions can create sessions');
            }

            const title = document.getElementById('sessionTitle').value;
            const description = document.getElementById('sessionDescription').value;
            const location = document.getElementById('sessionLocation').value;
            const lat = parseFloat(document.getElementById('geofenceLat').value);
            const lng = parseFloat(document.getElementById('geofenceLng').value);
            const radius = parseInt(document.getElementById('geofenceRadius').value) || null;
            const endTimeStr = document.getElementById('sessionEndTime').value;

            const options = {
                title: title,
                description: description,
                location: location || null
            };

            if (lat && lng && radius) {
                options.geofence = { lat, lng, radius };
            }

            if (endTimeStr) {
                options.endTime = new Date(endTimeStr).getTime();
            }

            const sessionId = await this.attendance.createSession(options);

            errorEl.innerHTML = `<div class="success">✅ Session created: ${sessionId}</div>`;

            // Reset form
            document.getElementById('createForm').reset();

            // Wait a moment for the session to be stored
            await new Promise(resolve => setTimeout(resolve, 500));

            // Reload sessions
            await this.loadSessions();

            // Switch to sessions tab
            const sessionsTab = document.querySelector('.tab[onclick*="sessions"]');
            showTab('sessions', sessionsTab);
        } catch (error) {
            errorEl.innerHTML = `<div class="error">❌ ${error.message}</div>`;
        }
    }

    async loadSessions() {
        const listEl = document.getElementById('sessionsList');
        listEl.innerHTML = '<div class="loading">Loading...</div>';

        try {
            // First try to get sessions from local store
            let sessions = await this.attendance.getMySessions();
            
            // If no sessions found, also check on-chain events (in case they were created but not stored locally)
            if (sessions.length === 0) {
                console.log('No sessions in local store, checking on-chain events...');
                const allSessions = await this.attendance.getAllSessions();
                // Filter to only sessions created by current user
                sessions = allSessions.filter(s => s.createdBy === this.sdk.nodeId || s.owner === this.sdk.nodeId);
                console.log(`Found ${sessions.length} sessions from on-chain events`);
            }

            if (sessions.length === 0) {
                listEl.innerHTML = '<div class="empty-state">No sessions created yet</div>';
                return;
            }

            listEl.innerHTML = '<div class="grid">';

            for (const session of sessions) {
                // Wait a moment for chain to sync (in case new attendance was just marked)
                // This helps ensure we see the latest attendance records
                if (this.srishtiApp && this.srishtiApp.network) {
                    // Try to trigger a sync if network is available
                    try {
                        if (typeof this.srishtiApp.network.syncWithBestPeer === 'function') {
                            await this.srishtiApp.network.syncWithBestPeer().catch(() => {
                                // Ignore sync errors, just continue
                            });
                        }
                    } catch (e) {
                        // Ignore sync errors
                    }
                }
                
                const attendees = await this.attendance.getSessionAttendees(session.id);
                const stats = await this.attendance.getSessionStats(session.id);

                const isActive = session.status === 'ACTIVE' && (!session.endTime || Date.now() < session.endTime);

                listEl.innerHTML += `
                    <div class="card">
                        <h3>${session.title} <span class="badge ${isActive ? 'active' : 'ended'}">${session.status}</span></h3>
                        <p>${session.description || 'No description'}</p>
                        <p><strong>Location:</strong> ${session.location || 'Not specified'}</p>
                        <p><strong>Attendees:</strong> ${stats.total} (${stats.verified} verified, ${stats.pending} pending)</p>
                        <p><strong>Created:</strong> ${new Date(session.createdAt).toLocaleString()}</p>
                        <div class="actions">
                            <button onclick="attendanceApp.viewSession('${session.id}')">📊 View Table</button>
                            <button onclick="attendanceApp.exportToCSV('${session.id}', this)" style="background: rgba(255, 255, 255, 0.06); color: var(--text-primary); border: 1px solid rgba(255, 255, 255, 0.12);">📥 Export CSV</button>
                            ${isActive ? `<button onclick="attendanceApp.showQRCode('${session.id}')">📱 Show QR Code</button>` : ''}
                            ${isActive ? `<button class="btn-secondary" onclick="attendanceApp.endSession('${session.id}')">End</button>` : ''}
                            <button class="btn-secondary" onclick="attendanceApp.bulkVerify('${session.id}')">Verify All</button>
                        </div>
                    </div>
                `;
            }

            listEl.innerHTML += '</div>';
        } catch (error) {
            listEl.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        }
    }

    async loadActiveSessions() {
        const listEl = document.getElementById('activeSessionsList');
        listEl.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const sessions = await this.attendance.getActiveSessions();

            if (sessions.length === 0) {
                const chainLen = this.srishtiApp?.chain?.getLength?.() ?? 0;
                listEl.innerHTML = `
                    <div class="empty-state">
                        <p><strong>No active sessions available</strong></p>
                        <p style="margin-top: 12px; color: var(--text-secondary); font-size: 0.9em; line-height: 1.5;">
                            Sessions are discovered from the blockchain. If you created sessions as an <strong>institution</strong>, the student node must sync first.
                        </p>
                        <ul style="margin: 12px 0 0 1.2em; color: var(--text-secondary); font-size: 0.9em; line-height: 1.6;">
                            <li>Wait <strong>10–20 seconds</strong> after creating a session, then click <strong>Refresh Sessions</strong> below.</li>
                            <li>Ensure both institution and student are on the <strong>same network</strong> (same blockchain URL / relay).</li>
                            <li>Check the browser console for <code>📋 [getActiveSessions]</code> to see chain length and event counts.</li>
                        </ul>
                        <button onclick="attendanceApp.loadActiveSessions()" style="margin-top: 20px; padding: 12px 24px; border-radius: 12px; cursor: pointer; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: var(--text-primary); font-weight: 500;">🔄 Refresh Sessions</button>
                    </div>
                `;
                // Auto-refresh once after 8s in case chain was still syncing
                if (!this._activeSessionsAutoRefreshScheduled) {
                    this._activeSessionsAutoRefreshScheduled = true;
                    setTimeout(() => {
                        this._activeSessionsAutoRefreshScheduled = false;
                        const listEl = document.getElementById('activeSessionsList');
                        if (listEl && listEl.querySelector('.empty-state')) {
                            this.loadActiveSessions();
                        }
                    }, 8000);
                }
                return;
            }

            listEl.innerHTML = '<div class="grid">';

            for (const session of sessions) {
                const myAttendance = await this.attendance.getMyAttendance(session.id);
                const canMark = !myAttendance && session.status === 'ACTIVE';

                listEl.innerHTML += `
                    <div class="card">
                        <h3>${session.title}</h3>
                        <p>${session.description || 'No description'}</p>
                        <p><strong>Location:</strong> ${session.location || 'Not specified'}</p>
                        <p><strong>Time:</strong> ${new Date(session.startTime).toLocaleString()}</p>
                        ${myAttendance ? `<p><strong>Status:</strong> <span class="badge ${myAttendance.status.toLowerCase()}">${myAttendance.status}</span></p>` : ''}
                        <div class="actions">
                            ${canMark ? `<button onclick="attendanceApp.scanQRAndMark('${session.id}')">📷 Scan QR Code & Mark</button>` : ''}
                            ${canMark ? `<button class="btn-secondary" onclick="attendanceApp.markAttendance('${session.id}')">Mark with Location</button>` : ''}
                            ${myAttendance ? `<button disabled>Already Marked</button>` : ''}
                        </div>
                    </div>
                `;
            }

            listEl.innerHTML += '</div>';
        } catch (error) {
            listEl.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        }
    }

    async markAttendance(sessionId, qrCode = null) {
        const errorEl = document.getElementById('attendError');
        errorEl.innerHTML = '';

        try {
            // Get location if available
            let location = null;

            if (navigator.geolocation) {
                location = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                        (err) => {
                            console.warn('Geolocation error:', err);
                            resolve(null); // Continue without location
                        }
                    );
                });
            }

            await this.attendance.markAttendance(sessionId, { location, qrCode });

            errorEl.innerHTML = '<div class="success">✅ Attendance marked successfully!</div>';

            // Reload
            await this.loadActiveSessions();
            await this.loadHistory();
        } catch (error) {
            errorEl.innerHTML = `<div class="error">❌ ${error.message}</div>`;
        }
    }
    
    async scanQRAndMark(sessionId) {
        try {
            // Check if QR scanner is available (same as main app)
            if (!window.SrishtiScanner) {
                throw new Error('QR scanner not available. Please ensure the QR scanner library is loaded.');
            }
            
            const scanner = window.SrishtiScanner;
            const ui = this;
            
            // Use raw scan callback so we reliably receive every scan (attendance QR format)
            scanner.setRawScanCallback(async function handleAttendanceQR(decodedText) {
                try {
                    console.log('📷 QR Code scanned for attendance:', decodedText);
                    
                    await scanner.stopScanning();
                    scanner.showSuccess();
                    
                    // Detect node-share QR (yellow "join node" from main app) - show clear message
                    try {
                        const url = new URL(decodedText);
                        if (url.searchParams.get('join')) {
                            scanner.showError('That\'s a node invite QR. Scan the Attendance QR from your professor\'s session (My Sessions → Show QR Code).');
                            setTimeout(() => scanner.startScanning(), 3000);
                            return false;
                        }
                    } catch (e) { /* not a URL */ }
                    try {
                        const parsed = JSON.parse(decodedText);
                        const isNodeShare = parsed && ((parsed.t === 's' && parsed.n) || (parsed.type === 'srishti-invite' && parsed.nodeId));
                        if (isNodeShare) {
                            scanner.showError('That\'s a node invite QR. Scan the Attendance QR (yellow, from professor\'s session screen).');
                            setTimeout(() => scanner.startScanning(), 3000);
                            return false;
                        }
                    } catch (e) { /* not node-share JSON */ }
                    
                    // Parse QR data - attendance QR format (sessionId, timestamp, signature)
                    let qrCodeData = null;
                    try {
                        const parsed = JSON.parse(decodedText);
                        if (parsed && parsed.sessionId && parsed.timestamp && parsed.signature) {
                            qrCodeData = parsed;
                        }
                    } catch (e) {
                        if (window.SrishtiAttendanceQRCode) {
                            qrCodeData = window.SrishtiAttendanceQRCode.parseQR(decodedText);
                        }
                    }
                    
                    if (!qrCodeData) {
                        scanner.showError('Invalid attendance QR. Scan the yellow Attendance QR from the professor\'s session.');
                        setTimeout(() => scanner.startScanning(), 2000);
                        return false;
                    }
                    
                    if (qrCodeData.sessionId !== sessionId) {
                        scanner.showError('QR code is for a different session');
                        setTimeout(() => scanner.startScanning(), 2000);
                        return false;
                    }
                    
                    await ui.markAttendance(sessionId, qrCodeData);
                    
                    setTimeout(() => scanner.close(), 1000);
                    return true; // Handled
                } catch (error) {
                    console.error('Error processing attendance QR code:', error);
                    scanner.showError(error.message || 'Failed to mark attendance');
                    setTimeout(() => scanner.startScanning(), 2000);
                    return false;
                }
            });
            
            await scanner.open();
        } catch (error) {
            console.error('QR scanner error:', error);
            const errorEl = document.getElementById('attendError');
            errorEl.innerHTML = `<div class="error">❌ ${error.message}</div>`;
        }
    }
    
    async showQRCode(sessionId) {
        try {
            // Start QR generation if not already started
            let qrGenerator = this.attendance.qrGenerators?.get(sessionId);
            if (!qrGenerator) {
                qrGenerator = await this.attendance.startQRGeneration(sessionId, (qrData) => {
                    this.updateQRDisplay(sessionId, qrData);
                });
            }
            
            // Show QR code modal
            const qrData = qrGenerator.getCurrentQR();
            if (qrData) {
                this.showQRModal(sessionId, qrData);
            }
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    }
    
    showQRModal(sessionId, qrData) {
        // Create modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(5, 5, 16, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.03) 100%);
            backdrop-filter: blur(40px);
            -webkit-backdrop-filter: blur(40px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            padding: 40px;
            border-radius: 32px;
            max-width: 400px;
            width: 90%;
            text-align: center;
            box-shadow: 
                0 24px 80px rgba(0, 0, 0, 0.5),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
        `;
        
        const qrContainer = document.createElement('div');
        qrContainer.id = `qr-${sessionId}`;
        qrContainer.style.cssText = `
            width: 300px;
            height: 300px;
            margin: 20px auto;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            padding: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        content.innerHTML = `
            <h3 style="font-family: 'Syne', sans-serif; color: var(--text-primary); margin-bottom: 12px; font-size: 1.6em; font-weight: 700;">📱 Attendance QR Code</h3>
            <p style="color: var(--text-secondary); margin-bottom: 8px;">Students scan this <strong style="color: #FFD700;">yellow</strong> QR to mark attendance</p>
            <p style="color: rgba(255, 255, 255, 0.5); font-size: 0.9em;">Not the node-invite QR — this one is for this session only. Refreshes every 10s.</p>
        `;
        content.appendChild(qrContainer);
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = `
            margin-top: 24px;
            padding: 14px 32px;
            background: var(--text-primary);
            color: #000;
            border: none;
            border-radius: 50px;
            cursor: pointer;
            font-weight: 600;
            font-family: 'Outfit', sans-serif;
            transition: all 0.3s ease;
        `;
        closeBtn.onclick = () => {
            document.body.removeChild(modal);
        };
        closeBtn.onmouseenter = () => {
            closeBtn.style.transform = 'translateY(-2px)';
            closeBtn.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)';
        };
        closeBtn.onmouseleave = () => {
            closeBtn.style.transform = 'translateY(0)';
            closeBtn.style.boxShadow = 'none';
        };
        content.appendChild(closeBtn);
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Generate QR code visual (async)
        this.generateQRVisual(qrContainer, JSON.stringify(qrData)).catch(err => {
            console.error('Failed to generate QR code:', err);
        });
        
        // Update QR code every 10 seconds
        const updateInterval = setInterval(() => {
            const currentQR = this.attendance.getCurrentQR(sessionId);
            if (currentQR) {
                this.generateQRVisual(qrContainer, JSON.stringify(currentQR)).catch(err => {
                    console.error('Failed to update QR code:', err);
                });
            }
        }, 10000);
        
        // Clean up on close
        closeBtn.onclick = () => {
            clearInterval(updateInterval);
            document.body.removeChild(modal);
        };
    }
    
    async generateQRVisual(container, qrData) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">Generating QR code...</div>';
        
        try {
            // Prefer QRCodeStyling first - same yellow/gold style as main app (node-share QR)
            // So professors see one consistent "Srishti" look and students know which QR to scan
            if (typeof QRCodeStyling !== 'undefined') {
                container.innerHTML = '';
                const qr = new QRCodeStyling({
                    width: 280,
                    height: 280,
                    data: qrData,
                    dotsOptions: { color: '#FFD700', type: 'rounded' },
                    backgroundOptions: { color: 'transparent' },
                    cornersSquareOptions: { color: '#FFD700', type: 'extra-rounded' },
                    cornersDotOptions: { color: '#FFFFFF', type: 'dot' }
                });
                qr.append(container);
                console.log('✅ Attendance QR generated (QRCodeStyling, yellow style)');
                return;
            }
            
            // Fallback: qrcodejs with same yellow/gold as main app
            if (typeof QRCode !== 'undefined') {
                container.innerHTML = '';
                const qr = new QRCode(container, {
                    text: qrData,
                    width: 280,
                    height: 280,
                    colorDark: '#FFD700',
                    colorLight: '#050510',
                    correctLevel: QRCode.CorrectLevel.M || 1
                });
                console.log('✅ Attendance QR generated (qrcodejs, yellow style)');
                return;
            }
            
            // Fallback: Use a simple canvas-based QR code generator
            console.warn('QRCode library not found, using fallback');
            this.generateSimpleQR(container, qrData);
        } catch (error) {
            console.error('QR code generation error:', error);
            // Fallback: show data as text with copy option
            const escapedData = qrData.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            container.innerHTML = `
                <div style="padding: 20px; text-align: center;">
                    <p style="color: var(--text-secondary); margin-bottom: 12px;">QR Code Library not available</p>
                    <textarea readonly id="qr-data-text" style="width: 100%; height: 100px; padding: 12px; font-size: 0.85em; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; font-family: monospace; background: rgba(255, 255, 255, 0.05); color: var(--text-primary); resize: none;">${escapedData}</textarea>
                    <button onclick="navigator.clipboard.writeText(document.getElementById('qr-data-text').value).then(() => alert('Copied!'))" style="margin-top: 12px; padding: 12px 24px; background: var(--text-primary); color: #000; border: none; border-radius: 50px; cursor: pointer; font-weight: 600; font-family: 'Outfit', sans-serif;">
                        Copy QR Data
                    </button>
                    <p style="color: rgba(255, 255, 255, 0.5); font-size: 0.8em; margin-top: 12px;">Students can paste this data to mark attendance</p>
                </div>
            `;
        }
    }
    
    generateSimpleQR(container, qrData) {
        // Simple fallback: create a canvas and use a basic pattern
        // This is a very basic implementation - for production, use a proper QR library
        const canvas = document.createElement('canvas');
        canvas.width = 280;
        canvas.height = 280;
        const ctx = canvas.getContext('2d');
        
        // Fill white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 280, 280);
        
        // Draw a simple pattern (not a real QR code, but indicates data is there)
        ctx.fillStyle = '#000000';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, 260, 260);
        
        // Draw text indicating QR data
        const lines = qrData.match(/.{1,30}/g) || [qrData];
        lines.forEach((line, i) => {
            ctx.fillText(line, 140, 100 + (i * 20));
        });
        
        ctx.fillText('(QR Code Library Required)', 140, 250);
        
        container.innerHTML = '';
        container.appendChild(canvas);
    }
    
    updateQRDisplay(sessionId, qrData) {
        const container = document.getElementById(`qr-${sessionId}`);
        if (container) {
            this.generateQRVisual(container, JSON.stringify(qrData)).catch(err => {
                console.error('Failed to update QR display:', err);
            });
        }
    }
    
    async registerStudent() {
        const errorEl = document.getElementById('registerError');
        errorEl.innerHTML = '';
        
        try {
            const studentId = document.getElementById('studentId').value.trim();
            if (!studentId) {
                throw new Error('Student ID is required');
            }
            
            await this.attendance.registerStudent(studentId);
            
            errorEl.innerHTML = '<div class="success">✅ Student ID registered successfully!</div>';
            document.getElementById('registerForm').reset();
            
            await this.loadCurrentRegistration();
        } catch (error) {
            errorEl.innerHTML = `<div class="error">❌ ${error.message}</div>`;
        }
    }
    
    async loadCurrentRegistration() {
        const currentEl = document.getElementById('currentStudentId');
        try {
            const studentId = this.attendance.getStudentId();
            if (studentId) {
                currentEl.innerHTML = `<strong>${studentId}</strong> (Wallet: ${this.sdk.nodeId})`;
            } else {
                currentEl.innerHTML = '<em style="color: var(--text-secondary);">No student ID registered</em>';
            }
        } catch (error) {
            currentEl.innerHTML = `<span style="color: #ef4444;">Error: ${error.message}</span>`;
        }
    }

    async loadHistory() {
        const listEl = document.getElementById('historyList');
        listEl.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const history = await this.attendance.getMyAttendanceHistory();

            if (history.length === 0) {
                listEl.innerHTML = '<div class="empty-state">No attendance history</div>';
                return;
            }

            listEl.innerHTML = '<div class="grid">';

            for (const record of history) {
                listEl.innerHTML += `
                    <div class="card">
                        <h3>${record.sessionTitle}</h3>
                        <p><strong>Status:</strong> <span class="badge ${record.status.toLowerCase()}">${record.status}</span></p>
                        <p><strong>Marked:</strong> ${new Date(record.timestamp).toLocaleString()}</p>
                        ${record.verifiedAt ? `<p><strong>Verified:</strong> ${new Date(record.verifiedAt).toLocaleString()}</p>` : ''}
                    </div>
                `;
            }

            listEl.innerHTML += '</div>';
        } catch (error) {
            listEl.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        }
    }

    async loadCertificates() {
        const listEl = document.getElementById('certificatesList');
        listEl.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const certificates = this.attendance.getMyAttendanceCertificates();

            if (certificates.length === 0) {
                listEl.innerHTML = '<div class="empty-state">No certificates yet</div>';
                return;
            }

            listEl.innerHTML = '<div class="grid">';

            for (const cert of certificates) {
                listEl.innerHTML += `
                    <div class="card">
                        <h3>${cert.title}</h3>
                        <p>${cert.description || ''}</p>
                        <p><strong>Issued by:</strong> ${cert.issuerName || cert.issuer}</p>
                        <p><strong>Issued:</strong> ${new Date(cert.mintedAt).toLocaleString()}</p>
                    </div>
                `;
            }

            listEl.innerHTML += '</div>';
        } catch (error) {
            listEl.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        }
    }

    async endSession(sessionId) {
        if (!confirm('End this session? Students will no longer be able to mark attendance.')) {
            return;
        }

        try {
            await this.attendance.endSession(sessionId);
            await this.loadSessions();
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    }

    async bulkVerify(sessionId) {
        if (!confirm('Verify all pending attendance for this session?')) {
            return;
        }

        try {
            const results = await this.attendance.bulkVerifyAll(sessionId);
            const success = results.filter(r => r.success).length;
            alert(`Verified ${success} out of ${results.length} attendees`);
            await this.loadSessions();
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    }

    async viewSession(sessionId) {
        try {
        const session = await this.attendance.getSession(sessionId);
        const attendees = await this.attendance.getSessionAttendees(sessionId);

            this.showAttendanceTableModal(session, attendees);
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    }

    showAttendanceTableModal(session, attendees) {
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'attendance-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(5, 5, 16, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            padding: 20px;
            overflow-y: auto;
        `;
        
        const content = document.createElement('div');
        content.className = 'attendance-modal-content';
        content.style.cssText = `
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.03) 100%);
            backdrop-filter: blur(40px);
            -webkit-backdrop-filter: blur(40px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 32px;
            padding: 40px;
            max-width: 900px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            color: var(--text-primary);
            position: relative;
            box-shadow: 
                0 24px 80px rgba(0, 0, 0, 0.5),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
        `;
        
        // Header
        const header = document.createElement('div');
        header.style.cssText = 'margin-bottom: 24px;';
        header.innerHTML = `
            <h2 style="font-family: 'Syne', sans-serif; font-size: 2em; font-weight: 700; margin-bottom: 8px; color: var(--text-primary);">${session.title}</h2>
            <p style="color: var(--text-secondary); margin-bottom: 16px;">${session.description || 'No description'}</p>
            <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: center;">
                <span style="color: var(--text-secondary);">Total Attendees: <strong style="color: var(--text-primary);">${attendees.length}</strong></span>
                <span style="color: var(--text-secondary);">Verified: <strong style="color: #10b981;">${attendees.filter(a => a.status === 'VERIFIED').length}</strong></span>
                <span style="color: var(--text-secondary);">Pending: <strong style="color: #fbbf24;">${attendees.filter(a => a.status === 'PENDING').length}</strong></span>
            </div>
        `;
        content.appendChild(header);
        
        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            position: absolute;
            top: 18px;
            right: 22px;
            color: rgba(255, 255, 255, 0.6);
            font-size: 32px;
            font-weight: 300;
            cursor: pointer;
            background: none;
            border: none;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        `;
        closeBtn.onmouseenter = () => {
            closeBtn.style.color = 'var(--text-primary)';
            closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            closeBtn.style.transform = 'rotate(90deg)';
        };
        closeBtn.onmouseleave = () => {
            closeBtn.style.color = 'rgba(255, 255, 255, 0.6)';
            closeBtn.style.background = 'none';
            closeBtn.style.transform = 'rotate(0deg)';
        };
        closeBtn.onclick = () => {
            document.body.removeChild(modal);
        };
        content.appendChild(closeBtn);
        
        // Export buttons
        const exportButtons = document.createElement('div');
        exportButtons.style.cssText = 'display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;';
        const exportBtn = document.createElement('button');
        exportBtn.textContent = '📥 Export CSV';
        exportBtn.style.cssText = `
            background: rgba(255, 255, 255, 0.06);
            color: var(--text-primary);
            border: 1px solid rgba(255, 255, 255, 0.12);
            padding: 12px 24px;
            border-radius: 50px;
            cursor: pointer;
            font-weight: 500;
            font-family: 'Outfit', sans-serif;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        `;
        exportBtn.onclick = () => {
            this.exportToCSV(session.id, exportBtn);
        };
        exportButtons.appendChild(exportBtn);
        content.appendChild(exportButtons);
        
        // Table container
        const tableContainer = document.createElement('div');
        tableContainer.style.cssText = 'overflow-x: auto;';
        
        // Create table
        const table = document.createElement('table');
        table.className = 'attendance-table';
        table.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 16px;
            overflow: hidden;
        `;
        
        // Table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr style="background: rgba(255, 255, 255, 0.05);">
                <th style="padding: 16px; text-align: left; font-weight: 600; color: var(--text-primary); border-bottom: 1px solid rgba(255, 255, 255, 0.1);">#</th>
                <th style="padding: 16px; text-align: left; font-weight: 600; color: var(--text-primary); border-bottom: 1px solid rgba(255, 255, 255, 0.1);">Student ID</th>
                <th style="padding: 16px; text-align: left; font-weight: 600; color: var(--text-primary); border-bottom: 1px solid rgba(255, 255, 255, 0.1);">Name</th>
                <th style="padding: 16px; text-align: left; font-weight: 600; color: var(--text-primary); border-bottom: 1px solid rgba(255, 255, 255, 0.1);">Wallet Address</th>
                <th style="padding: 16px; text-align: left; font-weight: 600; color: var(--text-primary); border-bottom: 1px solid rgba(255, 255, 255, 0.1);">Status</th>
                <th style="padding: 16px; text-align: left; font-weight: 600; color: var(--text-primary); border-bottom: 1px solid rgba(255, 255, 255, 0.1);">Marked At</th>
                <th style="padding: 16px; text-align: left; font-weight: 600; color: var(--text-primary); border-bottom: 1px solid rgba(255, 255, 255, 0.1);">Verified At</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Table body
        const tbody = document.createElement('tbody');
        
        if (attendees.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="padding: 40px; text-align: center; color: var(--text-secondary);">
                        No attendees yet
                    </td>
                </tr>
            `;
        } else {
            attendees.forEach((attendee, index) => {
                const row = document.createElement('tr');
                row.style.cssText = `
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    transition: background 0.2s ease;
                `;
                row.onmouseenter = () => {
                    row.style.background = 'rgba(255, 255, 255, 0.05)';
                };
                row.onmouseleave = () => {
                    row.style.background = 'transparent';
                };
                
                const studentId = attendee.studentId && attendee.studentId !== attendee.walletAddress 
                    ? attendee.studentId 
                    : 'N/A';
                const displayName = attendee.nodeName || 'Unknown';
                const walletAddress = attendee.walletAddress || attendee.owner || 'N/A';
                const status = attendee.status || 'PENDING';
                const markedAt = attendee.timestamp 
                    ? new Date(attendee.timestamp).toLocaleString() 
                    : 'N/A';
                const verifiedAt = attendee.verifiedAt 
                    ? new Date(attendee.verifiedAt).toLocaleString() 
                    : '-';
                
                const statusBadgeClass = status.toLowerCase();
                const statusColor = status === 'VERIFIED' ? '#10b981' : 
                                   status === 'PENDING' ? '#fbbf24' : 
                                   '#ef4444';
                
                row.innerHTML = `
                    <td style="padding: 16px; color: var(--text-secondary);">${index + 1}</td>
                    <td style="padding: 16px; color: var(--text-primary); font-weight: 500;">${studentId}</td>
                    <td style="padding: 16px; color: var(--text-primary);">${displayName}</td>
                    <td style="padding: 16px; color: var(--text-secondary); font-family: monospace; font-size: 0.85em; word-break: break-all;">${walletAddress.substring(0, 20)}...</td>
                    <td style="padding: 16px;">
                        <span class="badge ${statusBadgeClass}" style="
                            display: inline-block;
                            padding: 6px 12px;
                            border-radius: 12px;
                            font-size: 0.75em;
                            font-weight: 600;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                            background: ${status === 'VERIFIED' ? 'rgba(16, 185, 129, 0.2)' : 
                                        status === 'PENDING' ? 'rgba(251, 191, 36, 0.2)' : 
                                        'rgba(239, 68, 68, 0.2)'};
                            color: ${statusColor};
                            border: 1px solid ${status === 'VERIFIED' ? 'rgba(16, 185, 129, 0.3)' : 
                                            status === 'PENDING' ? 'rgba(251, 191, 36, 0.3)' : 
                                            'rgba(239, 68, 68, 0.3)'};
                        ">${status}</span>
                    </td>
                    <td style="padding: 16px; color: var(--text-secondary); font-size: 0.9em;">${markedAt}</td>
                    <td style="padding: 16px; color: var(--text-secondary); font-size: 0.9em;">${verifiedAt}</td>
                `;
                tbody.appendChild(row);
            });
        }
        
        table.appendChild(tbody);
        tableContainer.appendChild(table);
        content.appendChild(tableContainer);
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Store session data for export
        modal.dataset.sessionId = session.id;
        modal.dataset.sessionTitle = session.title;
    }

    async exportToCSV(sessionId, buttonElement = null) {
        try {
            const session = await this.attendance.getSession(sessionId);
            const attendees = await this.attendance.getSessionAttendees(sessionId);
            
            // Prepare CSV data
            const headers = [
                'Student ID',
                'Name',
                'Wallet Address',
                'Status',
                'Marked At',
                'Verified At',
                'Location Provided',
                'Distance From Venue (m)'
            ];
            
            const rows = attendees.map(attendee => {
                const studentId = attendee.studentId && attendee.studentId !== attendee.walletAddress 
                    ? attendee.studentId 
                    : 'N/A';
                const displayName = attendee.nodeName || 'Unknown';
                const walletAddress = attendee.walletAddress || attendee.owner || 'N/A';
                const status = attendee.status || 'PENDING';
                const markedAt = attendee.timestamp 
                    ? new Date(attendee.timestamp).toISOString() 
                    : 'N/A';
                const verifiedAt = attendee.verifiedAt 
                    ? new Date(attendee.verifiedAt).toISOString() 
                    : '';
                const locationProvided = attendee.location ? 'Yes' : 'No';
                const distance = attendee.distanceFromVenue 
                    ? (attendee.distanceFromVenue.toFixed(2) + ' m') 
                    : 'N/A';
                
                return [
                    studentId,
                    displayName,
                    walletAddress,
                    status,
                    markedAt,
                    verifiedAt,
                    locationProvided,
                    distance
                ];
            });
            
            // Create CSV content
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => {
                    // Escape commas and quotes in CSV
                    const cellStr = String(cell || '');
                    if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                        return `"${cellStr.replace(/"/g, '""')}"`;
                    }
                    return cellStr;
                }).join(','))
            ].join('\n');
            
            // Create download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            
            // Sanitize filename
            const sanitizedTitle = session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const timestamp = new Date().toISOString().split('T')[0];
            link.download = `attendance_${sanitizedTitle}_${timestamp}.csv`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            // Show success message
            if (buttonElement) {
                const originalText = buttonElement.textContent;
                buttonElement.textContent = '✅ Exported!';
                buttonElement.style.background = 'rgba(16, 185, 129, 0.2)';
                buttonElement.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                buttonElement.style.color = '#10b981';
                setTimeout(() => {
                    buttonElement.textContent = originalText;
                    buttonElement.style.background = '';
                    buttonElement.style.borderColor = '';
                    buttonElement.style.color = '';
                }, 2000);
            }
        } catch (error) {
            console.error('Export error:', error);
            alert(`Error exporting CSV: ${error.message}`);
        }
    }
}

// Global functions
function showTab(tabName, clickedElement) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Show selected tab
    const tabContent = document.getElementById(tabName);
    if (tabContent) {
        tabContent.classList.add('active');
    }
    
    // Activate the clicked tab button
    if (clickedElement) {
        clickedElement.classList.add('active');
    } else {
        // Fallback: find tab by text content
        document.querySelectorAll('.tab').forEach(tab => {
            const tabText = tab.textContent.toLowerCase().trim();
            const tabNameLower = tabName.toLowerCase();
            if (tabText.includes(tabNameLower) || 
                (tabNameLower === 'sessions' && tabText.includes('my sessions')) ||
                (tabNameLower === 'create' && tabText.includes('create')) ||
                (tabNameLower === 'attend' && tabText.includes('mark attendance')) ||
                (tabNameLower === 'register' && tabText.includes('register')) ||
                (tabNameLower === 'history' && tabText.includes('history')) ||
                (tabNameLower === 'certificates' && tabText.includes('certificates'))) {
                tab.classList.add('active');
            }
        });
    }
}

// Initialize app when blockchain is ready
let attendanceApp;

function initAttendanceApp() {
    if (!window.srishtiAppInstance) {
        // Wait a bit more for blockchain to initialize
        setTimeout(initAttendanceApp, 500);
        return;
    }

    attendanceApp = new AttendanceAppUI();
    attendanceApp.init();
}

// Start initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initAttendanceApp, 1000);
    });
} else {
    setTimeout(initAttendanceApp, 1000);
}
