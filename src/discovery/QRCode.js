/**
 * Srishti Blockchain - QR Code Discovery
 * 
 * Generates QR codes with connection information for peer discovery.
 * QR codes contain WebRTC offer and node information.
 */

class QRCodeDiscovery {
    /**
     * Create a new QR code discovery instance
     * @param {Object} options
     * @param {string} options.nodeId - Node ID
     * @param {string} options.publicKeyBase64 - Public key (base64)
     */
    constructor(options = {}) {
        this.nodeId = options.nodeId || null;
        this.publicKeyBase64 = options.publicKeyBase64 || null;
    }
    
    /**
     * Initialize with node info
     * @param {string} nodeId
     * @param {string} publicKeyBase64
     */
    init(nodeId, publicKeyBase64) {
        this.nodeId = nodeId;
        this.publicKeyBase64 = publicKeyBase64;
    }
    
    /**
     * Generate connection info for QR code
     * @param {Object} options
     * @param {string} options.webRTCOffer - WebRTC offer SDP (optional, for later use)
     * @returns {Object} Connection info
     */
    generateConnectionInfo(options = {}) {
        if (!this.nodeId) {
            throw new Error('Node ID not set');
        }
        
        return {
            nodeId: this.nodeId,
            publicKey: this.publicKeyBase64,
            timestamp: Date.now(),
            offer: options.webRTCOffer || null // Will be added when connection is initiated
        };
    }
    
    /**
     * Generate QR code data (JSON string)
     * @param {Object} connectionInfo - Connection info
     * @returns {string} - JSON string for QR code
     */
    generateQRData(connectionInfo = null) {
        const info = connectionInfo || this.generateConnectionInfo();
        
        // SIMPLIFIED: Only include nodeId for smaller QR code
        // Public key can be retrieved via signaling server when connecting
        const qrData = {
            t: 's',  // type: srishti (shortened)
            n: info.nodeId  // nodeId (shortened key)
        };
        
        return JSON.stringify(qrData);
    }
    
    /**
     * Generate QR code URL (for sharing)
     * @param {Object} connectionInfo - Connection info
     * @returns {string} - URL with encoded connection info
     */
    generateQRUrl(connectionInfo = null) {
        // Use simplified format: just the nodeId in URL
        const info = connectionInfo || this.generateConnectionInfo();
        
        // Create URL with just nodeId (much shorter = simpler QR)
        const baseUrl = window.location.origin + window.location.pathname;
        return `${baseUrl}?join=${info.nodeId}`;
    }
    
    /**
     * Parse QR code data from URL parameter
     * @param {string} encodedData - nodeId directly or base64 encoded data from URL
     * @returns {Object|null} - Parsed connection info
     */
    static parseFromUrl(encodedData) {
        try {
            // New simplified format: just nodeId directly
            if (encodedData.startsWith('node_')) {
                return {
                    nodeId: encodedData,
                    publicKey: null,  // Will be fetched via signaling
                    timestamp: Date.now()
                };
            }
            
            // Legacy format: base64 encoded JSON
            const decoded = atob(encodedData);
            const data = JSON.parse(decoded);
            
            // Handle new compact format
            if (data.t === 's' && data.n) {
                return {
                    nodeId: data.n,
                    publicKey: null,
                    timestamp: Date.now()
                };
            }
            
            // Handle old format
            if (data.type === 'srishti-invite' && data.nodeId) {
                return {
                    nodeId: data.nodeId,
                    publicKey: data.publicKey,
                    timestamp: data.timestamp
                };
            }
            
            return null;
        } catch (error) {
            console.error('Failed to parse QR data:', error);
            return null;
        }
    }
    
