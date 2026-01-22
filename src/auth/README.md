# Srishti dApp Authentication System

## Overview

This authentication system allows dApps to authenticate users **without storing private keys**. It uses:

1. **Session Tokens**: Signed tokens that prove identity
2. **Wallet Provider**: Requests signatures from the main app when needed

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Main App      │         │   dApp           │         │  Blockchain │
│  (Wallet)       │         │  (No Private Key)│         │             │
└─────────────────┘         └──────────────────┘         └─────────────┘
       │                            │                            │
       │  1. User logs in           │                            │
       │  2. Generate session token │                            │
       │───────────────────────────>│                            │
       │                            │                            │
       │                            │  3. Verify token          │
       │                            │──────────────────────────>│
       │                            │  4. Get public key         │
       │                            │<──────────────────────────│
       │                            │                            │
       │                            │  5. User action (needs sig)│
       │                            │                            │
       │  6. Request signature      │                            │
       │<───────────────────────────│                            │
       │  7. Sign & return          │                            │
       │───────────────────────────>│                            │
       │                            │  8. Submit to blockchain  │
       │                            │──────────────────────────>│
```

## Components

### 1. SessionAuth (`SessionAuth.js`)
- Generates signed session tokens
- Verifies tokens using public keys from chain
- Stores tokens in sessionStorage (cleared on browser close)

### 2. WalletProvider (`WalletProvider.js`)
- Main app: Listens for signature requests
- dApp: Requests signatures via postMessage
- Secure communication between apps

### 3. dAppAuth (`dAppAuth.js`)
- Helper for dApps to authenticate
- Handles login flow and token management

## Usage

### Main App (Wallet Provider)

1. **Initialize wallet provider**:
```javascript
// In main app.js, after initialization
window.SrishtiWalletProvider.init();
```

2. **Generate session token for dApp**:
```javascript
// When user wants to use a dApp
const token = await window.SrishtiSessionAuth.generateToken(
    app.nodeId,
    app.keyPair.privateKey,
    {
        expiresIn: 24 * 60 * 60, // 24 hours
        dAppOrigin: 'https://your-dapp.com'
    }
);

// Redirect to dApp with token
window.location.href = `https://your-dapp.com?session_token=${token}`;
```

### dApp Side

1. **Load auth scripts** (in HTML):
```html
<script src="https://kala0606.github.io/Srishti-Blockchain/src/auth/SessionAuth.js"></script>
<script src="https://kala0606.github.io/Srishti-Blockchain/src/auth/WalletProvider.js"></script>
<script src="https://kala0606.github.io/Srishti-Blockchain/src/auth/dAppAuth.js"></script>
```

2. **Authenticate on load**:
```javascript
// Wait for chain to load
const chain = window.SrishtiApp.chain;

// Check for login callback
const tokenData = await window.SrishtiDAppAuth.handleLoginCallback(chain);
if (tokenData) {
    console.log('✅ Logged in:', tokenData.nodeId);
}

// Or check existing session
const isAuth = await window.SrishtiDAppAuth.isAuthenticated(chain);
if (!isAuth) {
    // Redirect to main app for login
    window.SrishtiDAppAuth.initiateLogin(window.location.href);
    return;
}

// Get authenticated node ID
const nodeId = await window.SrishtiDAppAuth.getNodeId(chain);
```

3. **Request signatures when needed**:
```javascript
// When submitting a transaction that needs signing
const blockData = { /* block data */ };
const signature = await window.SrishtiWalletProvider.requestSignature(
    blockData,
    nodeId,
    'https://kala0606.github.io/Srishti-Blockchain/' // wallet origin
);

// Add signature to block and submit
block.signature = signature;
await network.proposeBlock(block);
```

## Security Considerations

1. **Token Expiration**: Tokens expire after 24 hours (configurable)
2. **Origin Verification**: Tokens can be bound to specific dApp origins
3. **SessionStorage**: Tokens cleared when browser closes
4. **Signature Requests**: Only authenticated nodes can request signatures
5. **PostMessage Security**: Verify origins in production

## Migration Guide

### For Existing dApps

1. Remove private key storage from localStorage
2. Add auth scripts to HTML
3. Use `dAppAuth` for authentication
4. Use `WalletProvider` for signing transactions
5. Update SDK initialization to use session tokens

### For Main App

1. Add wallet provider initialization
2. Add login flow that generates tokens
3. Handle dApp login redirects

## Example: Attendance App Migration

See `attendance-app/auth-example.js` for a complete example of migrating the attendance app to use session authentication.
