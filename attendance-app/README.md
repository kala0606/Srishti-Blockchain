# Srishti Attendance App

A standalone decentralized attendance management application built on the Srishti blockchain.

## 📁 What's Included

```
attendance-app/
├── index.html          # Main app page
├── app.js             # Attendance app UI logic
├── sdk/               # SDK files (copied from main repo)
│   ├── SrishtiSDK.js
│   ├── AppDataStore.js
│   └── apps/
│       └── attendance/
│           └── AttendanceApp.js
└── README.md          # This file
```

## 🚀 Deployment Options

### Option 1: Deploy to Separate GitHub Pages Repository

1. **Create a new GitHub repository** (e.g., `srishti-attendance-app`)

2. **Copy the attendance-app folder contents** to the new repository:
   ```bash
   # From the main Srishti-Blockchain directory
   cp -r attendance-app/* /path/to/new-repo/
   ```

3. **Update the blockchain URL** in `index.html`:
   ```javascript
   // Change this line in index.html:
   const SRISHTI_BLOCKCHAIN_URL = 'https://your-username.github.io/Srishti-Blockchain/';
   ```
   Replace `your-username` with your GitHub username.

4. **Enable GitHub Pages** in your repository settings:
   - Go to Settings → Pages
   - Select source branch (usually `main` or `master`)
   - Save

5. **Your app will be available at:**
   ```
   https://your-username.github.io/srishti-attendance-app/
   ```

### Option 2: Deploy as Subdirectory of Main Repo

If you want to host both the main blockchain and attendance app together:

1. **Keep the attendance-app folder** in your main repository

2. **Update the blockchain URL** in `attendance-app/index.html`:
   ```javascript
   // Use relative path:
   const SRISHTI_BLOCKCHAIN_URL = '../';
   ```

3. **Your app will be available at:**
   ```
   https://your-username.github.io/Srishti-Blockchain/attendance-app/
   ```

### Option 3: Deploy to Custom Domain

1. **Set up your custom domain** (e.g., `attendance.yourdomain.com`)

2. **Update the blockchain URL** to point to your main blockchain deployment:
   ```javascript
   const SRISHTI_BLOCKCHAIN_URL = 'https://blockchain.yourdomain.com/';
   ```

3. **Deploy** using your preferred hosting (Netlify, Vercel, etc.)

## ⚙️ Configuration

### Setting the Blockchain URL

Edit `index.html` and find this section:

```javascript
// Option A: Load from parent directory (if hosting together)
const SRISHTI_BLOCKCHAIN_URL = '../';

// Option B: Load from GitHub Pages deployment
// const SRISHTI_BLOCKCHAIN_URL = 'https://your-username.github.io/Srishti-Blockchain/';

// Option C: Load from CDN
// const SRISHTI_BLOCKCHAIN_URL = 'https://cdn.example.com/srishti-blockchain/';
```

Uncomment and set the appropriate option.

## 🔧 How It Works

1. **Loads blockchain core** from the main Srishti deployment
2. **Initializes connection** to the blockchain network
3. **Uses SDK** to interact with attendance app events
4. **Stores data** off-chain (IndexedDB) with on-chain proofs

## 📱 Features

### For Institutions:
- ✅ Create attendance sessions
- ✅ Set geofencing for location verification
- ✅ View session attendees
- ✅ Verify/reject attendance
- ✅ Bulk verify all pending
- ✅ Issue attendance certificates

### For Students:
- ✅ View active sessions
- ✅ Mark attendance with location
- ✅ View attendance history
- ✅ View earned certificates

## 🔐 Requirements

- **Institution Role**: To create sessions, you must be a verified institution on the blockchain
- **Network Connection**: Must be connected to the Srishti blockchain network
- **Browser Support**: Modern browser with IndexedDB support

## 🐛 Troubleshooting

### "Failed to load blockchain"
- Check that the `SRISHTI_BLOCKCHAIN_URL` is correct
- Ensure the main blockchain is deployed and accessible
- Check browser console for specific errors

### "Only verified institutions can create sessions"
- You need to register as an institution on the main blockchain
- Go to the main blockchain app and register as an institution
- Wait for ROOT/GOVERNANCE to verify your institution status

### "No active sessions available"
- Sessions are created by institutions
- Make sure you're connected to the same blockchain network
- Check if any institutions have created sessions

## 📝 Notes

- **Data Storage**: Attendance data is stored locally in IndexedDB
- **On-Chain**: Only proofs and hashes are stored on-chain
- **Privacy**: Location data stays off-chain unless you choose to include it in metadata
- **Certificates**: Issued as soulbound tokens on the blockchain

## 🔗 Links

- Main Blockchain: [Srishti Blockchain](https://github.com/your-username/Srishti-Blockchain)
- SDK Documentation: See `../sdk/README.md`

## 📄 License

Same as main Srishti Blockchain project.

---

**Happy Deploying! 🚀**
