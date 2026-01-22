# Quick Deployment Guide

## 🚀 Deploy to GitHub Pages (5 minutes)

### Step 1: Create New Repository
1. Go to GitHub and create a new repository (e.g., `srishti-attendance-app`)
2. Don't initialize with README (we already have one)

### Step 2: Upload Files
```bash
# Navigate to attendance-app folder
cd attendance-app

# Initialize git
git init
git add .
git commit -m "Initial commit: Srishti Attendance App"

# Add your GitHub repository
git remote add origin https://github.com/YOUR-USERNAME/srishti-attendance-app.git
git branch -M main
git push -u origin main
```

### Step 3: Configure Blockchain URL
1. Edit `index.html`
2. Find this line:
   ```javascript
   const SRISHTI_BLOCKCHAIN_URL = '../';
   ```
3. Change to your main blockchain URL:
   ```javascript
   const SRISHTI_BLOCKCHAIN_URL = 'https://YOUR-USERNAME.github.io/Srishti-Blockchain/';
   ```
4. Commit and push:
   ```bash
   git add index.html
   git commit -m "Update blockchain URL"
   git push
   ```

### Step 4: Enable GitHub Pages
1. Go to repository Settings → Pages
2. Select source: `main` branch
3. Select folder: `/ (root)`
4. Click Save

### Step 5: Access Your App
Your app will be live at:
```
https://YOUR-USERNAME.github.io/srishti-attendance-app/
```

## ✅ Done!

Your attendance app is now live and connected to the Srishti blockchain!

## 🔧 Troubleshooting

**App shows "Failed to connect"**
- Check that your main blockchain is deployed and accessible
- Verify the blockchain URL in `index.html` is correct
- Check browser console for errors

**"Only institutions can create sessions"**
- You need to register as an institution on the main blockchain first
- Go to your main blockchain app and register
- Wait for verification by ROOT/GOVERNANCE

---

**Need help?** Check the main README.md for more details.
