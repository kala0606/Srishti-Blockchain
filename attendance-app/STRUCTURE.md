# Attendance App Structure

## Why No SDK Folder?

The attendance app **does not** have its own SDK folder because:

1. **SDK is a Framework**: The SDK (`sdk/` at root) is the framework for building dApps
2. **Attendance App Uses the SDK**: The attendance app loads the SDK from the main blockchain repo
3. **No Duplication**: Having a copy would create maintenance issues and confusion

## Current Structure

```
Srishti-Blockchain/
├── sdk/                          # SDK Framework (shared by all dApps)
│   ├── SrishtiSDK.js             # Core SDK
│   ├── AppDataStore.js           # Off-chain storage
│   └── apps/
│       └── attendance/
│           ├── AttendanceQRCode.js  # QR generation/verification
│           └── AttendanceApp.js     # Attendance library class
│
└── attendance-app/               # Attendance dApp (uses the SDK)
    ├── index.html                # UI (loads SDK from main repo)
    ├── app.js                    # UI logic
    └── README.md
```

## How It Works

The attendance app loads the SDK from the main blockchain repo (single source of truth):

```javascript
// In attendance-app/index.html
const SRISHTI_BLOCKCHAIN_URL = 'https://kala0606.github.io/Srishti-Blockchain/';

// SDK files loaded from main repo:
const sdkScripts = [
    'sdk/SrishtiSDK.js',
    'sdk/AppDataStore.js',
    'sdk/apps/attendance/AttendanceQRCode.js',
    'sdk/apps/attendance/AttendanceApp.js'
];
```

## Benefits

1. **Single Source of Truth**: SDK code lives in one place
2. **Easy Updates**: Update SDK once, all dApps benefit
3. **Clear Separation**: SDK = framework, attendance-app = application
4. **No Sync Issues**: No need to keep copies in sync

## Deployment

When deploying the attendance app separately:

1. **Option 1**: Deploy as subdirectory of main repo
   - SDK loads from parent directory
   - `SRISHTI_BLOCKCHAIN_URL = '../'`

2. **Option 2**: Deploy to separate repo
   - SDK loads from main blockchain deployment
   - `SRISHTI_BLOCKCHAIN_URL = 'https://...github.io/Srishti-Blockchain/'`

3. **Option 3**: Bundle SDK (for offline/standalone)
   - Copy SDK files into attendance-app (only if needed)
   - Update paths in `index.html`
   - **Not recommended** - creates duplication
