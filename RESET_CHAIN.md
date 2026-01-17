# How to Reset the Chain

## Quick Reset (Browser Console)

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
