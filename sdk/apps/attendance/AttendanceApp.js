/**
 * Srishti Attendance App - First dApp Built on Srishti SDK
 * 
 * A decentralized attendance management system for institutions.
 * 
 * Features:
 * - Institutions create attendance sessions (classes, events, meetings)
 * - Students mark attendance with location proof
 * - Institutions verify attendance
 * - Attendance certificates as soulbound tokens
 * 
 * Data Architecture:
 * - ON-CHAIN: Minimal proofs (session exists, attendance marked, verified)
 * - OFF-CHAIN: Full session details, attendee info, location data
 * 
 * @version 1.0.0
 * @requires SrishtiSDK
 * @requires SrishtiAppDataStore
 */

class AttendanceApp {
    // App identifier - used for all on-chain events
    static APP_ID = 'srishti.attendance.v1';
    
    // App-specific action types
    static ACTIONS = {
        SESSION_CREATE: 'SESSION_CREATE',
        SESSION_END: 'SESSION_END',
        MARK_PRESENT: 'MARK_PRESENT',
        VERIFY: 'VERIFY',
        ISSUE_CERTIFICATE: 'ISSUE_CERTIFICATE',
        STUDENT_REGISTER: 'STUDENT_REGISTER' // Register student ID to wallet address
    };
    
    // Attendance status
    static STATUS = {
        PENDING: 'PENDING',
        VERIFIED: 'VERIFIED',
        REJECTED: 'REJECTED'
    };
    
    /**
     * Create a new Attendance App instance
     * @param {SrishtiSDK} sdk - Initialized SDK instance
     */
    constructor(sdk) {
        if (!sdk) {
            throw new Error('AttendanceApp requires a SrishtiSDK instance');
        }
        
        this.sdk = sdk;
        this.store = sdk.getAppStore(AttendanceApp.APP_ID);
        
        // Student registry: wallet address -> student ID mapping
        this.studentRegistry = new Map();
        
        // QR code generators for active sessions (professor only)
        this.qrGenerators = new Map(); // sessionId -> AttendanceQRCode instance
        
        // Set up event listener for real-time updates
        this._setupEventListener();
        
        // Load student registry
        this._loadStudentRegistry();
    }
    
    /**
     * Set up listener for attendance-related events
     * @private
     */
    _setupEventListener() {
        this.sdk.onAppEvent(AttendanceApp.APP_ID, async (event) => {
            console.log(`📋 Attendance event: ${event.action}`, event.payload);
            
            // Trigger custom callbacks if set
            if (this.onSessionEvent && event.action === AttendanceApp.ACTIONS.SESSION_CREATE) {
                this.onSessionEvent(event);
            }
            if (this.onAttendanceEvent && event.action === AttendanceApp.ACTIONS.MARK_PRESENT) {
                this.onAttendanceEvent(event);
            }
            if (this.onVerifyEvent && event.action === AttendanceApp.ACTIONS.VERIFY) {
                this.onVerifyEvent(event);
            }
            if (event.action === AttendanceApp.ACTIONS.STUDENT_REGISTER) {
                // Update local registry
                const { studentId, walletAddress } = event.payload || {};
                if (studentId && walletAddress) {
                    this.studentRegistry.set(walletAddress, studentId);
                    await this._saveStudentRegistry();
                }
            }
        });
    }
    
    /**
     * Load student registry from storage
     * @private
     */
    async _loadStudentRegistry() {
        try {
            const registry = await this.store.get('student_registry');
            if (registry && Array.isArray(registry)) {
                registry.forEach(({ walletAddress, studentId }) => {
                    this.studentRegistry.set(walletAddress, studentId);
                });
            }
        } catch (error) {
            console.warn('Failed to load student registry:', error);
        }
    }
    
