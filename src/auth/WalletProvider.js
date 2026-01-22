/**
 * Srishti Wallet Provider
 * 
 * Allows dApps to request signatures from the main blockchain app
 * without exposing private keys. Uses postMessage for secure communication.
 * 
 * Main App Side: Acts as wallet provider
 * dApp Side: Requests signatures via postMessage
 */

class WalletProvider {
    /**
     * Initialize wallet provider on main app side
     * Listens for signature requests from dApps
     */
    static init() {
        if (typeof window === 'undefined') return;
        
        // Listen for messages from dApps
        window.addEventListener('message', async (event) => {
            // Security: Verify origin (you can whitelist specific origins)
            // For now, we'll accept from any origin, but you should restrict this
            // if (event.origin !== 'https://your-dapp-domain.com') return;
            
            if (event.data && event.data.type === 'SRISHTI_SIGNATURE_REQUEST') {
                await WalletProvider._handleSignatureRequest(event);
            }
        });
        
        console.log('✅ Wallet Provider initialized');
    }
    
    /**
     * Handle signature request from dApp
     * @private
     */
    static async _handleSignatureRequest(event) {
        const { requestId, data, nodeId } = event.data;
        
        try {
            // Verify the request is from the authenticated node
            const app = window.SrishtiApp || window.srishtiAppInstance;
            if (!app || !app.keyPair || !app.keyPair.privateKey) {
                throw new Error('Wallet not available or not authenticated');
            }
            
            if (app.nodeId !== nodeId) {
                throw new Error('Node ID mismatch');
            }
            
            // Sign the data
            const signature = await window.SrishtiKeys.sign(app.keyPair.privateKey, data);
            
            // Send response back to dApp
            event.source.postMessage({
                type: 'SRISHTI_SIGNATURE_RESPONSE',
                requestId: requestId,
                success: true,
                signature: signature
            }, event.origin);
        } catch (error) {
            // Send error response
            event.source.postMessage({
                type: 'SRISHTI_SIGNATURE_RESPONSE',
                requestId: requestId,
                success: false,
                error: error.message
            }, event.origin);
        }
    }
    
    /**
     * Request a signature from the main app (dApp side)
     * @param {string|Object} data - Data to sign
     * @param {string} nodeId - Node ID
     * @param {string} [walletOrigin] - Origin of wallet app (default: parent window)
     * @returns {Promise<string>} Signature
     */
    static async requestSignature(data, nodeId, walletOrigin = null) {
        return new Promise((resolve, reject) => {
            const requestId = crypto.randomUUID();
            
            // Determine wallet origin
            let targetOrigin = walletOrigin;
            if (!targetOrigin) {
                // Try to get from localStorage or config
                const blockchainUrl = window.SRISHTI_BLOCKCHAIN_URL || localStorage.getItem('srishti_blockchain_url');
                if (blockchainUrl) {
                    try {
                        const url = new URL(blockchainUrl);
                        targetOrigin = url.origin;
                    } catch (e) {
                        // Fallback to parent
                        targetOrigin = '*';
                    }
                } else {
                    targetOrigin = '*';
                }
            }
            
            // Set up response listener
            const messageHandler = (event) => {
                if (event.data && 
                    event.data.type === 'SRISHTI_SIGNATURE_RESPONSE' && 
                    event.data.requestId === requestId) {
                    window.removeEventListener('message', messageHandler);
                    
                    if (event.data.success) {
                        resolve(event.data.signature);
                    } else {
                        reject(new Error(event.data.error || 'Signature request failed'));
                    }
                }
            };
            
            window.addEventListener('message', messageHandler);
            
            // Send request
            const dataString = typeof data === 'string' ? data : JSON.stringify(data);
            
            // Try to send to parent window (if in iframe) or opener (if opened via window.open)
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'SRISHTI_SIGNATURE_REQUEST',
                    requestId: requestId,
                    data: dataString,
                    nodeId: nodeId
                }, targetOrigin);
            } else if (window.opener) {
                window.opener.postMessage({
                    type: 'SRISHTI_SIGNATURE_REQUEST',
                    requestId: requestId,
                    data: dataString,
                    nodeId: nodeId
                }, targetOrigin);
            } else {
                // Try to open wallet in popup or redirect
                reject(new Error('Wallet connection not available. Please ensure you are logged in to the main blockchain app.'));
            }
            
            // Timeout after 30 seconds
            setTimeout(() => {
                window.removeEventListener('message', messageHandler);
                reject(new Error('Signature request timeout'));
            }, 30000);
        });
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WalletProvider;
} else {
    window.SrishtiWalletProvider = WalletProvider;
}
