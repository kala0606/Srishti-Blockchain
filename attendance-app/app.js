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
            console.log('🔑 LocalStorage credentials check:');
            console.log('  - nodeId:', localStorage.getItem('srishti_node_id'));
            console.log('  - nodeName:', localStorage.getItem('srishti_node_name'));
            console.log('  - hasPublicKey:', !!localStorage.getItem('srishti_public_key'));
            console.log('  - hasPrivateKey:', !!localStorage.getItem('srishti_private_key'));

            // Check if user is logged in
            const hasCredentials = localStorage.getItem('srishti_node_id') &&
                localStorage.getItem('srishti_private_key');

            // Wait for blockchain instance to be available
            if (!window.srishtiAppInstance) {
                throw new Error('Srishti blockchain instance not loaded. Check script loading.');
            }

            // Use the existing instance
            this.srishtiApp = window.srishtiAppInstance;

            // AUTO-RECOVERY: If we have private key but missing public key
            // We do this AFTER getting the instance so we have access to SrishtiKeys
            const storedPrivateKey = localStorage.getItem('srishti_private_key');
            if (storedPrivateKey && !localStorage.getItem('srishti_public_key')) {
                console.log('🔄 Attempting to recover Public Key from stored Private Key...');
                try {
                    // Ensure SrishtiKeys is available
                    let keysLib = window.SrishtiKeys;
                    if (!keysLib && this.srishtiApp.SrishtiKeys) {
                        keysLib = this.srishtiApp.SrishtiKeys;
                    }

                    if (keysLib) {
                        const privateKey = await keysLib.importPrivateKey(storedPrivateKey);
                        const jwk = await crypto.subtle.exportKey('jwk', privateKey);

                        // Derive public key from JWK 'x' parameter
                        if (jwk.x) {
                            const xBase64 = jwk.x.replace(/-/g, '+').replace(/_/g, '/');
                            const xBinary = atob(xBase64);
                            const xBytes = new Uint8Array(xBinary.length);
                            for (let i = 0; i < xBinary.length; i++) xBytes[i] = xBinary.charCodeAt(i);

                            const publicKey = await crypto.subtle.importKey(
                                'raw', xBytes, { name: 'Ed25519', namedCurve: 'Ed25519' }, true, ['verify']
                            );

                            const publicKeyBase64 = await keysLib.exportPublicKeyBase64(publicKey);
                            localStorage.setItem('srishti_public_key', publicKeyBase64);
                            console.log('✅ Public Key recovered and saved.');
                        }
                    } else {
                        console.warn('⚠️ SrishtiKeys library not found for recovery.');
                    }
                } catch (e) {
                    console.warn('⚠️ Credential recovery failed:', e);
                }
            }

            if (!hasCredentials) {
                console.warn('⚠️ No credentials found in localStorage. App functionality will be limited.');
                // We don't redirect anymore, just warn
            }

            console.log('🔍 SrishtiApp instance check:');
            console.log('  - initialized:', this.srishtiApp.initialized);
            console.log('  - nodeId:', this.srishtiApp.nodeId);
            console.log('  - hasKeyPair:', !!this.srishtiApp.keyPair);

            // If not initialized, initialize it
            if (!this.srishtiApp.initialized) {
                await this.srishtiApp.init();
            }

            // CRITICAL: Wait for credentials to be loaded from localStorage
            // The main app.js loads credentials during init(), but it's async
            let credentialWaitRetries = 0;
            const storedNodeId = localStorage.getItem('srishti_node_id');
            const hasStoredCredentials = storedNodeId &&
                localStorage.getItem('srishti_public_key') &&
                localStorage.getItem('srishti_private_key');

            if (hasStoredCredentials && !this.srishtiApp.nodeId) {
                console.log('⏳ Waiting for SrishtiApp to load credentials from localStorage...');
                while (!this.srishtiApp.nodeId && credentialWaitRetries < 20) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    credentialWaitRetries++;
                }

                if (this.srishtiApp.nodeId) {
                    console.log('✅ Credentials loaded:', this.srishtiApp.nodeId);
                } else {
                    console.warn('⚠️ Credentials not loaded after waiting. May need manual login.');
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

            // FALLBACK: If credentials couldn't be loaded (e.g., private key import failed)
            // but we have a nodeId in localStorage, check if it exists on the chain
            // This handles cases where the private key is corrupted but the nodeId is valid
            if (!this.srishtiApp.nodeId && storedNodeId && this.srishtiApp.chain) {
                console.log('🔄 Checking if stored nodeId exists on chain...');
                const nodes = this.srishtiApp.chain.buildNodeMap();
                const institutions = this.srishtiApp.chain.getInstitutions();
                const node = nodes[storedNodeId];
                const institution = institutions.verified?.[storedNodeId];
                
                if (node || institution) {
                    console.log('✅ Found node on chain, setting nodeId (read-only mode)');
                    this.srishtiApp.nodeId = storedNodeId;
                    const storedNodeName = localStorage.getItem('srishti_node_name');
                    if (storedNodeName) {
                        this.srishtiApp.currentUser = { id: storedNodeId, name: storedNodeName };
                    } else if (institution) {
                        this.srishtiApp.currentUser = { id: storedNodeId, name: institution.name };
                    } else if (node) {
                        this.srishtiApp.currentUser = { id: storedNodeId, name: node.name };
                    }
                    
                    // Set public key if available (even without private key, we can verify identity)
                    const storedPublicKey = localStorage.getItem('srishti_public_key');
                    if (storedPublicKey) {
                        try {
                            this.srishtiApp.publicKeyBase64 = storedPublicKey;
                            this.srishtiApp.keyPair = {
                                publicKey: await window.SrishtiKeys.importPublicKey(storedPublicKey),
                                privateKey: null // No private key = read-only mode
                            };
                            console.log('✅ Public key loaded (read-only mode - no private key)');
                        } catch (e) {
                            console.warn('⚠️ Could not import public key:', e);
                        }
                    }
                } else {
                    console.warn('⚠️ Stored nodeId not found on chain:', storedNodeId);
                }
            }

            // Network might not exist if user hasn't created a node yet
            // Try to initialize network in guest mode for read-only access
            // BUT: Only use guest mode if there's NO stored credentials
            if (!this.srishtiApp.network && typeof this.srishtiApp.initNetwork === 'function') {
                // Wait a bit for SrishtiApp to load credentials from localStorage
                // Also wait for our fallback nodeId setting to complete
                let credentialRetries = 0;
                while (!this.srishtiApp.nodeId && credentialRetries < 10) {
                    const hasStoredId = localStorage.getItem('srishti_node_id');
                    if (hasStoredId) {
                        // Credentials exist but not loaded yet, wait
                        await new Promise(resolve => setTimeout(resolve, 100));
                        credentialRetries++;
                    } else {
                        // No credentials, break
                        break;
                    }
                }

                // Check if we have a nodeId (either from credentials or from chain fallback)
                const hasNodeId = !!this.srishtiApp.nodeId;
                const hasStoredCredentials = localStorage.getItem('srishti_node_id') &&
                    localStorage.getItem('srishti_public_key') &&
                    localStorage.getItem('srishti_private_key');

                // If we have a nodeId (even without full credentials), try to initialize network
                // The network might work in read-only mode without private key
                if (hasNodeId) {
                    console.log('🔄 Attempting to initialize network with nodeId (may be read-only)...');
                    try {
                        // Try to initialize network - it may work even without private key for read-only
                        await this.srishtiApp.initNetwork(false);
                        console.log('✅ Network initialized with nodeId');
                    } catch (error) {
                        console.warn('Failed to initialize network with nodeId:', error);
                        // If that fails, try guest mode as fallback
                        if (!hasStoredCredentials) {
                            console.log('🔄 Falling back to guest mode...');
                            try {
                                await this.srishtiApp.initNetwork(true); // true = guestMode
                                console.log('✅ Network initialized in guest mode');
                            } catch (guestError) {
                                console.warn('Failed to initialize network in guest mode:', guestError);
                            }
                        }
                    }
                } else {
                    console.log('🔄 Attempting to initialize network in guest mode...');
                    try {
                        // Try guest mode - allows viewing without registering
                        await this.srishtiApp.initNetwork(true); // true = guestMode
                        console.log('✅ Network initialized in guest mode');
                    } catch (error) {
                        console.warn('Failed to initialize network in guest mode:', error);
                    }
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

            // Check if user has registered (check both SrishtiApp instance and localStorage)
            // Wait a bit for nodeId to be loaded from localStorage
            let nodeId = this.srishtiApp.nodeId || localStorage.getItem('srishti_node_id');

            // Debug: Log what we found
            console.log('🔍 Checking for node ID:');
            console.log('  - SrishtiApp.nodeId:', this.srishtiApp.nodeId);
            console.log('  - localStorage nodeId:', localStorage.getItem('srishti_node_id'));
            console.log('  - localStorage nodeName:', localStorage.getItem('srishti_node_name'));
            console.log('  - Chain length:', this.srishtiApp.chain.getLength());

            retries = 0;
            while (!nodeId && retries < 20) {
                await new Promise(resolve => setTimeout(resolve, 100));
                nodeId = this.srishtiApp.nodeId || localStorage.getItem('srishti_node_id');
                retries++;
            }

            // DO NOT auto-select nodes from chain - user must be logged in
            // The nodeId must come from localStorage (user's actual login)

            // Update SrishtiApp nodeId if we found it
            if (!this.srishtiApp.nodeId && nodeId) {
                this.srishtiApp.nodeId = nodeId;
                console.log('✅ Using node ID:', nodeId);

                // Verify and log node information
                if (this.srishtiApp.chain) {
                    const nodes = this.srishtiApp.chain.buildNodeMap();
                    const institutions = this.srishtiApp.chain.getInstitutions();
                    const node = nodes[nodeId];
                    const institution = institutions.verified?.[nodeId];

                    console.log('📋 Node Information:');
                    console.log('  - Node ID:', nodeId);
                    console.log('  - Node Name:', node?.name || 'Unknown');
                    console.log('  - Is Institution:', !!institution);
                    if (institution) {
                        console.log('  - Institution Name:', institution.name);
                        console.log('  - Institution Category:', institution.category);
                    }
                    console.log('  - Node Role:', this.srishtiApp.chain.getNodeRole(nodeId));

                    // Store institution name if found
                    if (institution && institution.name) {
                        localStorage.setItem('srishti_node_name', institution.name);
                    } else if (node && node.name) {
                        localStorage.setItem('srishti_node_name', node.name);
                    }
                }
            }

            if (!nodeId) {
                // User hasn't logged in - show helpful message
                const currentDomain = window.location.hostname;
                const blockchainDomain = window.SRISHTI_BLOCKCHAIN_URL ? new URL(window.SRISHTI_BLOCKCHAIN_URL).hostname : 'kala0606.github.io';
                const isDifferentDomain = currentDomain !== blockchainDomain && currentDomain !== 'localhost' && currentDomain !== '127.0.0.1';

                this.updateStatus('disconnected', '⚠️ Not logged in. Please log in to the blockchain first.');
                document.getElementById('userInfo').innerHTML = `
                    <div style="background: #fff3cd; padding: 16px; border-radius: 8px; margin-top: 10px;">
                        <strong>🔐 Login Required</strong><br>
                        ${isDifferentDomain ?
                        `You're on <strong>${currentDomain}</strong> but logged in on <strong>${blockchainDomain}</strong>.<br>
                            <strong>Solution:</strong> Open the attendance app on the same domain as the blockchain, or log in on this domain.<br>` :
                        'You need to log in to the Srishti blockchain to use this app.<br>'
                    }
                        <a href="${window.SRISHTI_BLOCKCHAIN_URL || 'https://kala0606.github.io/Srishti-Blockchain/'}" target="_blank" style="color: #667eea; text-decoration: underline;">
                            Click here to log in →
                        </a>
                        <br><small>After logging in, refresh this page.</small>
                    </div>
                `;

                // Disable interactive features but allow viewing
                this.initialized = false;
                console.warn('⚠️ User not registered. Read-only mode enabled.');

                // Show read-only message in all tabs
                document.getElementById('sessionsList').innerHTML = `
                    <div class="empty-state">
                        <p>Please register on the blockchain to view sessions.</p>
                    </div>
                `;
                document.getElementById('activeSessionsList').innerHTML = `
                    <div class="empty-state">
                        <p>Please register on the blockchain to view active sessions.</p>
                    </div>
                `;
                document.getElementById('historyList').innerHTML = `
                    <div class="empty-state">
                        <p>Please register on the blockchain to view your attendance history.</p>
                    </div>
                `;
                document.getElementById('certificatesList').innerHTML = `
                    <div class="empty-state">
                        <p>Please register on the blockchain to view certificates.</p>
                    </div>
                `;

                return; // Exit early - can't do interactive features
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
            await this.loadHistory();
            await this.loadCertificates();

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
                if (tabName.includes('history')) this.loadHistory();
                if (tabName.includes('certificates')) this.loadCertificates();
            });
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

            // Reload sessions
            await this.loadSessions();

            // Switch to sessions tab
            showTab('sessions');
        } catch (error) {
            errorEl.innerHTML = `<div class="error">❌ ${error.message}</div>`;
        }
    }

    async loadSessions() {
        const listEl = document.getElementById('sessionsList');
        listEl.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const sessions = await this.attendance.getMySessions();

            if (sessions.length === 0) {
                listEl.innerHTML = '<div class="empty-state">No sessions created yet</div>';
                return;
            }

            listEl.innerHTML = '<div class="grid">';

            for (const session of sessions) {
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
                            <button onclick="attendanceApp.viewSession('${session.id}')">View</button>
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
                listEl.innerHTML = '<div class="empty-state">No active sessions available</div>';
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
                            ${canMark ? `<button onclick="attendanceApp.markAttendance('${session.id}')">Mark Attendance</button>` : ''}
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

    async markAttendance(sessionId) {
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

            await this.attendance.markAttendance(sessionId, { location });

            errorEl.innerHTML = '<div class="success">✅ Attendance marked successfully!</div>';

            // Reload
            await this.loadActiveSessions();
            await this.loadHistory();
        } catch (error) {
            errorEl.innerHTML = `<div class="error">❌ ${error.message}</div>`;
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
        const session = await this.attendance.getSession(sessionId);
        const attendees = await this.attendance.getSessionAttendees(sessionId);

        let html = `<h3>${session.title}</h3>`;
        html += `<p>${session.description || ''}</p>`;
        html += `<h4>Attendees (${attendees.length})</h4>`;
        html += '<ul>';

        for (const attendee of attendees) {
            html += `<li>${attendee.studentId} - <span class="badge ${attendee.status.toLowerCase()}">${attendee.status}</span></li>`;
        }

        html += '</ul>';

        alert(html.replace(/<[^>]*>/g, '\n')); // Simple alert, could be a modal
    }
}

// Global functions
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
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
