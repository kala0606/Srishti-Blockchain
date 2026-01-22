# How to Reset the Chain

## 🚨 Network-Wide Reset (Recommended)

To reset the **entire network** so ALL nodes start fresh (old nodes become incompatible):

### Step 1: Increment CHAIN_EPOCH in `config.js`

```javascript
// In config.js, find and increment:
CHAIN_EPOCH: 2,  // Change from 1 to 2 (or increment by 1)
```

### Step 2: Commit and Deploy

```bash
git add config.js
git commit -m "Reset chain: increment CHAIN_EPOCH to X"
git push
```

### That's it!

When the new version deploys to GitHub Pages:
- ✅ All new visitors get a fresh network
- ✅ Old nodes with different epochs are automatically rejected
- ✅ No old data syncs to new nodes

---

## Quick Reset (Single Browser)

Paste this into your browser console:

```javascript
// Reset chain and reload page
(async function() {
    console.log('🔄 Resetting chain...');
    
    // Reset chain (will prompt for confirmation)
    const genesis = await SrishtiApp.resetChain({ 
        message: 'Srishti timeline begins - Fresh start'
    });
    
    if (genesis) {
        console.log('✅ Chain reset complete!');
        console.log('🔄 Reloading page in 2 seconds...');
        setTimeout(() => window.location.reload(), 2000);
    }
})();
```

## Manual Steps

1. Open browser console (F12)
2. Type: `await SrishtiApp.resetChain()`
3. Confirm the dialog
4. Refresh the page

## Clear Everything (Including Node Identity)

```javascript
// Clear chain + storage
await SrishtiApp.resetChain();

// Optionally clear node identity too
localStorage.clear();
window.location.reload();
```

## Verify Reset Worked

After reset, check:

```javascript
// Should show 1 block (genesis only)
SrishtiApp.chain?.getLength()

// Should show empty state
SrishtiApp.chain?.state
```

## Troubleshooting

If you still see old blocks:

1. **Check storage is cleared:**
   ```javascript
   // Should return empty array
   await SrishtiApp.storage.getAllBlocks()
   ```

2. **Force clear storage:**
   ```javascript
   await SrishtiApp.storage.clear()
   await SrishtiApp.chain.clearChain()
   ```

3. **Clear browser data:**
   - DevTools → Application → IndexedDB → Delete database
   - Or: Settings → Clear browsing data → Cached images and files
