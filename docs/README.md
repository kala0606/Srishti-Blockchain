# Srishti Blockchain - QR Onboarding System

A beautiful 3D visualization for decentralized blockchain node onboarding using QR codes. Scan to join, share to grow your tree, and watch your network light up!

## Architecture

This is a **fully decentralized** blockchain application:
- **No centralized storage** - All data stored locally in IndexedDB
- **P2P networking** - Direct browser-to-browser connections via WebRTC
- **Blockchain-based** - All nodes and relationships recorded on-chain
- **Signaling server** - Only used for initial peer discovery (doesn't store data)

## Quick Start

### 1. Run the App

Simply serve the app locally:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8000
```

Then visit `http://localhost:8000`

> **Note**: For WebRTC to work properly, HTTPS is recommended in production.

### 2. Join the Network

1. Enter your name to create a node
2. Or scan someone's QR code to join as their child node
3. Your node data is stored locally and synced via P2P

## Features

### 🔗 QR Code Onboarding
- Every user gets a unique QR code with their node ID and public key
- Scanning joins you as a child node of the QR owner
- Share via link or native share sheet

### 📷 Camera Scanner
- In-app QR scanning using device camera
- Works on mobile and desktop
- Auto-detects valid Srishti invite codes

### ✨ "Lit" Glow System
Nodes glow based on three factors:
- **Online Presence (40%)** - Currently viewing the app
- **Recent Activity (30%)** - Fades over 24 hours
- **Recruitment (30%)** - More children = brighter glow

### 🌐 P2P Sync
- All nodes sync directly via WebRTC
- See who's online in real-time
- Watch new nodes appear as they join
- Longest valid chain wins during sync

### 💾 Local Storage
- All blockchain data stored in IndexedDB
- Persists across browser sessions
- Download chain data as JSON backup

## File Structure

```
├── index.html                 # Main app with 3D visualization
├── app.js                     # Application logic
├── src/
│   ├── core/                  # Blockchain primitives
│   │   ├── Block.js           # Block structure
│   │   ├── Chain.js           # Chain management
│   │   ├── Event.js           # Event types (NODE_JOIN, etc.)
│   │   └── Hasher.js          # SHA-256 hashing
│   ├── crypto/
│   │   ├── Keys.js            # Ed25519 key generation
│   │   └── Recovery.js        # Seed phrase system
│   ├── p2p/
│   │   ├── Network.js         # P2P network & sync
│   │   ├── PeerConnection.js  # WebRTC connections
│   │   ├── Protocol.js        # Message protocol
│   │   └── SignalingClient.js # Signaling server client
│   ├── consensus/
│   │   └── ProofOfParticipation.js
│   ├── discovery/
│   │   └── QRCode.js          # QR code generation
│   ├── storage/
│   │   └── IndexedDBStore.js  # Local chain storage
│   └── ui/
│       ├── BlockchainAdapter.js  # Adapter for UI layer
│       └── GlowCalculator.js     # "Lit" effect calculations
└── docs/
    ├── README.md              # This file
    └── qr-scanner-blockchain.js  # QR scanner implementation
```

## How It Works

```
┌─────────────────┐     ┌─────────────────┐
│   User A        │     │   User B        │
│   Shows QR      │────>│   Scans QR      │
└─────────────────┘     └─────────────────┘
        │                       │
        │                       │
        ▼                       ▼
┌─────────────────────────────────────────┐
│         P2P Network (WebRTC)            │
│  ┌─────────────────────────────────┐    │
│  │ Direct Browser-to-Browser       │    │
│  │ Connection                      │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
        │                       │
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  Local IndexedDB│     │  Local IndexedDB│
│  (User A's      │     │  (User B's      │
│   Blockchain)   │     │   Blockchain)   │
└─────────────────┘     └─────────────────┘
        │                       │
        │  Chain Sync           │
        │  (Longest wins)       │
        └───────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│       3D Visualization (Three.js)       │
│  ┌───┐                                   │
│  │ A │──────┐                            │
│  └───┘      │                            │
│             ▼                            │
│           ┌───┐                          │
│           │ B │ (glowing = active)       │
│           └───┘                          │
└─────────────────────────────────────────┘
```

## Data Storage

All data is stored **locally** in the browser:
- **IndexedDB**: Blocks, node keys, chain metadata
- **localStorage**: Node ID, name, keys (for quick access)
- **No cloud storage**: Everything is decentralized

## Customization

### Glow Colors
Edit `src/ui/GlowCalculator.js` to change the color gradient:

```javascript
const dim = { r: 40, g: 40, b: 50 };    // Inactive
const amber = { r: 255, g: 140, b: 0 };  // Warming up
const gold = { r: 255, g: 215, b: 0 };   // Active
const white = { r: 255, g: 250, b: 240 }; // Very active
```

### Activity Decay
Change how long nodes stay "lit" after activity:

```javascript
this.ACTIVITY_DECAY_HOURS = 24; // Default: 24 hours
```

### Node Size
Modify recruitment-based scaling in the visualization code.

## Mobile Support

The app is fully responsive and works on:
- iOS Safari
- Android Chrome
- Desktop browsers

Camera access requires HTTPS in production.

## Credits

Built with:
- [Three.js](https://threejs.org/) - 3D rendering
- [D3.js](https://d3js.org/) - Hierarchy layout
- [html5-qrcode](https://github.com/mebjas/html5-qrcode) - QR scanning
- [QRCode.js](https://davidshimjs.github.io/qrcodejs/) - QR generation
- Native Web Crypto API - Cryptography
- WebRTC - P2P networking

---

**No Firebase, No Centralized Storage - Just Pure Decentralization** 🌟
