/**
 * Srishti Blockchain - QR Code Generator
 * 
 * Generates unique invite QR codes containing the parent node ID.
 * When scanned, new users join as children of the QR code owner.
 */

class QRGenerator {
    constructor() {
        this.qrContainer = null;
        this.currentNodeId = null;
    }
    
    /**
     * Initialize the QR generator for a node
     * @param {string} nodeId - The node ID to generate QR for
     */
    init(nodeId) {
        this.currentNodeId = nodeId;
    }
    
    /**
     * Generate the invite URL for a node
     * @param {string} nodeId - Optional, uses current node if not provided
     * @returns {string} - Full invite URL
     */
    generateInviteUrl(nodeId = null) {
        const id = nodeId || this.currentNodeId;
        if (!id) {
            console.error('No node ID available for QR generation');
            return null;
        }
        
        // Get current URL without query params
        const baseUrl = window.location.origin + window.location.pathname;
        
        // Add join parameter
        return `${baseUrl}?join=${id}`;
    }
    
    /**
     * Generate QR code and display in container
     * @param {string} containerId - DOM element ID to render QR into
     * @param {Object} options - QR code options
     * @returns {Promise<HTMLElement>} - The QR code element
     */
    async generateQR(containerId, options = {}) {
        const inviteUrl = this.generateInviteUrl();
        if (!inviteUrl) return null;
        
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('QR container not found:', containerId);
            return null;
        }
        
        // Clear previous QR
        container.innerHTML = '';
        
        // Default options matching the dark/gold aesthetic
        const defaultOptions = {
            width: 200,
            height: 200,
            type: 'canvas',
            data: inviteUrl,
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
        
        // Check if QRCodeStyling is available (fancy library)
        if (typeof QRCodeStyling !== 'undefined') {
            const qrCode = new QRCodeStyling(mergedOptions);
            qrCode.append(container);
            return container;
        }
        
        // Fallback to basic QRCode library
        if (typeof QRCode !== 'undefined') {
            try {
                new QRCode(container, {
                    text: inviteUrl,
                    width: mergedOptions.width,
                    height: mergedOptions.height,
                    colorDark: '#FFD700',
                    colorLight: '#000022',
                    correctLevel: QRCode.CorrectLevel.M
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
                <input type="text" value="${inviteUrl}" 
                    style="width: 100%; padding: 10px; background: rgba(0,0,0,0.5); 
                    border: 1px solid #FFD700; color: #fff; border-radius: 5px;"
                    readonly onclick="this.select()">
            </div>
        `;
        
        return container;
    }
    
    /**
     * Generate QR as a data URL for download
     * @returns {Promise<string>} - Data URL of the QR image
     */
    async generateQRDataUrl() {
        const inviteUrl = this.generateInviteUrl();
        if (!inviteUrl) return null;
        
        return new Promise((resolve) => {
            // Create temporary container
            const tempContainer = document.createElement('div');
            tempContainer.style.position = 'absolute';
            tempContainer.style.left = '-9999px';
            document.body.appendChild(tempContainer);
            
            if (typeof QRCode !== 'undefined') {
                new QRCode(tempContainer, {
                    text: inviteUrl,
                    width: 300,
                    height: 300,
                    colorDark: '#FFD700',
                    colorLight: '#000033',
                    correctLevel: QRCode.CorrectLevel.H
                });
                
                // Wait for canvas to render
                setTimeout(() => {
                    const canvas = tempContainer.querySelector('canvas');
                    if (canvas) {
                        resolve(canvas.toDataURL('image/png'));
                    } else {
                        resolve(null);
                    }
                    document.body.removeChild(tempContainer);
                }, 100);
            } else {
                resolve(null);
                document.body.removeChild(tempContainer);
            }
        });
    }
    
    /**
     * Download QR code as image
     * @param {string} filename - Name for the downloaded file
     */
    async downloadQR(filename = 'srishti-invite.png') {
        const dataUrl = await this.generateQRDataUrl();
        if (!dataUrl) {
            console.error('Could not generate QR for download');
            return;
        }
        
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        link.click();
    }
    
    /**
     * Share QR code using Web Share API (mobile)
     */
    async shareQR() {
        const inviteUrl = this.generateInviteUrl();
        if (!inviteUrl) return;
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Join Srishti Blockchain',
                    text: 'Scan to join my node on the Srishti blockchain!',
                    url: inviteUrl
                });
                console.log('Shared successfully');
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Share failed:', error);
                    this.copyToClipboard(inviteUrl);
                }
            }
        } else {
            // Fallback to clipboard
            this.copyToClipboard(inviteUrl);
        }
    }
    
    /**
     * Copy invite URL to clipboard
     * @param {string} url 
     */
    async copyToClipboard(url) {
        try {
            await navigator.clipboard.writeText(url);
            this.showToast('Link copied to clipboard!');
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = url;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showToast('Link copied to clipboard!');
        }
    }
    
    /**
     * Show a toast notification
     * @param {string} message 
     */
    showToast(message) {
        // Check if toast container exists
        let toast = document.getElementById('srishti-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'srishti-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 30px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(145deg, #FFD700, #FFA500);
                color: #000033;
                padding: 12px 24px;
                border-radius: 25px;
                font-weight: bold;
                font-size: 14px;
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.3s ease;
                box-shadow: 0 4px 20px rgba(255, 215, 0, 0.3);
            `;
            document.body.appendChild(toast);
        }
        
        toast.textContent = message;
        toast.style.opacity = '1';
        
        setTimeout(() => {
            toast.style.opacity = '0';
        }, 3000);
    }
    
    /**
     * Parse join parameter from URL
     * @returns {string|null} - Parent node ID if present
     */
    static parseJoinFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('join');
    }
    
    /**
     * Clear join parameter from URL without reload
     */
    static clearJoinFromUrl() {
        const url = new URL(window.location.href);
        url.searchParams.delete('join');
        window.history.replaceState({}, document.title, url.pathname);
    }
}

// Create global instance
window.SrishtiQR = new QRGenerator();