    /**
     * Parse QR code data from JSON string
     * @param {string} jsonString - JSON string from QR code
     * @returns {Object|null} - Parsed connection info
     */
    static parseFromJSON(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            
            // Handle new compact format
            if (data.t === 's' && data.n) {
                return {
                    nodeId: data.n,
                    publicKey: null,
                    timestamp: Date.now()
                };
            }
            
            // Handle old format
            if (data.type === 'srishti-invite' && data.nodeId) {
                return {
                    nodeId: data.nodeId,
                    publicKey: data.publicKey,
                    timestamp: data.timestamp
                };
            }
            
            return null;
        } catch (error) {
            console.error('Failed to parse QR data:', error);
            return null;
        }
    }
    
    /**
     * Validate connection info
     * @param {Object} connectionInfo - Connection info
     * @returns {boolean}
     */
    static validate(connectionInfo) {
        if (!connectionInfo || !connectionInfo.nodeId) {
            return false;
        }
        
        // Check timestamp (QR codes expire after 24 hours for security)
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        if (connectionInfo.timestamp && Date.now() - connectionInfo.timestamp > maxAge) {
            console.warn('QR code expired');
            // Still allow it, but log warning
        }
        
        return true;
    }
    
    /**
     * Generate QR code and display in container
     * @param {string} containerId - DOM element ID
     * @param {Object} options - QR code options
     * @returns {Promise<HTMLElement>}
     */
    async generateQR(containerId, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('QR container not found:', containerId);
            return null;
        }
        
        const qrData = this.generateQRData();
        const qrUrl = this.generateQRUrl();
        
        // Clear previous QR
        container.innerHTML = '';
        
        // Default options
        const defaultOptions = {
            width: 200,
            height: 200,
            type: 'canvas',
            data: qrUrl, // Use URL format for QR
            dotsOptions: {
                color: '#FFD700',
                type: 'rounded'
            },
            backgroundOptions: {
                color: 'transparent'
            },
            cornersSquareOptions: {
                color: '#FFD700',
                type: 'extra-rounded'
            },
            cornersDotOptions: {
                color: '#FFFFFF',
                type: 'dot'
            }
        };
        
        const mergedOptions = { ...defaultOptions, ...options };
        
        // Try to use QRCodeStyling if available
        if (typeof QRCodeStyling !== 'undefined') {
            const qrCode = new QRCodeStyling(mergedOptions);
            qrCode.append(container);
            return container;
        }
        
        // Fallback to basic QRCode library
        if (typeof QRCode !== 'undefined') {
            try {
                new QRCode(container, {
                    text: qrUrl,
                    width: mergedOptions.width,
                    height: mergedOptions.height,
                    colorDark: '#FFD700',
                    colorLight: '#000022',
                    correctLevel: QRCode.CorrectLevel.L  // Lower = simpler QR, easier to scan
                });
                return container;
            } catch (e) {
                console.error('QRCode generation failed:', e);
            }
        }
        
        // Ultra fallback: create simple text with link
        container.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #FFD700;">
                <p>Share this link:</p>
                <input type="text" value="${qrUrl}" 
                    style="width: 100%; padding: 10px; background: rgba(0,0,0,0.5); 
                    border: 1px solid #FFD700; color: #fff; border-radius: 5px;"
                    readonly onclick="this.select()">
            </div>
        `;
        
        return container;
    }
    
    /**
     * Copy invite URL to clipboard
     * @returns {Promise<boolean>}
     */
    async copyInviteUrl() {
        const url = this.generateQRUrl();
        
        try {
            await navigator.clipboard.writeText(url);
            return true;
        } catch (error) {
            // Fallback
            const textArea = document.createElement('textarea');
            textArea.value = url;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            return true;
        }
    }
    
    /**
     * Share invite URL using Web Share API
     * @returns {Promise<boolean>}
     */
    async shareInviteUrl() {
        const url = this.generateQRUrl();
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Join Srishti Blockchain',
                    text: 'Scan to join my node on the Srishti blockchain!',
                    url: url
                });
                return true;
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Share failed:', error);
                    return false;
                }
            }
        }
        
        // Fallback to clipboard
        return await this.copyInviteUrl();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QRCodeDiscovery;
} else {
    // Create a global singleton instance (like the old QR generator pattern)
    window.SrishtiQRCode = new QRCodeDiscovery();
    // Also export the class for advanced usage
    window.SrishtiQRCodeClass = QRCodeDiscovery;
}
