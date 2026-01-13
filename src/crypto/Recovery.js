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
        
        // Use first 12 bytes to generate 12 words
        const words = [];
        for (let i = 0; i < 12; i++) {
            const byteIndex = i % bytes.length;
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
            background: rgba(0, 0, 0, 0.9);
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
            <div style="background: #1a1a2e; padding: 30px; border-radius: 16px; max-width: 500px; text-align: center;">
                <h2 style="color: #fff; margin-bottom: 10px;">🔐 Your Recovery Phrase</h2>
                <p style="color: #888; margin-bottom: 20px; font-size: 14px;">
                    Write down these 12 words in order. This is the ONLY way to recover your node if you lose access.
                </p>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;">
                    ${wordGrid}
                </div>
                <p style="color: #f44; font-size: 12px; margin-bottom: 20px;">
                    ⚠️ Never share this phrase. Anyone with it can control your node.
                </p>
                <button id="recovery-phrase-confirm" style="
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    border: none;
                    padding: 12px 30px;
                    border-radius: 8px;
                    font-size: 16px;
                    cursor: pointer;
                ">I've saved my phrase</button>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('recovery-phrase-confirm').onclick = () => {
            overlay.remove();
            if (onClose) onClose();
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

        overlay.innerHTML = `
            <div style="background: #1a1a2e; padding: 30px; border-radius: 16px; max-width: 400px; text-align: center;">
                <h2 style="color: #fff; margin-bottom: 10px;">🔄 Recover Your Node</h2>
                <p style="color: #888; margin-bottom: 20px; font-size: 14px;">
                    Enter your 12-word recovery phrase to restore your node identity.
                </p>
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
                    ">Recover</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('recovery-cancel').onclick = () => {
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