    /**
     * Save student registry to storage
     * @private
     */
    async _saveStudentRegistry() {
        try {
            const registry = Array.from(this.studentRegistry.entries()).map(([walletAddress, studentId]) => ({
                walletAddress,
                studentId
            }));
            await this.store.put('student_registry', registry);
        } catch (error) {
            console.warn('Failed to save student registry:', error);
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // SESSION MANAGEMENT (Institution only)
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Create an attendance session
     * 
     * @param {Object} options - Session options
     * @param {string} options.title - Session title
     * @param {string} [options.description] - Session description
     * @param {number} [options.startTime] - Start timestamp (defaults to now)
     * @param {number} [options.endTime] - End timestamp (null for open-ended)
     * @param {string} [options.location] - Location description
     * @param {Object} [options.geofence] - Geofence for location verification
     * @param {number} options.geofence.lat - Latitude
     * @param {number} options.geofence.lng - Longitude
     * @param {number} options.geofence.radius - Radius in meters
     * @param {number} [options.maxParticipants] - Max attendees
     * @returns {Promise<string>} Session ID
     * 
     * @example
     * const sessionId = await app.createSession({
     *     title: 'Blockchain 101 - Lecture 5',
     *     description: 'Introduction to consensus mechanisms',
     *     location: 'Room 301, CS Building',
     *     geofence: { lat: 12.9716, lng: 77.5946, radius: 100 }
     * });
     */
    async createSession(options) {
        // Verify institution status
        if (!this.sdk.isInstitution() && !this.sdk.isRoot()) {
            throw new Error('Only verified institutions can create attendance sessions');
        }
        
        if (!options.title) {
            throw new Error('Session title is required');
        }
        
        const sessionId = this.sdk.generateId('sess');
        
        // Full session data (stored OFF-CHAIN)
        const sessionData = {
            id: sessionId,
            type: 'session',
            title: options.title,
            description: options.description || '',
            startTime: options.startTime || Date.now(),
            endTime: options.endTime || null,
            location: options.location || null,
            geofence: options.geofence || null,
            maxParticipants: options.maxParticipants || null,
            createdBy: this.sdk.nodeId,
            owner: this.sdk.nodeId, // For querying by owner
            createdAt: Date.now(),
            status: 'ACTIVE',
            attendeeCount: 0
        };
        
        // Store full data OFF-CHAIN
        await this.store.put(sessionId, sessionData);
        console.log(`💾 Session stored locally: ${sessionId}`, sessionData);
        
        // Hash for on-chain reference
        const dataHash = await this.sdk.hashData(sessionData);
        
        // Submit minimal proof ON-CHAIN
        // Include essential metadata so other nodes can see session details
        // Note: Geofence coordinates are included as they're public venue information
        const metadata = {
            title: options.title,
            description: options.description || '',
            startTime: sessionData.startTime,
            endTime: sessionData.endTime || null,
            location: options.location || null
        };
        
        // Include geofence if present (needed for location verification)
        if (options.geofence) {
            metadata.geofence = {
                lat: options.geofence.lat,
                lng: options.geofence.lng,
                radius: options.geofence.radius
            };
        }
        
        const success = await this.sdk.submitAppEvent(
            AttendanceApp.APP_ID,
            AttendanceApp.ACTIONS.SESSION_CREATE,
            {
                ref: sessionId,
                dataHash: dataHash,
                metadata: metadata
            }
        );
        
        if (!success) {
            // Rollback off-chain data
            await this.store.delete(sessionId);
            throw new Error('Failed to submit session to blockchain');
        }
        
        console.log(`✅ Session created: ${sessionId}`);
        return sessionId;
    }
    
    /**
     * End an attendance session
     * @param {string} sessionId - Session ID
     * @returns {Promise<boolean>}
     */
    async endSession(sessionId) {
        const session = await this.store.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }
        
        if (session.createdBy !== this.sdk.nodeId) {
            throw new Error('Only session creator can end it');
        }
        
        // Update off-chain data
        session.status = 'ENDED';
        session.endTime = Date.now();
        await this.store.put(sessionId, session);
        
        // Submit on-chain
        return await this.sdk.submitAppEvent(
            AttendanceApp.APP_ID,
            AttendanceApp.ACTIONS.SESSION_END,
            {
                ref: sessionId,
                metadata: {
                    endTime: session.endTime,
                    attendeeCount: session.attendeeCount
                }
            }
        );
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STUDENT REGISTRY
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Register a student ID for the current wallet address
     * @param {string} studentId - Student ID (e.g., "STU12345")
     * @returns {Promise<boolean>}
     */
    async registerStudent(studentId) {
        if (!studentId || typeof studentId !== 'string') {
            throw new Error('Valid student ID is required');
        }
        
        const walletAddress = this.sdk.nodeId;
        
        // Update local registry
        this.studentRegistry.set(walletAddress, studentId);
        await this._saveStudentRegistry();
        
        // Submit on-chain (optional - for cross-device sync)
        await this.sdk.submitAppEvent(
            AttendanceApp.APP_ID,
            AttendanceApp.ACTIONS.STUDENT_REGISTER,
            {
                studentId: studentId,
                walletAddress: walletAddress
            }
        );
        
        console.log(`✅ Student registered: ${studentId} -> ${walletAddress}`);
        return true;
    }
    
    /**
     * Get student ID for a wallet address
     * @param {string} [walletAddress] - Wallet address (defaults to current node)
     * @returns {string|null}
     */
    getStudentId(walletAddress = null) {
        const address = walletAddress || this.sdk.nodeId;
        return this.studentRegistry.get(address) || null;
    }
    
    /**
     * Get all registered students
     * @returns {Array<{walletAddress: string, studentId: string}>}
     */
    getAllStudents() {
        return Array.from(this.studentRegistry.entries()).map(([walletAddress, studentId]) => ({
            walletAddress,
            studentId
        }));
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // QR CODE GENERATION (Professors)
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Start generating dynamic QR codes for a session
     * @param {string} sessionId - Session ID
     * @param {Function} onQRUpdate - Callback when QR updates
     * @returns {Promise<AttendanceQRCode>}
     */
    async startQRGeneration(sessionId, onQRUpdate = null) {
        if (!this.sdk.isInstitution() && !this.sdk.isRoot()) {
            throw new Error('Only institutions can generate QR codes');
        }
        
        const session = await this.store.get(sessionId);
        if (!session || session.createdBy !== this.sdk.nodeId) {
            throw new Error('Session not found or you are not the creator');
        }
        
        // Try to get private key from SrishtiApp (main app context)
        let privateKey = null;
        const srishtiApp = window.SrishtiApp || window.srishtiAppInstance;
        if (srishtiApp && srishtiApp.keyPair && srishtiApp.keyPair.privateKey) {
            privateKey = srishtiApp.keyPair.privateKey;
        } else {
            // Try to get from localStorage and import
            const privateKeyBase64 = localStorage.getItem('srishti_private_key');
            if (privateKeyBase64 && window.SrishtiKeys) {
                try {
                    privateKey = await window.SrishtiKeys.importPrivateKey(privateKeyBase64);
                } catch (error) {
                    console.warn('Failed to import private key from localStorage:', error);
                }
            }
        }
        
        if (!privateKey) {
            throw new Error('Private key not available. Please ensure you are logged in with your institution account in the main blockchain app.');
        }
        
        // Load QR code module
        if (!window.SrishtiAttendanceQRCode) {
            throw new Error('AttendanceQRCode module not loaded');
        }
        
        const QRGenerator = window.SrishtiAttendanceQRCode;
        const qrGenerator = new QRGenerator({
            sessionId: sessionId,
            professorNodeId: this.sdk.nodeId,
            privateKey: privateKey,
            refreshInterval: 10000 // 10 seconds
        });
        
        // Start generating
        await qrGenerator.start(onQRUpdate);
        
        // Store generator
        this.qrGenerators.set(sessionId, qrGenerator);
        
        console.log(`✅ QR code generation started for session: ${sessionId}`);
        return qrGenerator;
    }
    
    /**
     * Stop generating QR codes for a session
     * @param {string} sessionId - Session ID
     */
    stopQRGeneration(sessionId) {
        const generator = this.qrGenerators.get(sessionId);
        if (generator) {
            generator.stop();
            this.qrGenerators.delete(sessionId);
            console.log(`✅ QR code generation stopped for session: ${sessionId}`);
        }
    }
    
    /**
     * Get current QR code for a session
     * @param {string} sessionId - Session ID
     * @returns {Object|null}
     */
    getCurrentQR(sessionId) {
        const generator = this.qrGenerators.get(sessionId);
        return generator ? generator.getCurrentQR() : null;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // ATTENDANCE MARKING (Students)
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Mark attendance for a session
     * 
     * @param {string} sessionId - Session ID
     * @param {Object} [options] - Attendance options
     * @param {Object} [options.location] - Current location (for geofencing)
     * @param {number} options.location.lat - Latitude
     * @param {number} options.location.lng - Longitude
     * @param {Object|string} [options.qrCode] - QR code data from scanner (JSON string or object)
     * @returns {Promise<string>} Attendance record ID
     * 
     * @example
     * // With QR code (recommended - prevents proxy attendance)
     * const qrData = await scanQRCode(); // From QR scanner
     * await app.markAttendance(sessionId, { qrCode: qrData });
     * 
     * // With geolocation (alternative)
     * navigator.geolocation.getCurrentPosition(async (pos) => {
     *     await app.markAttendance(sessionId, {
     *         location: { lat: pos.coords.latitude, lng: pos.coords.longitude }
     *     });
     * });
     */
    async markAttendance(sessionId, options = {}) {
        let session = await this.store.get(sessionId);
        
        // If session not found locally, try to get it from on-chain events
        if (!session) {
            const events = this.sdk.queryAppEvents(
                AttendanceApp.APP_ID,
                AttendanceApp.ACTIONS.SESSION_CREATE,
                { ref: sessionId }
            );
            
            if (events.length === 0) {
                throw new Error('Session not found');
            }
            
            // Reconstruct from on-chain event (same logic as getActiveSessions)
            const event = events[0];
            const metadata = event.payload?.metadata || {};
            session = {
                id: sessionId,
                type: 'session',
                title: metadata.title || 'Untitled Session',
                description: metadata.description || '',
                startTime: metadata.startTime || event.timestamp,
                endTime: metadata.endTime || null,
                location: metadata.location || null,
                geofence: metadata.geofence ? {
                    lat: metadata.geofence.lat,
                    lng: metadata.geofence.lng,
                    radius: metadata.geofence.radius
                } : null,
                createdBy: event.sender,
                owner: event.sender, // For querying by owner
                createdAt: event.timestamp,
                status: 'ACTIVE',
                attendeeCount: 0,
                _reconstructed: true
            };
            
            // Store it for future use
            await this.store.put(sessionId, session);
            console.log(`📥 Loaded session from on-chain for attendance: ${session.title}`);
        }
        
        // Check if session is still active
        if (session.status === 'ENDED') {
            throw new Error('Session has ended');
        }
        
        if (session.endTime && Date.now() > session.endTime) {
            throw new Error('Session time has passed');
        }
        
        // Check if already marked
        const recordId = `${sessionId}_${this.sdk.nodeId}`;
        const existing = await this.store.get(recordId);
        if (existing) {
            throw new Error('Attendance already marked for this session');
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // QR CODE VERIFICATION (Primary method - prevents proxy attendance)
        // ═══════════════════════════════════════════════════════════════════
        let qrProof = null;
        if (options.qrCode) {
            // Parse QR code if string
            let qrData = typeof options.qrCode === 'string' 
                ? window.SrishtiAttendanceQRCode?.parseQR(options.qrCode)
                : options.qrCode;
            
            if (!qrData) {
                throw new Error('Invalid QR code data');
            }
            
            // Verify QR code
            if (!window.SrishtiAttendanceQRCode) {
                throw new Error('AttendanceQRCode module not loaded');
            }
            
            const verification = await window.SrishtiAttendanceQRCode.verifyQR(
                qrData,
                this.sdk.chain,
                30000 // 30 second max age
            );
            
            if (!verification.valid) {
                throw new Error(`QR code verification failed: ${verification.error}`);
            }
            
            // Verify QR is for this session
            if (qrData.sessionId !== sessionId) {
                throw new Error('QR code is for a different session');
            }
            
            // Verify QR is from session creator
            if (qrData.professorNodeId !== session.createdBy) {
                throw new Error('QR code is not from the session creator');
            }
            
            qrProof = {
                timestamp: qrData.timestamp,
                nonce: qrData.nonce,
                signature: qrData.signature
            };
            
            console.log('✅ QR code verified successfully');
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // GEOFENCE VERIFICATION (Alternative/Additional method)
        // ═══════════════════════════════════════════════════════════════════
        let distanceFromVenue = null;
        if (session.geofence && options.location) {
            // Ensure we have full geofence data
            if (!session.geofence.lat || !session.geofence.lng) {
                throw new Error('Session geofence data is incomplete. Cannot verify location.');
            }
            
            distanceFromVenue = this._calculateDistance(options.location, session.geofence);
            
            if (distanceFromVenue > session.geofence.radius) {
                throw new Error(
                    `You are ${Math.round(distanceFromVenue)}m away from the venue. ` +
                    `Must be within ${session.geofence.radius}m to mark attendance.`
                );
            }
        } else if (session.geofence && !options.location && !qrProof) {
            throw new Error('Use the QR code to mark attendance, or enable location in your browser and try again.');
        }
        
        if (!qrProof && !options.location) {
            throw new Error('Scan the QR code (recommended) or enable location to mark attendance.');
        }
        
        // Get student ID if registered
        const studentId = this.getStudentId() || this.sdk.nodeId;
        
        // Get node name from chain (for metadata and local record)
        let nodeName = null;
        if (this.sdk.chain) {
            try {
                const nodes = this.sdk.chain.buildNodeMap();
                const node = nodes[this.sdk.nodeId];
                if (node && node.name) {
                    nodeName = node.name;
                    console.log(`📝 [markAttendance] Found node name from chain: ${nodeName} for ${this.sdk.nodeId}`);
                } else {
                    // Also check institutions
                    const institutions = this.sdk.chain.getInstitutions();
                    const institution = institutions.verified?.[this.sdk.nodeId];
                    if (institution && institution.name) {
                        nodeName = institution.name;
                        console.log(`📝 [markAttendance] Found institution name from chain: ${nodeName} for ${this.sdk.nodeId}`);
                    }
                }
            } catch (error) {
                console.warn(`⚠️ [markAttendance] Error getting node name from chain:`, error);
            }
        }
        
        // Full attendance data (OFF-CHAIN)
        const attendanceData = {
            id: recordId,
            type: 'attendance',
            sessionId: sessionId,
            studentId: studentId, // Use registered student ID if available
            walletAddress: this.sdk.nodeId,
            nodeName: nodeName || null, // Node name from chain
            timestamp: Date.now(),
            location: options.location || null,
            distanceFromVenue: distanceFromVenue,
            qrProof: qrProof, // QR code proof (prevents proxy attendance)
            status: AttendanceApp.STATUS.PENDING,
            owner: this.sdk.nodeId
        };
        
        // Store off-chain
        await this.store.put(recordId, attendanceData);
        
        // Update session attendee count
        session.attendeeCount = (session.attendeeCount || 0) + 1;
        await this.store.put(sessionId, session);
        
        // Hash for verification
        const dataHash = await this.sdk.hashData(attendanceData);
        
        // Submit proof ON-CHAIN with essential metadata (so institution can see it)
        console.log(`📤 [markAttendance] Submitting attendance event for session: ${sessionId}, student: ${studentId}`);
        console.log(`📤 [markAttendance] App ID: ${AttendanceApp.APP_ID}, Action: ${AttendanceApp.ACTIONS.MARK_PRESENT}`);
        const success = await this.sdk.submitAppEvent(
            AttendanceApp.APP_ID,
            AttendanceApp.ACTIONS.MARK_PRESENT,
            {
                ref: sessionId,
                target: this.sdk.nodeId,
                dataHash: dataHash,
                // Include essential metadata so institution can reconstruct the record
                metadata: {
                    studentId: studentId, // Registered student ID
                    nodeName: nodeName, // Node name
                    timestamp: attendanceData.timestamp,
                    hasLocation: !!options.location,
                    hasQRProof: !!qrProof,
                    distanceFromVenue: distanceFromVenue,
                    qrProofTimestamp: qrProof?.timestamp || null
                }
            }
        );
        
        if (!success) {
            console.error(`❌ [markAttendance] Failed to submit attendance event to blockchain`);
            // Rollback
            await this.store.delete(recordId);
            session.attendeeCount--;
            await this.store.put(sessionId, session);
            throw new Error('Failed to submit attendance to blockchain');
        }
        
        console.log(`✅ [markAttendance] Attendance marked and submitted to blockchain: ${recordId}`);
        console.log(`✅ [markAttendance] Event should be visible to institution after chain sync`);
        return recordId;
    }
    
    /**
     * Calculate distance between two coordinates (Haversine formula)
     * @private
     */
    _calculateDistance(point1, point2) {
        const R = 6371000; // Earth's radius in meters
        const lat1 = point1.lat * Math.PI / 180;
        const lat2 = point2.lat * Math.PI / 180;
        const dLat = (point2.lat - point1.lat) * Math.PI / 180;
        const dLng = (point2.lng - point1.lng) * Math.PI / 180;
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        return R * c;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // VERIFICATION (Institution only)
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Verify a student's attendance
     * 
     * @param {string} sessionId - Session ID
     * @param {string} studentId - Student's node ID
     * @param {boolean} [approved=true] - Approve or reject
     * @param {string} [reason] - Reason for rejection
     * @returns {Promise<boolean>}
     */
    async verifyAttendance(sessionId, studentNodeId, approved = true, reason = null) {
        console.log(`🔍 [verifyAttendance] Verifying attendance for session: ${sessionId}, student node: ${studentNodeId}, approved: ${approved}`);
        
        const session = await this.store.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }
        
        if (session.createdBy !== this.sdk.nodeId) {
            throw new Error('Only session creator can verify attendance');
        }
        
        // Record ID is created as ${sessionId}_${nodeId} where nodeId is the wallet address
        const recordId = `${sessionId}_${studentNodeId}`;
        console.log(`🔍 [verifyAttendance] Looking for record: ${recordId}`);
        
        let record = await this.store.get(recordId);
        
        // If record not found locally, try to reconstruct from on-chain events
        if (!record) {
            console.log(`⚠️ [verifyAttendance] Record not found locally, checking on-chain events...`);
            const markEvents = this.sdk.queryAppEvents(
                AttendanceApp.APP_ID,
                AttendanceApp.ACTIONS.MARK_PRESENT,
                { ref: sessionId, target: studentNodeId }
            );
            
            if (markEvents.length === 0) {
                throw new Error(`Attendance record not found for node ${studentNodeId}`);
            }
            
            // Reconstruct record from on-chain event (same logic as getSessionAttendees)
            const event = markEvents[0];
            const metadata = event.payload.metadata || {};
            
            // Get node name from chain
            let nodeName = null;
            if (this.sdk.chain) {
                const nodes = this.sdk.chain.buildNodeMap();
                const node = nodes[studentNodeId];
                if (node && node.name) {
                    nodeName = node.name;
                }
            }
            
            record = {
                id: recordId,
                type: 'attendance',
                sessionId: sessionId,
                studentId: metadata.studentId || studentNodeId,
                walletAddress: studentNodeId,
                nodeName: nodeName || metadata.nodeName || null,
                timestamp: metadata.timestamp || event.timestamp,
                status: AttendanceApp.STATUS.PENDING,
                owner: studentNodeId,
                _reconstructed: true
            };
            
            console.log(`📥 [verifyAttendance] Reconstructed record from on-chain: ${record.studentId || record.walletAddress}`);
        }
        
        // Update off-chain record
        record.status = approved ? AttendanceApp.STATUS.VERIFIED : AttendanceApp.STATUS.REJECTED;
        record.verifiedBy = this.sdk.nodeId;
        record.verifiedAt = Date.now();
        record.rejectionReason = approved ? null : reason;
        await this.store.put(recordId, record);
        console.log(`✅ [verifyAttendance] Updated local record status to: ${record.status}`);
        
        // Submit verification ON-CHAIN
        console.log(`📤 [verifyAttendance] Submitting verification event to blockchain...`);
        const success = await this.sdk.submitAppEvent(
            AttendanceApp.APP_ID,
            AttendanceApp.ACTIONS.VERIFY,
            {
                ref: sessionId,
                target: studentNodeId, // Use node ID (wallet address) as target
                metadata: { verified: approved }
            }
        );
        
        if (!success) {
            console.error(`❌ [verifyAttendance] Failed to submit verification event to blockchain`);
            // Rollback local update
            record.status = AttendanceApp.STATUS.PENDING;
            await this.store.put(recordId, record);
            throw new Error('Failed to submit verification to blockchain');
        }
        
        console.log(`✅ [verifyAttendance] Verification submitted successfully`);
        return success;
    }
    
    /**
     * Bulk verify all pending attendance for a session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Array>} Results
     */
    async bulkVerifyAll(sessionId) {
        const attendees = await this.getSessionAttendees(sessionId);
        const pending = attendees.filter(a => a.status === AttendanceApp.STATUS.PENDING);
        
        console.log(`🔍 [bulkVerifyAll] Found ${pending.length} pending attendees to verify`);
        
        const results = [];
        for (const attendee of pending) {
            try {
                // Use walletAddress (node ID) not studentId (registered ID) for verification
                // The record ID is created as ${sessionId}_${nodeId}, so we need the node ID
                const nodeId = attendee.walletAddress || attendee.owner || attendee.studentId;
                console.log(`✅ [bulkVerifyAll] Verifying attendance for node: ${nodeId} (student: ${attendee.studentId})`);
                
                const success = await this.verifyAttendance(sessionId, nodeId, true);
                results.push({ 
                    studentId: attendee.studentId, 
                    nodeId: nodeId,
                    nodeName: attendee.nodeName,
                    success: success 
                });
                console.log(`✅ [bulkVerifyAll] Successfully verified: ${attendee.nodeName || nodeId}`);
            } catch (error) {
                console.error(`❌ [bulkVerifyAll] Failed to verify ${attendee.studentId}:`, error);
                results.push({ 
                    studentId: attendee.studentId, 
                    nodeId: attendee.walletAddress || attendee.owner,
                    nodeName: attendee.nodeName,
                    success: false, 
                    error: error.message 
                });
            }
        }
        
        console.log(`📊 [bulkVerifyAll] Verification complete: ${results.filter(r => r.success).length}/${results.length} successful`);
        return results;
    }
    
    /**
     * Issue attendance certificate (soulbound token)
     * Uses the blockchain's native SOULBOUND_MINT event
     * 
     * @param {string} sessionId - Session ID
     * @param {string} studentId - Student's node ID
     * @param {Object} [options] - Certificate options
     * @returns {Promise<boolean>}
     */
    async issueCertificate(sessionId, studentId, options = {}) {
        if (!this.sdk.isInstitution() && !this.sdk.isRoot()) {
            throw new Error('Only institutions can issue certificates');
        }
        
        const session = await this.store.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }
        
        const recordId = `${sessionId}_${studentId}`;
        const record = await this.store.get(recordId);
        if (!record || record.status !== AttendanceApp.STATUS.VERIFIED) {
            throw new Error('Student attendance not verified');
        }
        
        // Create soulbound mint event through blockchain directly
        // This uses the core blockchain's SOULBOUND_MINT, not an app event
        const event = window.SrishtiEvent.createSoulboundMint({
            issuerId: this.sdk.nodeId,
            recipientId: studentId,
            achievementId: `ATTENDANCE_${sessionId}`,
            title: options.title || `Attendance: ${session.title}`,
            description: options.description || `Certificate of attendance for ${session.title}`,
            metadata: {
                sessionId: sessionId,
                sessionTitle: session.title,
                attendedAt: record.timestamp,
                verifiedAt: record.verifiedAt,
                appType: 'ATTENDANCE',
                appId: AttendanceApp.APP_ID
            }
        });
        
        // Submit as block
        const latestBlock = this.sdk.chain.getLatestBlock();
        const block = new window.SrishtiBlock({
            index: this.sdk.chain.getLength(),
            previousHash: latestBlock.hash,
            data: event,
            proposer: this.sdk.nodeId,
            participationProof: { nodeId: this.sdk.nodeId, score: 0.5, timestamp: Date.now() }
        });
        
        await block.computeHash();
        return await this.sdk.network.proposeBlock(block);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // QUERIES
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Get sessions created by current user only (not sessions by others in the store).
     * @returns {Promise<Array>}
     */
    async getMySessions() {
        if (!this.sdk.nodeId) {
            console.warn('📋 getMySessions: No nodeId, returning empty');
            return [];
        }
        const sessions = await this.store.query('owner', this.sdk.nodeId);
        // Only sessions I created: must have valid id and createdBy/owner must be me
        const valid = sessions.filter(s => {
            if (!s || !s.id) return false;
            const createdByMe = s.createdBy === this.sdk.nodeId || s.owner === this.sdk.nodeId;
            if (!createdByMe) return false;
            return true;
        });
        if (valid.length !== sessions.length) {
            const removed = sessions.length - valid.length;
            console.warn(`📋 getMySessions: Excluded ${removed} session(s) (missing id or not created by you)`);
            try {
                await this.store.delete(undefined);
            } catch (e) {}
        }
        valid.forEach(s => {
            if (s.title === undefined || s.title === null) s.title = 'Untitled Session';
        });
        console.log(`📋 getMySessions: Found ${valid.length} session(s) created by you (${this.sdk.nodeId})`);
        return valid;
    }
    
    /**
     * Get a specific session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object|null>}
     */
    async getSession(sessionId) {
        return await this.store.get(sessionId);
    }
    
    /**
     * Get all active sessions (from on-chain events)
     * Combines on-chain proofs with off-chain data
     * If off-chain data is missing, reconstructs from on-chain metadata
     * @returns {Promise<Array>}
     */
    async getActiveSessions() {
        // Debug: help diagnose "student doesn't see sessions" (chain sync / query)
        const chainLength = this.sdk.chain ? this.sdk.chain.getLength() : 0;
        const allAppEvents = this.sdk.chain
            ? this.sdk.chain.getEvents('APP_EVENT').filter(e => e.appId === AttendanceApp.APP_ID)
            : [];
        const events = this.sdk.queryAppEvents(
            AttendanceApp.APP_ID,
            AttendanceApp.ACTIONS.SESSION_CREATE
        );
        console.log(`📋 [getActiveSessions] Chain length: ${chainLength}, ${AttendanceApp.APP_ID} APP_EVENTs: ${allAppEvents.length}, SESSION_CREATE: ${events.length}`);
        if (events.length === 0 && allAppEvents.length === 0 && chainLength > 0) {
            console.warn('⚠️ [getActiveSessions] No attendance events on chain. If you created sessions as institution, wait for chain sync (10–20s) then refresh.');
        }
        
        const sessions = [];
        for (const event of events) {
            const ref = event.payload?.ref;
            if (!ref) {
                console.warn('⚠️ [getActiveSessions] Skipping SESSION_CREATE event with missing ref');
                continue;
            }
            let session = await this.store.get(ref);
            
            // If session not in local store, reconstruct from on-chain event metadata
            if (!session) {
                const metadata = event.payload?.metadata || {};
                session = {
                    id: ref,
                    type: 'session',
                    title: metadata.title || 'Untitled Session',
                    description: metadata.description || '',
                    startTime: metadata.startTime || event.timestamp,
                    endTime: metadata.endTime || null,
                    location: metadata.location || null,
                    geofence: metadata.geofence ? {
                        lat: metadata.geofence.lat,
                        lng: metadata.geofence.lng,
                        radius: metadata.geofence.radius
                    } : null,
                    createdBy: event.sender,
                    owner: event.sender,
                    createdAt: event.timestamp,
                    status: 'ACTIVE',
                    attendeeCount: 0,
                    _reconstructed: true,
                    _dataHash: event.payload?.dataHash
                };
                await this.store.put(ref, session);
                console.log(`📥 Reconstructed session from on-chain: ${session.title} (${session.id})`);
                console.log(`   Created by: ${event.sender}, Start: ${new Date(session.startTime).toLocaleString()}`);
                if (session.geofence) {
                    console.log(`   Location: ${session.location || 'Geofenced area'} (${session.geofence.radius}m radius)`);
                }
            }
            
            // Check if session is still active
            const isActive = session.status === 'ACTIVE' && 
                           (!session.endTime || Date.now() < session.endTime);
            
            if (isActive) {
                sessions.push(session);
            }
        }
        
        return sessions;
    }
    
    /**
     * Get all sessions (from on-chain)
     * Reconstructs from on-chain events if not in local store
     * @returns {Promise<Array>}
     */
    async getAllSessions() {
        const events = this.sdk.queryAppEvents(
            AttendanceApp.APP_ID,
            AttendanceApp.ACTIONS.SESSION_CREATE
        );
        
        const sessions = [];
        for (const event of events) {
            const ref = event.payload?.ref;
            if (!ref) {
                console.warn('⚠️ [getAllSessions] Skipping SESSION_CREATE event with missing ref');
                continue;
            }
            let session = await this.store.get(ref);
            
            if (!session) {
                const metadata = event.payload?.metadata || {};
                session = {
                    id: ref,
                    type: 'session',
                    title: metadata.title || 'Untitled Session',
                    description: metadata.description || '',
                    startTime: metadata.startTime || event.timestamp,
                    endTime: metadata.endTime || null,
                    location: metadata.location || null,
                    geofence: metadata.geofence ? {
                        lat: metadata.geofence.lat,
                        lng: metadata.geofence.lng,
                        radius: metadata.geofence.radius
                    } : null,
                    createdBy: event.sender,
                    owner: event.sender,
                    createdAt: event.timestamp,
                    status: 'ACTIVE',
                    attendeeCount: 0,
                    _reconstructed: true
                };
                await this.store.put(ref, session);
            }
            
            sessions.push(session);
        }
        
        return sessions;
    }
    
    /**
     * Get attendees for a session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Array>}
     */
    async getSessionAttendees(sessionId) {
        // Query on-chain attendance events for this session
        const events = this.sdk.queryAppEvents(
            AttendanceApp.APP_ID,
            AttendanceApp.ACTIONS.MARK_PRESENT,
            { ref: sessionId }
        );
        
        console.log(`🔍 [getSessionAttendees] Querying for sessionId: ${sessionId}`);
        console.log(`🔍 [getSessionAttendees] Found ${events.length} MARK_PRESENT events`);
        if (events.length > 0) {
            console.log('🔍 [getSessionAttendees] Sample event:', {
                appId: events[0].appId,
                action: events[0].action,
                ref: events[0].payload?.ref,
                target: events[0].payload?.target,
                metadata: events[0].payload?.metadata
            });
        }
        
        const attendees = [];
        for (const event of events) {
            // Validate event structure
            if (!event.payload || !event.payload.target) {
                console.warn(`⚠️ [getSessionAttendees] Event missing payload or target:`, event);
                continue;
            }
            
            const recordId = `${sessionId}_${event.payload.target}`;
            let record = await this.store.get(recordId);
            
            // If record not found locally, reconstruct from on-chain event
            if (!record) {
                const metadata = event.payload.metadata || {};
                
                // Always get node name from chain (more reliable than metadata)
                let nodeName = null;
                if (this.sdk.chain) {
                    try {
                        const nodes = this.sdk.chain.buildNodeMap();
                        const node = nodes[event.payload.target];
                        if (node && node.name) {
                            nodeName = node.name;
                            console.log(`📝 [getSessionAttendees] Found node name from chain: ${nodeName} for ${event.payload.target}`);
                        } else {
                            console.warn(`⚠️ [getSessionAttendees] Node not found in chain map: ${event.payload.target}`);
                        }
                    } catch (error) {
                        console.warn(`⚠️ [getSessionAttendees] Error getting node name from chain:`, error);
                    }
                }
                
                // Fallback to metadata if chain lookup failed
                if (!nodeName && metadata.nodeName) {
                    nodeName = metadata.nodeName;
                }
                
                record = {
                    id: recordId,
                    type: 'attendance',
                    sessionId: sessionId,
                    studentId: metadata.studentId || event.payload.target, // Registered student ID
                    walletAddress: event.payload.target, // Node ID / wallet address
                    nodeName: nodeName || null, // Node name from chain (preferred) or metadata
                    timestamp: metadata.timestamp || event.timestamp,
                    location: metadata.hasLocation ? { provided: true } : null,
                    distanceFromVenue: metadata.distanceFromVenue || null,
                    qrProof: metadata.hasQRProof ? { timestamp: metadata.qrProofTimestamp } : null,
                    status: AttendanceApp.STATUS.PENDING,
                    owner: event.payload.target,
                    _reconstructed: true // Mark as reconstructed from chain
                };
                
                // Store it locally for future use
                await this.store.put(recordId, record);
                console.log(`📥 [getSessionAttendees] Reconstructed attendance record: ${record.nodeName || 'Unknown'} (${record.studentId || record.walletAddress})`);
            } else {
                // Always ensure existing records have node name from chain (update if missing or different)
                if (this.sdk.chain) {
                    try {
                        const nodes = this.sdk.chain.buildNodeMap();
                        const nodeId = record.walletAddress || record.owner || event.payload.target;
                        const node = nodes[nodeId];
                        if (node && node.name) {
                            const chainNodeName = node.name;
                            if (!record.nodeName || record.nodeName !== chainNodeName) {
                                record.nodeName = chainNodeName;
                                await this.store.put(recordId, record);
                                console.log(`🔄 [getSessionAttendees] Updated node name from chain: ${chainNodeName} for ${nodeId}`);
                            }
                        }
                    } catch (error) {
                        console.warn(`⚠️ [getSessionAttendees] Error updating node name from chain:`, error);
                    }
                }
                console.log(`📋 [getSessionAttendees] Found existing local record: ${record.nodeName || 'Unknown'} (${record.studentId || record.walletAddress})`);
            }
            
            // Get verification status from on-chain events
            const verifyEvents = this.sdk.queryAppEvents(
                AttendanceApp.APP_ID,
                AttendanceApp.ACTIONS.VERIFY,
                { ref: sessionId, target: event.payload.target }
            );
            
            if (verifyEvents.length > 0) {
                const latest = verifyEvents[verifyEvents.length - 1];
                record.status = latest.payload.metadata?.verified 
                    ? AttendanceApp.STATUS.VERIFIED 
                    : AttendanceApp.STATUS.REJECTED;
                record.verifiedBy = latest.sender;
                record.verifiedAt = latest.timestamp;
                
                // Update local record if it exists
                if (!record._reconstructed) {
                    await this.store.put(recordId, record);
                }
            }
            
            console.log(`✅ [getSessionAttendees] Adding attendee: ${record.studentId || record.walletAddress}, status: ${record.status}`);
            attendees.push(record);
        }
        
        console.log(`📊 [getSessionAttendees] Total attendees found: ${attendees.length}`);
        return attendees;
    }
    
    /**
     * Get my attendance for a specific session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object|null>}
     */
    async getMyAttendance(sessionId) {
        const recordId = `${sessionId}_${this.sdk.nodeId}`;
        let record = await this.store.get(recordId);
        
        // Always check for verification events from blockchain (even if we have local record)
        const verifyEvents = this.sdk.queryAppEvents(
            AttendanceApp.APP_ID,
            AttendanceApp.ACTIONS.VERIFY,
            { ref: sessionId, target: this.sdk.nodeId }
        );
        
        if (verifyEvents.length > 0) {
            const latest = verifyEvents[verifyEvents.length - 1];
            const verified = latest.payload.metadata?.verified;
            
            if (record) {
                // Update local record with verification status
                record.status = verified 
                    ? AttendanceApp.STATUS.VERIFIED 
                    : AttendanceApp.STATUS.REJECTED;
                record.verifiedBy = latest.sender;
                record.verifiedAt = latest.timestamp;
                await this.store.put(recordId, record);
                console.log(`🔄 [getMyAttendance] Updated verification status from blockchain: ${record.status}`);
            } else {
                // If no local record, reconstruct from on-chain events
                const markEvents = this.sdk.queryAppEvents(
                    AttendanceApp.APP_ID,
                    AttendanceApp.ACTIONS.MARK_PRESENT,
                    { ref: sessionId, target: this.sdk.nodeId }
                );
                
                if (markEvents.length > 0) {
                    const event = markEvents[0];
                    const metadata = event.payload.metadata || {};
                    
                    // Get node name from chain
                    let nodeName = null;
                    if (this.sdk.chain) {
                        const nodes = this.sdk.chain.buildNodeMap();
                        const node = nodes[this.sdk.nodeId];
                        if (node && node.name) {
                            nodeName = node.name;
                        }
                    }
                    
                    record = {
                        id: recordId,
                        type: 'attendance',
                        sessionId: sessionId,
                        studentId: metadata.studentId || this.sdk.nodeId,
                        walletAddress: this.sdk.nodeId,
                        nodeName: nodeName || metadata.nodeName || null,
                        timestamp: metadata.timestamp || event.timestamp,
                        status: verified ? AttendanceApp.STATUS.VERIFIED : AttendanceApp.STATUS.REJECTED,
                        verifiedBy: latest.sender,
                        verifiedAt: latest.timestamp,
                        owner: this.sdk.nodeId,
                        _reconstructed: true
                    };
                    
                    await this.store.put(recordId, record);
                    console.log(`📥 [getMyAttendance] Reconstructed record with verification status: ${record.status}`);
                }
            }
        }
        
        return record;
    }
    
    /**
     * Get my attendance history (all sessions I attended)
     * @returns {Promise<Array>}
     */
    async getMyAttendanceHistory() {
        const events = this.sdk.queryAppEvents(
            AttendanceApp.APP_ID,
            AttendanceApp.ACTIONS.MARK_PRESENT,
            { target: this.sdk.nodeId }
        );
        
        const history = [];
        for (const event of events) {
            const sessionId = event.payload.ref;
            const recordId = `${sessionId}_${this.sdk.nodeId}`;
            let record = await this.store.get(recordId);
            const session = await this.store.get(sessionId);
            
            // Check for verification events from blockchain
            const verifyEvents = this.sdk.queryAppEvents(
                AttendanceApp.APP_ID,
                AttendanceApp.ACTIONS.VERIFY,
                { ref: sessionId, target: this.sdk.nodeId }
            );
            
            if (verifyEvents.length > 0) {
                const latest = verifyEvents[verifyEvents.length - 1];
                const verified = latest.payload.metadata?.verified;
                
                if (record) {
                    // Update local record with verification status
                    record.status = verified 
                        ? AttendanceApp.STATUS.VERIFIED 
                        : AttendanceApp.STATUS.REJECTED;
                    record.verifiedBy = latest.sender;
                    record.verifiedAt = latest.timestamp;
                    await this.store.put(recordId, record);
                    console.log(`🔄 [getMyAttendanceHistory] Updated verification status for ${sessionId}: ${record.status}`);
                } else {
                    // Reconstruct record if not found locally
                    const metadata = event.payload.metadata || {};
                    
                    // Get node name from chain
                    let nodeName = null;
                    if (this.sdk.chain) {
                        const nodes = this.sdk.chain.buildNodeMap();
                        const node = nodes[this.sdk.nodeId];
                        if (node && node.name) {
                            nodeName = node.name;
                        }
                    }
                    
                    record = {
                        id: recordId,
                        type: 'attendance',
                        sessionId: sessionId,
                        studentId: metadata.studentId || this.sdk.nodeId,
                        walletAddress: this.sdk.nodeId,
                        nodeName: nodeName || metadata.nodeName || null,
                        timestamp: metadata.timestamp || event.timestamp,
                        status: verified ? AttendanceApp.STATUS.VERIFIED : AttendanceApp.STATUS.REJECTED,
                        verifiedBy: latest.sender,
                        verifiedAt: latest.timestamp,
                        owner: this.sdk.nodeId,
                        _reconstructed: true
                    };
                    
                    await this.store.put(recordId, record);
                    console.log(`📥 [getMyAttendanceHistory] Reconstructed record with verification: ${record.status}`);
                }
            }
            
            if (record) {
                history.push({
                    ...record,
                    sessionTitle: session?.title || 'Unknown Session',
                    sessionCreator: session?.createdBy || 'Unknown'
                });
            }
        }
        
        return history;
    }
    
    /**
     * Get my attendance certificates
     * @returns {Array}
     */
    getMyAttendanceCertificates() {
        return this.sdk.chain.getSoulboundTokens(this.sdk.nodeId)
            .filter(token => token.metadata?.appType === 'ATTENDANCE');
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STATISTICS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Get attendance statistics for a session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>}
     */
    async getSessionStats(sessionId) {
        const attendees = await this.getSessionAttendees(sessionId);
        
        return {
            total: attendees.length,
            verified: attendees.filter(a => a.status === AttendanceApp.STATUS.VERIFIED).length,
            pending: attendees.filter(a => a.status === AttendanceApp.STATUS.PENDING).length,
            rejected: attendees.filter(a => a.status === AttendanceApp.STATUS.REJECTED).length
        };
    }
    
    /**
     * Get my attendance statistics
     * @returns {Promise<Object>}
     */
    async getMyStats() {
        const history = await this.getMyAttendanceHistory();
        
        return {
            total: history.length,
            verified: history.filter(a => a.status === AttendanceApp.STATUS.VERIFIED).length,
            pending: history.filter(a => a.status === AttendanceApp.STATUS.PENDING).length,
            rejected: history.filter(a => a.status === AttendanceApp.STATUS.REJECTED).length,
            certificates: this.getMyAttendanceCertificates().length
        };
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AttendanceApp;
} else {
    window.SrishtiAttendanceApp = AttendanceApp;
}
