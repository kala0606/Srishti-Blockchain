# Srishti Blockchain

An experimental JavaScript-based blockchain that treats **time and participation** as the core units of value. Srishti implements a decentralized, immutable shared timeline using cryptographic timestamping and peer-to-peer consensus, exploring alternatives to money-centric systems of trust and coordination.

## Philosophy

Srishti challenges the assumption that blockchain value must be monetary. Instead, it values:

- **Time** - Cryptographically timestamped moments of participation
- **Presence** - Being present and active in the network
- **Connection** - The social graph of who invited whom
- **Trust through Participation** - Consensus based on consistent, honest participation

## Architecture

### Core Components

```
src/
├── core/
│   ├── Hasher.js              # SHA-256 hashing
│   ├── Event.js               # Event types (NODE_JOIN, ATTEST, etc.)
│   ├── Block.js               # Block structure with hash chain
│   └── Chain.js               # Chain management and validation
│
├── crypto/
│   └── Keys.js                # Ed25519 key generation and signing
│
├── storage/
│   └── IndexedDBStore.js      # Persistent chain storage
│
├── p2p/
│   ├── Protocol.js            # P2P message protocol
│   ├── PeerConnection.js      # WebRTC peer connections
│   └── Network.js             # Network management and sync
│
├── consensus/
│   └── ProofOfParticipation.js # Proof of Participation consensus
│
├── discovery/
│   └── QRCode.js              # QR code-based peer discovery
│
└── ui/
    ├── BlockchainAdapter.js   # Firebase-compatible adapter
    └── GlowCalculator.js      # Participation-based glow system
```

### Key Features

1. **True P2P** - No central server, direct browser-to-browser connections via WebRTC
2. **Local Storage** - Each node stores the full chain in IndexedDB
3. **Cryptographic Integrity** - SHA-256 hash chain ensures immutability
4. **Proof of Participation** - Consensus based on participation scores (glow system)
5. **QR-Based Onboarding** - Scan QR codes to join and connect to peers

## Getting Started

### Prerequisites

- Modern browser with Web Crypto API support (HTTPS required for production)
- IndexedDB support
- WebRTC support (for P2P networking)

### Development

1. Clone the repository
2. Open `test-core.html` in a browser to test core components
3. Serve locally (required for IndexedDB):

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8000
```

Then visit `http://localhost:8000/test-core.html`

### Core Components Test

The `test-core.html` file tests:
- Blockchain creation and validation
- Block addition and hash chain integrity
- Storage (IndexedDB)
- Cryptographic keys (Ed25519)

## Current Status

✅ **Completed:**
- Core blockchain (Block, Chain, Event, Hasher)
- Cryptographic keys (Ed25519)
- IndexedDB storage
- P2P protocol definition
- WebRTC peer connections
- Network layer (sync, propagation)
- Proof of Participation consensus
- QR code discovery
- Blockchain adapter (Firebase-compatible)
- Glow calculator (ported)

🚧 **In Progress:**
- Full P2P network integration
- UI migration from Firebase to blockchain

📋 **Planned:**
- Full mesh network
- Presence tracking via P2P
- Recovery phrases stored in chain
- Three.js visualization integration

## Design Decisions

### Why IndexedDB?
- Can store GBs of data (chains grow over time)
- Fast queries by hash, index, timestamp
- Survives browser restarts
- Async API doesn't block UI

### Why WebRTC?
- Direct browser-to-browser connections
- No central server needed
- Built into browsers
- Supports data channels for messaging

### Why Ed25519?
- Fast signing and verification
- Small keys (32 bytes)
- Good security properties
- Supported by Web Crypto API

### Why Proof of Participation?
- Aligns with Srishti's philosophy (time/participation as value)
- Your existing glow system informs consensus
- No wasteful mining
- Rewards consistent, honest participation

## Technical Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| **Blockchain** | Native JS + Web Crypto API | No dependencies, works everywhere |
| **Storage** | IndexedDB | Unlimited storage, async |
| **P2P Networking** | WebRTC + WebSockets (for signaling) | Direct browser-to-browser |
| **Cryptography** | Web Crypto API (Ed25519, SHA-256) | Native browser APIs |
| **Discovery** | QR codes + optional signaling server | Easy onboarding |
| **UI** | Three.js (your existing code) | Keep what works |

## Migration from Firebase

The `BlockchainAdapter` provides a Firebase-compatible interface, allowing your existing UI code to work with minimal changes:

```javascript
// Instead of:
window.SrishtiFirebase.subscribeToNodes((nodes) => { ... });

// Use:
blockchainAdapter.subscribeToNodes((nodes) => { ... });
```

The adapter translates blockchain events into the same node structure your UI expects.

## License

[Your License Here]

---

**Built for the Srishti Blockchain project** 🌟
