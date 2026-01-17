# Srishti Blockchain

A decentralized, browser-based blockchain that treats **time and participation** as the core units of value. Built with pure JavaScript, WebRTC for peer-to-peer networking, and a beautiful 3D visualization.

## Philosophy

Srishti challenges the assumption that blockchain value must be monetary. Instead, it values:

- **Time** - Cryptographically timestamped moments of participation
- **Presence** - Being present and active in the network
- **Connection** - The social graph of who invited whom
- **Trust through Participation** - Consensus based on consistent, honest participation

## Features

### Core
- **True P2P** - Direct browser-to-browser connections via WebRTC
- **3D Visualization** - Interactive Three.js network graph
- **QR Code Invites** - Scan to join the network
- **Recovery Phrases** - 12-word seed phrase backup
- **No Central Server** - Signaling server only for initial discovery, all data is P2P

### Soulbound Tokens (SBTs)
- **Non-transferable credentials** - Degrees, certifications, achievements
- **Institution-only minting** - Only verified institutions can issue tokens
- **Revocable** - Issuers can revoke if needed
- **IPFS-ready** - Link proofs to decentralized storage

### Role-Based Access Control
| Role | Capabilities |
|------|-------------|
| 👑 **ROOT** | First node, can verify/revoke institutions |
| ⚖️ **GOVERNANCE_ADMIN** | Can verify institutions, create proposals |
| 🏛️ **INSTITUTION** | Can mint soulbound tokens to users |
| 👤 **USER** | Can receive tokens, vote, set up recovery |

### Governance
- **On-chain proposals** - Create and vote on governance proposals
- **Quorum thresholds** - Configurable voting requirements
- **Voting periods** - Block-based voting windows

### Social Recovery
- **Guardian-based recovery** - Designate trusted addresses
- **Threshold signatures** - N-of-M guardians required
- **On-chain registry** - Recovery settings stored in blockchain

## Architecture

```
├── index.html                 # Main app with 3D visualization
├── app.js                     # Application logic
├── src/
│   ├── core/                  # Blockchain primitives
│   │   ├── Block.js           # Block structure with header/body
│   │   ├── BlockHeader.js     # SPV-compatible headers
│   │   ├── BlockBody.js       # Transaction container
│   │   ├── Chain.js           # Chain management + state
│   │   ├── Event.js           # Transaction types & roles
│   │   ├── MerkleTree.js      # Merkle proofs for SPV
│   │   ├── LightClient.js     # SPV light client support
│   │   └── Hasher.js          # SHA-256 hashing
│   ├── crypto/
│   │   ├── Keys.js            # Ed25519 key generation
│   │   ├── BIP39.js           # Mnemonic seed phrases
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

## Transaction Types

| Type | Description | Who Can Create |
|------|-------------|----------------|
| `NODE_JOIN` | Join the network | Anyone |
| `INSTITUTION_REGISTER` | Request to become an issuer | Any USER |
| `INSTITUTION_VERIFY` | Approve/reject institution | ROOT, GOVERNANCE_ADMIN |
| `INSTITUTION_REVOKE` | Remove institution status | ROOT |
| `SOULBOUND_MINT` | Issue non-transferable token | INSTITUTION only |
| `GOV_PROPOSAL` | Create governance proposal | Any role |
| `VOTE_CAST` | Vote on proposal | Any role |
| `SOCIAL_RECOVERY_UPDATE` | Set recovery guardians | Any USER |

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

### Institution Flow

```
1. First node joins → Gets ROOT role automatically (👑)

2. Organization joins → Gets USER role (👤)
   └── Clicks "Register as Institution"
   └── Submits: Name, Category, Description
   └── Creates INSTITUTION_REGISTER transaction

3. ROOT/ADMIN reviews in dashboard
   └── Approves → Creates INSTITUTION_VERIFY
   └── Organization now has INSTITUTION role (🏛️)

4. Institution can now mint soulbound tokens
   └── To other users only (not self)
   └── Recipients must exist in network
```

### Chain Sync

- Longest valid chain wins
- Unique NODE_JOIN events are merged across divergent chains
- All nodes eventually converge to the same chain state
- State is rebuilt from transactions when syncing

## Technical Stack

| Component | Technology |
|-----------|------------|
| Blockchain | Native JS + Web Crypto API |
| Storage | IndexedDB |
| P2P | WebRTC Data Channels |
| Signaling | WebSocket (Fly.io) |
| Crypto | Ed25519, SHA-256 |
| Merkle Trees | SHA-256 binary trees |
| Visualization | Three.js |

## API Reference

### Institution Management

```javascript
// Register as institution
await SrishtiApp.registerInstitution({
    name: "XYZ University",
    category: "EDUCATION",  // EDUCATION, CERTIFICATION, GOVERNMENT, EMPLOYER, HEALTHCARE, COMMUNITY
    description: "Premier engineering college"
});

// Verify institution (ROOT/ADMIN only)
await SrishtiApp.verifyInstitution("0xNodeId...", true);

// Revoke institution (ROOT only)
await SrishtiApp.revokeInstitution("0xNodeId...", "Reason");
```

### Soulbound Tokens

```javascript
// Mint credential (INSTITUTION only)
await SrishtiApp.mintSoulboundToken("0xRecipientId", {
    achievementId: "DEGREE_2026_CSE",
    title: "B.Tech Computer Science",
    description: "Bachelor of Technology",
    revocable: true
});

// Get your tokens
SrishtiApp.getSoulboundTokens();
```

### Governance

```javascript
// Create proposal
await SrishtiApp.createProposal({
    description: "Increase lab hours",
    votingPeriodBlocks: 5000,
    quorumThreshold: "20%"
});

// Cast vote
await SrishtiApp.castVote("PROP_123", "YES");

// Get active proposals
SrishtiApp.getActiveProposals();
```

### Social Recovery

```javascript
// Set up guardians
await SrishtiApp.updateSocialRecovery([
    "0xGuardian1",
    "0xGuardian2", 
    "0xGuardian3"
], 2);  // 2 of 3 required

// Check your account state
SrishtiApp.getAccountState();
```

### Role & Status

```javascript
// Check your role
SrishtiApp.getMyRole();  // "ROOT", "INSTITUTION", "USER", etc.

// Check if you're an institution
SrishtiApp.isInstitution();

// Check if you're ROOT
SrishtiApp.isRoot();

// Get all institutions
SrishtiApp.getInstitutions();
```

## Debug Commands

Open browser console:

```javascript
// View chain info
SrishtiApp.getChainInfo()

// Check connected peers
SrishtiApp.network?.peers?.size || 0

// View all nodes
SrishtiApp.getNodes()

// Download chain data
SrishtiApp.downloadChainData()

// Check your role
SrishtiApp.getMyRole()  // Should return "ROOT" for first node

// View all node roles
SrishtiApp.chain?.state?.nodeRoles

// Check pending institution requests (for ROOT users)
SrishtiApp.getPendingInstitutions()

// View all institutions (verified + pending)
SrishtiApp.getInstitutions()

// Debug: Force refresh chain state
SrishtiApp.chain?.state
```

## License

MIT

---

**Built for exploring decentralized coordination beyond money** 🌟
