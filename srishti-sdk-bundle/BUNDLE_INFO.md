# Srishti SDK Bundle - Package Information

## 📦 Bundle Contents

This bundle contains everything needed to build dApps on the Srishti Blockchain.

### Core Files
- `loader.js` - Automatic dependency loader (use this!)
- `app.js` - Main blockchain app initializer
- `config.js` - Blockchain configuration
- `README.md` - Full documentation
- `QUICKSTART.md` - Quick start guide
- `package.json` - NPM package info
- `LICENSE` - MIT License

### Core Blockchain (`core/`)
- `core/` - Core blockchain classes (Block, Chain, Event, etc.)
- `crypto/` - Cryptographic utilities (Keys, BIP39, Recovery)
- `p2p/` - Peer-to-peer networking (Network, Protocol, WebSocket)
- `storage/` - IndexedDB storage (IndexedDBStore, ChainCache, ChainPruner)
- `consensus/` - Consensus mechanism (ProofOfParticipation)
- `ui/` - UI adapters (BlockchainAdapter, GlowCalculator)

### SDK (`sdk/`)
- `SrishtiSDK.js` - Main SDK class
- `AppDataStore.js` - Off-chain data storage
- `index.js` - SDK entry point
- `apps/attendance/` - Attendance app example

### Examples (`examples/`)
- `basic-example.html` - Simple SDK usage example
- `attendance-example.html` - Full attendance app example

## 📊 Statistics

- **Total JavaScript Files**: 34
- **Core Blockchain Files**: ~25
- **SDK Files**: 4
- **Example Files**: 2

## 🚀 Usage

### Simple (Recommended)
```html
<script src="loader.js"></script>
<script>
    window.addEventListener('srishti-sdk-ready', async () => {
        const sdk = await window.SrishtiSDKLoader.quickStart();
        // Use SDK...
    });
</script>
```

### Manual Loading
Load files in order:
1. Core blockchain files (from `core/`)
2. `config.js`
3. `app.js`
4. SDK files (from `sdk/`)

## 📝 File Structure

```
srishti-sdk-bundle/
├── loader.js              # Auto-loader (START HERE)
├── app.js                 # Blockchain initializer
├── config.js              # Configuration
├── README.md              # Full docs
├── QUICKSTART.md          # Quick start
├── package.json           # NPM info
├── LICENSE                # MIT License
├── core/                  # Blockchain core
│   ├── core/             # Core classes
│   ├── crypto/           # Crypto utilities
│   ├── p2p/              # P2P networking
│   ├── storage/          # Storage
│   ├── consensus/        # Consensus
│   └── ui/               # UI adapters
├── sdk/                   # SDK
│   ├── SrishtiSDK.js
│   ├── AppDataStore.js
│   ├── index.js
│   └── apps/
│       └── attendance/
└── examples/              # Examples
    ├── basic-example.html
    └── attendance-example.html
```

## 🔧 Requirements

- Modern browser with:
  - Web Crypto API (HTTPS required)
  - IndexedDB support
  - WebRTC support (for P2P)

## 📦 Distribution

### Option 1: Direct Copy
Copy the entire `srishti-sdk-bundle` folder to your project.

### Option 2: CDN
Upload to a CDN and set:
```javascript
window.SRISHTI_SDK_BASE_URL = 'https://cdn.example.com/srishti-sdk/';
```

### Option 3: NPM (Future)
```bash
npm install @srishti/sdk-bundle
```

## ✅ What's Included

✅ Complete blockchain core  
✅ Full SDK with examples  
✅ Automatic loader  
✅ Documentation  
✅ Example apps  
✅ MIT License  
✅ NPM package.json  

## 🎯 For External Developers

This bundle is **everything** you need:
- No need to copy `src/` folder separately
- No need to copy `sdk/` folder separately
- Just use `loader.js` and you're ready!

## 📚 Documentation

- [README.md](README.md) - Full documentation
- [QUICKSTART.md](QUICKSTART.md) - Quick start guide
- [sdk/README.md](sdk/README.md) - SDK API reference
- [examples/](examples/) - Working examples

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**License**: MIT
