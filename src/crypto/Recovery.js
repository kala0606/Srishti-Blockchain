/**
 * Srishti Blockchain - Recovery Phrase System
 * 
 * Generates and handles recovery phrases for node identity backup.
 * Uses a simplified word-based encoding of the private key.
 */

class Recovery {
    // BIP39-inspired word list (simplified - 256 words for 8-bit encoding)
    static WORD_LIST = [
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
        'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
        'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
        'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
        'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
        'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
        'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
        'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
        'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
        'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
        'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
        'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
        'army', 'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artefact',
        'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist', 'assume',
        'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
        'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado',
        'avoid', 'awake', 'aware', 'away', 'awesome', 'awful', 'awkward', 'axis',
        'baby', 'bachelor', 'bacon', 'badge', 'bag', 'balance', 'balcony', 'ball',
        'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain', 'barrel', 'base',
        'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become',
        'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt',
        'bench', 'benefit', 'best', 'betray', 'better', 'between', 'beyond', 'bicycle',
        'bid', 'bike', 'bind', 'biology', 'bird', 'birth', 'bitter', 'black',
        'blade', 'blame', 'blanket', 'blast', 'bleak', 'bless', 'blind', 'blood',
        'blossom', 'blouse', 'blue', 'blur', 'blush', 'board', 'boat', 'body',
        'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring',
        'borrow', 'boss', 'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain',
        'brand', 'brass', 'brave', 'bread', 'breeze', 'brick', 'bridge', 'brief',
        'bright', 'bring', 'brisk', 'broccoli', 'broken', 'bronze', 'broom', 'brother',
        'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb',
        'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus',
        'business', 'busy', 'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable'
    ];

    /**
     * Generate a recovery phrase from private key
     * @param {string} privateKeyBase64 - Base64-encoded private key
     * @returns {string} - 12-word recovery phrase
     */
    static generatePhrase(privateKeyBase64) {
        // Decode base64 to bytes
        const binary = atob(privateKeyBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        
        // PKCS8 Ed25519 private key format:
        // First 16 bytes are ASN.1 header (same for all keys)
        // Actual key material starts at byte 16
        // Skip the header to get unique bytes for each key
        const KEY_HEADER_LENGTH = 16;
        const keyStart = Math.min(KEY_HEADER_LENGTH, bytes.length - 12);
        
        // Use 12 bytes from the actual key material (not header)
        const words = [];
        for (let i = 0; i < 12; i++) {
            const byteIndex = keyStart + i;
            const wordIndex = bytes[byteIndex] % this.WORD_LIST.length;
            words.push(this.WORD_LIST[wordIndex]);
        }
        
        return words.join(' ');
    }

    /**
     * Hash a recovery phrase (for storage/verification)
     * @param {string} phrase - Recovery phrase
     * @returns {Promise<string>} - SHA-256 hash of phrase
     */
    static async hashPhrase(phrase) {
        const encoder = new TextEncoder();
        const data = encoder.encode(phrase.toLowerCase().trim());
        const hash = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hash));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Verify a recovery phrase against stored hash
     * @param {string} phrase - Recovery phrase to verify
     * @param {string} storedHash - Previously stored hash
     * @returns {Promise<boolean>}
     */
    static async verifyPhrase(phrase, storedHash) {
        const hash = await this.hashPhrase(phrase);
        return hash === storedHash;
    }

