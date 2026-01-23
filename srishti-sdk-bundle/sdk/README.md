# Srishti SDK

**Build decentralized apps on the Srishti Blockchain without modifying the core.**

The Srishti SDK provides a clean interface for third-party developers to build applications on the Srishti blockchain. Apps store minimal proofs on-chain and keep full data off-chain for scalability.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       YOUR dApp                              │
├─────────────────────────────────────────────────────────────┤
│                     Srishti SDK                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ SrishtiSDK  │  │AppDataStore │  │ App-Specific SDKs   │  │
│  │  (Core)     │  │ (Off-Chain) │  │ (Attendance, etc.)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                  Srishti Blockchain                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  APP_EVENT (Generic dApp Events) + Core Events          ││
│  │  • Minimal proofs & hashes on-chain                     ││
│  │  • Full data stored off-chain (IndexedDB)               ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## 📦 Installation

Include the SDK files in your HTML after the main Srishti blockchain scripts:

```html
<!-- Main Srishti Blockchain (must be loaded first) -->
<script src="src/core/Event.js"></script>
<script src="src/core/Block.js"></script>
<!-- ... other core scripts ... -->

<!-- Srishti SDK -->
<script src="sdk/SrishtiSDK.js"></script>
<script src="sdk/AppDataStore.js"></script>
<script src="sdk/apps/attendance/AttendanceApp.js"></script>
<script src="sdk/index.js"></script>
```

## 🚀 Quick Start

### Initialize the SDK

```javascript
// Create and connect SDK
const sdk = new SrishtiSDK();
await sdk.connect();

console.log('Connected as:', sdk.nodeId);
console.log('Chain length:', sdk.getChainLength());
console.log('My role:', sdk.getNodeRole());
```

### Build a Simple App

```javascript
// Submit a custom app event
await sdk.submitAppEvent('my-app.v1', 'USER_ACTION', {
    ref: 'action_123',
    dataHash: await sdk.hashData({ details: 'my data' }),
    metadata: { actionType: 'click' }  // Keep minimal!
});

// Query events
const events = sdk.queryAppEvents('my-app.v1', 'USER_ACTION');
console.log('Found events:', events);

// Subscribe to new events
const unsubscribe = sdk.onAppEvent('my-app.v1', (event) => {
    console.log('New event:', event);
});
```

## 📱 Attendance App Example

The SDK includes a complete Attendance dApp as a reference implementation:

### For Institutions (Session Management)

```javascript
const sdk = new SrishtiSDK();
await sdk.connect();

// Create attendance app instance
const attendance = new SrishtiAttendanceApp(sdk);

// Create a session
const sessionId = await attendance.createSession({
    title: 'Blockchain 101 - Lecture 5',
    description: 'Introduction to consensus',
    location: 'Room 301, CS Building',
    geofence: { lat: 12.9716, lng: 77.5946, radius: 100 }  // 100m radius
});

// Later: verify attendance
const attendees = await attendance.getSessionAttendees(sessionId);
for (const attendee of attendees) {
    if (attendee.status === 'PENDING') {
        await attendance.verifyAttendance(sessionId, attendee.studentId, true);
    }
}

// Issue certificates
await attendance.issueCertificate(sessionId, studentId, {
    title: 'Blockchain 101 Attendance Certificate'
});
```

### For Students (Marking Attendance)

```javascript
const sdk = new SrishtiSDK();
await sdk.connect();

const attendance = new SrishtiAttendanceApp(sdk);

// Get active sessions
const sessions = await attendance.getActiveSessions();
console.log('Available sessions:', sessions);

// Mark attendance with location
navigator.geolocation.getCurrentPosition(async (pos) => {
    await attendance.markAttendance(sessionId, {
        location: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
        }
    });
});

// Check my attendance history
const history = await attendance.getMyAttendanceHistory();
console.log('My attendance:', history);

// Get my certificates
const certificates = attendance.getMyAttendanceCertificates();
```

## 🔧 API Reference

### SrishtiSDK

| Method | Description |
|--------|-------------|
| `connect()` | Connect to the blockchain |
| `submitAppEvent(appId, action, options)` | Submit an app event |
| `queryAppEvents(appId, action?, filters?)` | Query app events |
| `onAppEvent(appId, callback)` | Subscribe to events |
| `getAppStore(appId)` | Get off-chain data store |
| `hashData(data)` | SHA-256 hash of data |
| `generateId(prefix?)` | Generate unique ID |
| `getCurrentUser()` | Get current user info |
| `getNodeRole()` | Get user's role |
| `isInstitution()` | Check if institution |
| `getKarmaBalance()` | Get KARMA balance |

### AppDataStore

| Method | Description |
|--------|-------------|
| `put(id, data)` | Store/update record |
| `get(id)` | Get record by ID |
| `delete(id)` | Delete record |
| `getAll()` | Get all records |
| `query(indexName, value)` | Query by index |
| `filter(filterFn)` | Filter with custom function |
| `count()` | Count records |
| `clear()` | Clear all data |
| `setMeta(key, value)` | Store metadata |
| `getMeta(key, default?)` | Get metadata |
| `export()` | Export all data |
| `import(data, merge?)` | Import data |

### AttendanceApp

| Method | Description |
|--------|-------------|
| `createSession(options)` | Create attendance session |
| `endSession(sessionId)` | End session |
| `markAttendance(sessionId, options?)` | Mark attendance |
| `verifyAttendance(sessionId, studentId, approved?, reason?)` | Verify attendance |
| `bulkVerifyAll(sessionId)` | Verify all pending |
| `issueCertificate(sessionId, studentId, options?)` | Issue certificate |
| `getMySessions()` | Get my created sessions |
| `getSession(sessionId)` | Get session details |
| `getActiveSessions()` | Get active sessions |
| `getSessionAttendees(sessionId)` | Get session attendees |
| `getMyAttendance(sessionId)` | Get my attendance |
| `getMyAttendanceHistory()` | Get attendance history |
| `getMyAttendanceCertificates()` | Get my certificates |
| `getSessionStats(sessionId)` | Get session statistics |
| `getMyStats()` | Get my statistics |

## 📊 What Goes Where?

| Data Type | On-Chain | Off-Chain | Why |
|-----------|----------|-----------|-----|
| Event happened | ✅ | | Immutable proof |
| Event details | | ✅ | Large, privacy |
| Data hash | ✅ | | Verification |
| Full data | | ✅ | Scalability |
| Certificates | ✅ | | Credentials |

## 🏗️ Building Your Own App

1. **Define your app ID and actions:**

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
}
```

2. **Store data off-chain, proofs on-chain:**

```javascript
async createThing(data) {
    const id = this.sdk.generateId('thing');
    
    // Full data OFF-CHAIN
    await this.store.put(id, { ...data, id });
    
    // Proof ON-CHAIN
    await this.sdk.submitAppEvent(MyApp.APP_ID, MyApp.ACTIONS.CREATE, {
        ref: id,
        dataHash: await this.sdk.hashData(data),
        metadata: { title: data.title }  // Keep minimal!
    });
    
    return id;
}
```

3. **Query by combining on-chain and off-chain:**

```javascript
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
```

## 🔐 Security Considerations

- **On-chain data is public** - Don't store sensitive info
- **Off-chain data is local** - Sync separately if needed
- **Validate on-chain proofs** - Don't trust off-chain data alone
- **Use data hashes** - Verify off-chain data integrity

## 📝 License

MIT License - Build freely on Srishti!

---

**Happy Building! 🚀**

Questions? Issues? Contributions welcome.
