# Srishti SDK Bundle

**Complete developer bundle for building dApps on the Srishti Blockchain**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/your-repo)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## 🚀 Quick Start

### Option 1: Simple HTML (Recommended)

```html
<!DOCTYPE html>
<html>
<head>
    <title>My dApp</title>
</head>
<body>
    <h1>My dApp</h1>
    
    <!-- Load the SDK bundle -->
    <script src="loader.js"></script>
    
    <script>
        // Wait for SDK to be ready
        window.addEventListener('srishti-sdk-ready', async () => {
            // Initialize SDK
            const sdk = await window.SrishtiSDKLoader.quickStart();
            
            console.log('Connected as:', sdk.nodeId);
            console.log('Chain length:', sdk.getChainLength());
            
            // Your dApp code here
            // ...
        });
    </script>
</body>
</html>
```

### Option 2: Manual Loading

```html
<!-- Load core blockchain files -->
<script src="core/core/Event.js"></script>
<script src="core/core/Block.js"></script>
<!-- ... other core files ... -->
<script src="config.js"></script>
<script src="app.js"></script>

<!-- Load SDK -->
<script src="sdk/SrishtiSDK.js"></script>
<script src="sdk/AppDataStore.js"></script>
<script src="sdk/index.js"></script>

<script>
    // Initialize
    const app = new SrishtiApp();
    await app.init();
    
    const sdk = new SrishtiSDK();
    await sdk.connect();
</script>
```

## 📦 What's Included

- **Core Blockchain** (`core/`) - Full blockchain implementation
  - `core/` - Core blockchain classes (Block, Chain, Event, etc.)
  - `crypto/` - Cryptographic utilities
  - `p2p/` - Peer-to-peer networking
  - `storage/` - IndexedDB storage
  - `consensus/` - Consensus mechanism
  - `ui/` - UI adapters
  
- **SDK** (`sdk/`) - Developer-friendly API
  - `SrishtiSDK.js` - Main SDK class
  - `AppDataStore.js` - Off-chain data storage
  - `apps/attendance/` - Attendance app example
  
- **Config** (`config.js`) - Blockchain configuration
- **App** (`app.js`) - Main app initializer
- **Loader** (`loader.js`) - Automatic dependency loading
- **Examples** (`examples/`) - Sample dApps

## 📚 Documentation

- [SDK API Reference](sdk/README.md)
- [Building Your First dApp](examples/basic-example.html)
- [Attendance App Example](examples/attendance-example.html)

## 🏗️ Architecture

```
Your dApp
  ↓
Srishti SDK (sdk/)
  ↓
Srishti Blockchain (core/)
  ↓
P2P Network
```

## 🔧 Configuration

Set the base URL if files are in a different location:

```javascript
window.SRISHTI_SDK_BASE_URL = 'https://cdn.example.com/srishti-sdk/';
```

## 💻 Usage Examples

### Basic SDK Usage

```javascript
// Wait for SDK to load
window.addEventListener('srishti-sdk-ready', async () => {
    const sdk = await window.SrishtiSDKLoader.quickStart();
    
    // Submit an app event
    await sdk.submitAppEvent('my-app.v1', 'USER_ACTION', {
        ref: 'action_123',
        dataHash: await sdk.hashData({ details: 'my data' }),
        metadata: { actionType: 'click' }
    });
    
    // Query events
    const events = sdk.queryAppEvents('my-app.v1', 'USER_ACTION');
    console.log('Found events:', events);
    
    // Subscribe to new events
    const unsubscribe = sdk.onAppEvent('my-app.v1', (event) => {
        console.log('New event:', event);
    });
});
```

### Using App Data Store

```javascript
const sdk = await window.SrishtiSDKLoader.quickStart();
const store = sdk.getAppStore('my-app.v1');

// Store data off-chain
await store.put('record_123', {
    title: 'My Record',
    data: { /* large data object */ }
});

// Retrieve data
const record = await store.get('record_123');

// Query by index
const records = await store.query('title', 'My Record');
```

### Building Your Own App

```javascript
class MyApp {
    static APP_ID = 'myapp.v1';
    static ACTIONS = {
        CREATE: 'CREATE',
        UPDATE: 'UPDATE',
        DELETE: 'DELETE'
    };
    
    constructor(sdk) {
        this.sdk = sdk;
        this.store = sdk.getAppStore(MyApp.APP_ID);
    }
    
    async createThing(data) {
        const id = this.sdk.generateId('thing');
        
        // Full data OFF-CHAIN
        await this.store.put(id, { ...data, id });
        
        // Proof ON-CHAIN
        await this.sdk.submitAppEvent(MyApp.APP_ID, MyApp.ACTIONS.CREATE, {
            ref: id,
            dataHash: await this.sdk.hashData(data),
            metadata: { title: data.title }
        });
        
        return id;
    }
    
    async getMyThings() {
        const events = this.sdk.queryAppEvents(MyApp.APP_ID, MyApp.ACTIONS.CREATE, {
            sender: this.sdk.nodeId
        });
        
        const things = [];
        for (const event of events) {
            const data = await this.store.get(event.payload.ref);
            if (data) things.push(data);
        }
        return things;
    }
}

// Usage
window.addEventListener('srishti-sdk-ready', async () => {
    const sdk = await window.SrishtiSDKLoader.quickStart();
    const myApp = new MyApp(sdk);
    
    const id = await myApp.createThing({ title: 'My Thing' });
    const things = await myApp.getMyThings();
});
```

## 🔐 Security Considerations

- **On-chain data is public** - Don't store sensitive info
- **Off-chain data is local** - Sync separately if needed
- **Validate on-chain proofs** - Don't trust off-chain data alone
- **Use data hashes** - Verify off-chain data integrity

## 📋 Requirements

- Modern browser with:
  - Web Crypto API (HTTPS required in production)
  - IndexedDB support
  - WebRTC support (for P2P networking)

## 🚀 Deployment

### Option 1: Host Locally
Just copy the entire `srishti-sdk-bundle` folder to your web server.

### Option 2: CDN
Upload to a CDN and set `window.SRISHTI_SDK_BASE_URL` to your CDN URL.

### Option 3: NPM (Coming Soon)
```bash
npm install @srishti/sdk-bundle
```

## 📝 License

MIT License - See [LICENSE](LICENSE) file

## 🤝 Support

- GitHub Issues: [your-repo/issues](https://github.com/your-repo/issues)
- Documentation: [docs](https://your-docs-url)

## 🎯 Next Steps

1. Check out the [examples](examples/) folder
2. Read the [SDK documentation](sdk/README.md)
3. Build your first dApp!

---

**Happy Building! 🚀**
