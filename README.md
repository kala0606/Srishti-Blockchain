# Srishti Blockchain

A decentralized, browser-based blockchain that treats **time and participation** as the core units of value. Built with pure JavaScript, WebRTC for peer-to-peer networking, and a beautiful 3D visualization.

## Philosophy

Srishti challenges the assumption that blockchain value must be monetary. Instead, it values:

- **Time** - Cryptographically timestamped moments of participation
- **Presence** - Being present and active in the network
- **Connection** - The social graph of who invited whom
- **Trust through Participation** - Consensus based on consistent, honest participation

## Features

- **True P2P** - Direct browser-to-browser connections via WebRTC
- **3D Visualization** - Interactive Three.js network graph
- **QR Code Invites** - Scan to join the network
- **Recovery Phrases** - 12-word seed phrase backup
- **No Central Server** - Signaling server only for initial discovery, all data is P2P

## Architecture

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
│       ├── BlockchainAdapter.js
│       └── GlowCalculator.js
└── signaling-server/          # WebSocket signaling (Fly.io)
    ├── signaling-server.js
    ├── Dockerfile
    └── fly.toml
```

## Getting Started

### Run Locally

```bash
# Serve the app (HTTPS recommended for WebRTC)
npx serve .

# Or with Python
python -m http.server 8000
```

Visit `http://localhost:8000`

### Deploy Signaling Server

The signaling server is deployed on Fly.io:

```bash
cd signaling-server
fly deploy
```

Current deployment: `wss://srishti-signaling.fly.dev`

## How It Works

1. **Join** - Create a node or scan someone's QR code
2. **Connect** - WebRTC establishes direct P2P connections
3. **Sync** - Chains are synchronized across all peers
4. **Participate** - Your presence contributes to consensus

### Chain Sync

- Longest valid chain wins
- Unique NODE_JOIN events are merged across divergent chains
- All nodes eventually converge to the same chain state

## Technical Stack

| Component | Technology |
|-----------|------------|
| Blockchain | Native JS + Web Crypto API |
| Storage | IndexedDB |
| P2P | WebRTC Data Channels |
| Signaling | WebSocket (Fly.io) |
| Crypto | Ed25519, SHA-256 |
| Visualization | Three.js |

## Debug Commands

Open browser console:

```javascript
// First, verify SrishtiApp is available
console.log('SrishtiApp:', window.SrishtiApp);
console.log('Methods:', {
    getChainInfo: typeof window.SrishtiApp?.getChainInfo,
    getNodes: typeof window.SrishtiApp?.getNodes
});

// View chain info (requires initialization)
window.SrishtiApp?.getChainInfo()

// Check connected peers (returns 0 if network not initialized)
window.SrishtiApp?.network?.peers?.size || 0

// View all nodes (requires initialization)
window.SrishtiApp?.getNodes()
```

**Notes:**
- Use `window.SrishtiApp` to ensure you're accessing the global instance
- `network` may be `null` if the app hasn't been initialized or no node has been created yet
- Methods require the app to be initialized (call `await window.SrishtiApp.init()` if needed)
- If methods are missing, check the console for initialization errors

## License

MIT

---

**Built for exploring decentralized coordination beyond money** 🌟
