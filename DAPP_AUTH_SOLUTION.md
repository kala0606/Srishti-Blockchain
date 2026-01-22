# dApp Authentication Solution

## Problem

Storing private keys in localStorage is a **security risk** for dApps. The current error (`DataError` when importing private key) highlights this issue.

## Recommended Solution: Session Token Authentication

I've created a secure authentication system that **doesn't require private keys in dApps**.

### Architecture

1. **Main Blockchain App** (Wallet):
   - Stores private keys securely
   - Generates signed session tokens for dApps
   - Acts as wallet provider for signing requests

2. **dApps**:
   - Store only session tokens (in sessionStorage, cleared on browser close)
   - Verify tokens using public keys from chain
   - Request signatures from main app when needed

### Files Created

1. `src/auth/SessionAuth.js` - Token generation and verification
2. `src/auth/WalletProvider.js` - Secure signature requests via postMessage
3. `src/auth/dAppAuth.js` - Helper for dApp authentication flow
4. `src/auth/README.md` - Complete documentation

## Quick Fix for Current Issue

The immediate error is caused by a corrupted private key in localStorage. Here are your options:

### Option 1: Clear and Re-login (Recommended)
```javascript
// In browser console on the attendance app page:
localStorage.removeItem('srishti_private_key');
localStorage.removeItem('srishti_public_key');
// Keep nodeId and nodeName
// Then re-login on main blockchain app
```

### Option 2: Use Session Token System (Best Long-term)

1. **Update main app** to initialize wallet provider:
```javascript
// In app.js, after initialization
if (window.SrishtiWalletProvider) {
    window.SrishtiWalletProvider.init();
}
```

2. **Update attendance app** to use session tokens:
   - Remove private key dependency
   - Use `SrishtiDAppAuth` for authentication
   - Use `WalletProvider` for signing transactions

## Migration Steps

### Step 1: Add Auth Scripts to Attendance App

In `attendance-app/index.html`, add before the attendance app script:

```html
<!-- Session Authentication -->
<script src="https://kala0606.github.io/Srishti-Blockchain/src/auth/SessionAuth.js"></script>
<script src="https://kala0606.github.io/Srishti-Blockchain/src/auth/WalletProvider.js"></script>
<script src="https://kala0606.github.io/Srishti-Blockchain/src/auth/dAppAuth.js"></script>
```

### Step 2: Update Attendance App Initialization

Replace the credential loading logic with:

```javascript
// Wait for chain
while (!this.srishtiApp.chain && retries < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    retries++;
}

// Authenticate with session token
const tokenData = await window.SrishtiDAppAuth.handleLoginCallback(this.srishtiApp.chain);
if (tokenData) {
    console.log('✅ Authenticated via session token:', tokenData.nodeId);
    this.srishtiApp.nodeId = tokenData.nodeId;
} else {
    // Check existing session
    const isAuth = await window.SrishtiDAppAuth.isAuthenticated(this.srishtiApp.chain);
    if (!isAuth) {
        // Redirect to main app for login
        const returnUrl = encodeURIComponent(window.location.href);
        window.SrishtiDAppAuth.initiateLogin(returnUrl);
        return;
    }
    
    const nodeId = await window.SrishtiDAppAuth.getNodeId(this.srishtiApp.chain);
    this.srishtiApp.nodeId = nodeId;
}
```

### Step 3: Update SDK to Use Wallet Provider for Signing

Modify `submitAppEvent` in SDK to request signatures:

```javascript
async submitAppEvent(appId, action, options = {}) {
    // ... create block ...
    
    // Request signature from wallet
    const blockData = {
        index: block.index,
        timestamp: block.timestamp,
        previousHash: block.previousHash,
        data: block.data,
        proposer: block.proposer,
        participationProof: block.participationProof,
        hash: block.hash
    };
    
    try {
        const signature = await window.SrishtiWalletProvider.requestSignature(
            blockData,
            this.nodeId
        );
        block.signature = signature;
    } catch (error) {
        throw new Error('Signature request failed: ' + error.message);
    }
    
    return await this.network.proposeBlock(block);
}
```

### Step 4: Add Login Flow to Main App

In `index.html`, after user logs in, add option to generate session token for dApps:

```javascript
// When user wants to use a dApp
async function generateSessionTokenForDApp(dAppUrl) {
    if (!window.SrishtiApp || !window.SrishtiApp.keyPair || !window.SrishtiApp.keyPair.privateKey) {
        alert('Please log in first');
        return;
    }
    
    const token = await window.SrishtiSessionAuth.generateToken(
        window.SrishtiApp.nodeId,
        window.SrishtiApp.keyPair.privateKey,
        {
            expiresIn: 24 * 60 * 60,
            dAppOrigin: new URL(dAppUrl).origin
        }
    );
    
    // Redirect to dApp with token
    const url = new URL(dAppUrl);
    url.searchParams.set('session_token', token);
    window.location.href = url.toString();
}
```

## Benefits

1. ✅ **No private keys in dApps** - Much more secure
2. ✅ **Session-based** - Tokens expire and are cleared on browser close
3. ✅ **Cross-domain support** - Works across different domains
4. ✅ **Wallet-like UX** - Similar to MetaMask, users control their keys
5. ✅ **Backward compatible** - Can coexist with current system during migration

## Next Steps

1. Test the session token system
2. Migrate attendance app to use it
3. Update other dApps to use the same system
4. Eventually deprecate localStorage private key storage

## Questions?

See `src/auth/README.md` for detailed documentation and examples.
