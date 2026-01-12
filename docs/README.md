# Srishti Blockchain - QR Onboarding System

A beautiful 3D visualization for blockchain node onboarding using QR codes. Scan to join, share to grow your tree, and watch your network light up!

## Quick Start

### 1. Set Up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Enable **Realtime Database**:
   - Go to Build → Realtime Database
   - Click "Create Database"
   - Start in **test mode** for development
4. Get your config:
   - Go to Project Settings → General
   - Scroll to "Your apps" and click Web icon (</>)
   - Register your app and copy the config

### 2. Configure Firebase

Edit `firebase-config.js` and replace the placeholder values:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "https://your-project-default-rtdb.firebaseio.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};
```

### 3. Set Database Rules

In Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "nodes": {
      ".read": true,
      ".write": true,
      "$nodeId": {
        ".validate": "newData.hasChildren(['id', 'name', 'createdAt'])"
      }
    }
  }
}
```

> ⚠️ For production, add proper authentication rules!

### 4. Run the App

Simply open `index.html` in a browser, or serve it locally:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8000
```

Then visit `http://localhost:8000`

## Features

### 🔗 QR Code Onboarding
- Every user gets a unique QR code
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

### 🌐 Real-time Sync
- All nodes sync instantly across devices
- See who's online in real-time
- Watch new nodes appear as they join

## File Structure

```
space/
├── index.html          # Main app with 3D visualization
├── firebase-config.js  # Firebase setup & node CRUD
├── presence.js         # Online status tracking
├── glow-calculator.js  # "Lit" effect calculations
├── qr-generator.js     # QR code creation
├── qr-scanner.js       # Camera-based scanning
└── README.md           # This file
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
│           Firebase Realtime DB           │
│  ┌─────────────────────────────────┐    │
│  │ nodes/                          │    │
│  │   user_a: { children: [...] }   │    │
│  │   user_b: { parentId: user_a }  │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
        │
        │ Real-time sync
        ▼
┌─────────────────────────────────────────┐
│       3D Visualization (Three.js)        │
│  ┌───┐                                   │
│  │ A │──────┐                            │
│  └───┘      │                            │
│             ▼                            │
│           ┌───┐                          │
│           │ B │ (glowing = active)       │
│           └───┘                          │
└─────────────────────────────────────────┘
```

## Customization

### Glow Colors
Edit `glow-calculator.js` to change the color gradient:

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
Modify recruitment-based scaling:

```javascript
scale: 1 + (childrenScore * 0.3), // Up to 30% larger
```

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
- [Firebase](https://firebase.google.com/) - Real-time database
- [html5-qrcode](https://github.com/mebjas/html5-qrcode) - QR scanning
- [QRCode.js](https://davidshimjs.github.io/qrcodejs/) - QR generation

---

Made for the Srishti Blockchain project 🌟