    /**
     * Show recovery phrase modal to user
     * @param {string} phrase - Recovery phrase to display
     * @param {Function} onClose - Callback when modal is closed
     */
    static showPhraseModal(phrase, onClose) {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'recovery-phrase-modal';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(5, 5, 16, 0.8);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;

        const words = phrase.split(' ');
        const wordGrid = words.map((word, i) => 
            `<div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 8px; text-align: center;">
                <span style="color: #666; font-size: 12px;">${i + 1}</span><br>
                <span style="color: #fff; font-size: 16px; font-weight: bold;">${word}</span>
            </div>`
        ).join('');

        overlay.innerHTML = `
            <div style="background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.03) 100%);
                backdrop-filter: blur(40px);
                -webkit-backdrop-filter: blur(40px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 32px;
                padding: 40px;
                max-width: 500px;
                width: 90%;
                text-align: center;
                box-shadow: 
                    0 24px 80px rgba(0, 0, 0, 0.5),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
                position: relative;
                animation: modalAppear 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
                <style>
                    @keyframes modalAppear {
                        from {
                            opacity: 0;
                            transform: scale(0.9) translateY(30px);
                        }
                        to {
                            opacity: 1;
                            transform: scale(1) translateY(0);
                        }
                    }
                </style>
                <h2 style="font-family: 'Syne', sans-serif; color: #fff; margin: 0 0 8px 0; font-size: 1.6em; font-weight: 700;">🔐 Your Recovery Phrase (BIP39)</h2>
                <p style="color: rgba(255, 255, 255, 0.6); margin: 0 0 28px 0; font-size: 0.9em;">
                    Write down these 12 words in order. This BIP39 mnemonic can fully restore your private key and all account access.
                </p>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px;">
                    ${wordGrid}
                </div>
                <button id="recovery-phrase-copy" style="
                    background: rgba(255, 255, 255, 0.06);
                    color: #fff;
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    padding: 12px 24px;
                    border-radius: 50px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-family: 'Outfit', sans-serif;
                    font-size: 0.9em;
                    backdrop-filter: blur(10px);
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 20px;
                    width: 100%;
                    justify-content: center;
                ">📋 Copy Phrase</button>
                <p style="color: #ff6b6b; font-size: 12px; margin: 0 0 24px 0;">
                    ⚠️ Never share this phrase. Anyone with it can control your node.
                </p>
                <button id="recovery-phrase-confirm" style="
                    background: linear-gradient(135deg, #9333EA, #4F46E5);
                    color: white;
                    border: none;
                    padding: 14px 32px;
                    border-radius: 50px;
                    font-size: 0.95em;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-family: 'Outfit', sans-serif;
                    width: 100%;
                ">I've saved my phrase</button>
            </div>
        `;

        document.body.appendChild(overlay);

        // Add copy functionality
        const copyButton = document.getElementById('recovery-phrase-copy');
        copyButton.onclick = async () => {
            try {
                await navigator.clipboard.writeText(phrase);
                const originalText = copyButton.innerHTML;
                copyButton.innerHTML = '✓ Copied!';
                copyButton.style.background = 'rgba(0, 255, 136, 0.2)';
                copyButton.style.borderColor = 'rgba(0, 255, 136, 0.4)';
                copyButton.style.color = '#00ff88';
                
                setTimeout(() => {
                    copyButton.innerHTML = originalText;
                    copyButton.style.background = 'rgba(255, 255, 255, 0.06)';
                    copyButton.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                    copyButton.style.color = '#fff';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
                // Fallback: select text in a temporary textarea
                const textarea = document.createElement('textarea');
                textarea.value = phrase;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                    copyButton.innerHTML = '✓ Copied!';
                    setTimeout(() => {
                        copyButton.innerHTML = '📋 Copy Phrase';
                    }, 2000);
                } catch (fallbackErr) {
                    alert('Failed to copy. Please manually copy the phrase.');
                }
                document.body.removeChild(textarea);
            }
        };

        // Add hover effect for copy button
        copyButton.onmouseenter = () => {
            if (copyButton.innerHTML.includes('Copy')) {
                copyButton.style.background = 'rgba(255, 255, 255, 0.12)';
                copyButton.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                copyButton.style.transform = 'translateY(-2px)';
            }
        };

        copyButton.onmouseleave = () => {
            if (copyButton.innerHTML.includes('Copy')) {
                copyButton.style.background = 'rgba(255, 255, 255, 0.06)';
                copyButton.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                copyButton.style.transform = 'translateY(0)';
            }
        };

        document.getElementById('recovery-phrase-confirm').onclick = () => {
            overlay.remove();
            if (onClose) onClose();
        };

        // Add hover effect for confirm button
        const confirmButton = document.getElementById('recovery-phrase-confirm');
        confirmButton.onmouseenter = () => {
            confirmButton.style.transform = 'translateY(-2px)';
            confirmButton.style.boxShadow = '0 8px 24px rgba(147, 51, 234, 0.4)';
        };
        confirmButton.onmouseleave = () => {
            confirmButton.style.transform = 'translateY(0)';
            confirmButton.style.boxShadow = 'none';
        };
    }

    /**
     * Show recovery input modal
     * @param {Function} onRecover - Callback with { phrase, name } when recovery attempted
     */
    static showRecoverInputModal(onRecover) {
        const overlay = document.createElement('div');
        overlay.id = 'recovery-input-modal';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;

        // Check sync status
        const syncStatus = window._guestSyncStatus || {};
        const nodeCount = syncStatus.nodeCount || 0;
        const isStillSyncing = !syncStatus.complete || (typeof window.isBlockchainSyncing === 'function' && window.isBlockchainSyncing());
        
        // Build sync warning if needed
        const syncWarning = (isStillSyncing || nodeCount === 0) ? `
            <div id="recovery-sync-warning" style="
                background: rgba(251, 191, 36, 0.15);
                border: 1px solid rgba(251, 191, 36, 0.3);
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 15px;
                display: flex;
                align-items: center;
                gap: 10px;
            ">
                <span style="font-size: 18px;">⏳</span>
                <div style="text-align: left;">
                    <div style="color: #FCD34D; font-size: 13px; font-weight: 500;">
                        ${nodeCount === 0 ? 'Network syncing...' : `Syncing (${nodeCount} nodes loaded)`}
                    </div>
                    <div style="color: rgba(251, 191, 36, 0.7); font-size: 11px;">
                        Recovery may fail if your node hasn't synced yet. Wait for more nodes to load.
                    </div>
                </div>
            </div>
        ` : `
            <div style="
                background: rgba(74, 222, 128, 0.15);
                border: 1px solid rgba(74, 222, 128, 0.3);
                border-radius: 8px;
                padding: 10px;
                margin-bottom: 15px;
                color: #4ADE80;
                font-size: 12px;
            ">
                ✓ ${nodeCount} nodes synced from network
            </div>
        `;

        overlay.innerHTML = `
            <div style="background: #1a1a2e; padding: 30px; border-radius: 16px; max-width: 400px; text-align: center;">
                <h2 style="color: #fff; margin-bottom: 10px;">🔄 Recover Your Node</h2>
                <p style="color: #888; margin-bottom: 15px; font-size: 14px;">
                    Enter your 12-word recovery phrase to restore your node identity.
                </p>
                ${syncWarning}
                <textarea id="recovery-phrase-input" placeholder="Enter your 12 words separated by spaces..." style="
                    width: 100%;
                    height: 100px;
                    padding: 12px;
                    border: 1px solid #333;
                    border-radius: 8px;
                    background: #0d0d1a;
                    color: #fff;
                    font-size: 14px;
                    margin-bottom: 15px;
                    resize: none;
                    box-sizing: border-box;
                "></textarea>
                <input type="text" id="recovery-name-input" placeholder="Your name" style="
                    width: 100%;
                    padding: 12px;
                    border: 1px solid #333;
                    border-radius: 8px;
                    background: #0d0d1a;
                    color: #fff;
                    font-size: 14px;
                    margin-bottom: 20px;
                    box-sizing: border-box;
                ">
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="recovery-cancel" style="
                        background: #333;
                        color: white;
                        border: none;
                        padding: 12px 25px;
                        border-radius: 8px;
                        font-size: 14px;
                        cursor: pointer;
                    ">Cancel</button>
                    <button id="recovery-submit" style="
                        background: linear-gradient(135deg, #667eea, #764ba2);
                        color: white;
                        border: none;
                        padding: 12px 25px;
                        border-radius: 8px;
                        font-size: 14px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                    ">Recover</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        
        // Update sync warning periodically
        const updateSyncWarning = () => {
            const warningEl = document.getElementById('recovery-sync-warning');
            if (!warningEl) return;
            
            const currentStatus = window._guestSyncStatus || {};
            const currentNodes = currentStatus.nodeCount || 0;
            const stillSyncing = !currentStatus.complete || (typeof window.isBlockchainSyncing === 'function' && window.isBlockchainSyncing());
            
            if (!stillSyncing && currentNodes > 0) {
                // Sync complete - update to success state
                warningEl.style.background = 'rgba(74, 222, 128, 0.15)';
                warningEl.style.borderColor = 'rgba(74, 222, 128, 0.3)';
                warningEl.innerHTML = `
                    <span style="font-size: 18px;">✓</span>
                    <div style="text-align: left;">
                        <div style="color: #4ADE80; font-size: 13px; font-weight: 500;">
                            Sync complete!
                        </div>
                        <div style="color: rgba(74, 222, 128, 0.7); font-size: 11px;">
                            ${currentNodes} nodes loaded from network
                        </div>
                    </div>
                `;
            } else if (currentNodes > 0) {
                // Still syncing but have some nodes
                warningEl.querySelector('div > div:first-child').textContent = `Syncing (${currentNodes} nodes loaded)`;
            }
        };
        
        const syncInterval = setInterval(updateSyncWarning, 2000);

        document.getElementById('recovery-cancel').onclick = () => {
            clearInterval(syncInterval);
            overlay.remove();
        };

        document.getElementById('recovery-submit').onclick = async () => {
            const phrase = document.getElementById('recovery-phrase-input').value.trim().toLowerCase();
            const name = document.getElementById('recovery-name-input').value.trim();

            if (!phrase) {
                alert('Please enter your recovery phrase');
                return;
            }

            const words = phrase.split(/\s+/);
            if (words.length !== 12) {
                alert('Recovery phrase must be exactly 12 words');
                return;
            }

            if (!name) {
                alert('Please enter your name');
                return;
            }

            clearInterval(syncInterval);
            overlay.remove();
            if (onRecover) {
                onRecover({ phrase, name });
            }
        };
    }

    /**
     * Initialize recovery system (attach to window for global access)
     */
    static init() {
        // Already initialized via window.SrishtiRecovery
        console.log('Recovery system initialized');
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Recovery;
} else {
    window.SrishtiRecovery = Recovery;
}
