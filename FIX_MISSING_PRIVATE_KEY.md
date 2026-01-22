# Fix: Missing Private Key Issue

## Quick Fix

If you're seeing "no privateKey found", your private key is missing or corrupted. Here's how to fix it:

### Option 1: Clear and Create New Account (Fastest)

1. **Open browser console** (F12 or Cmd+Option+C)
2. **Run this command:**
   ```javascript
   localStorage.removeItem('srishti_private_key');
   localStorage.removeItem('srishti_public_key');
   // Keep nodeId and nodeName if you want to remember which account you had
   ```
3. **Refresh the page**
4. **Create a new account** (the old one will still exist on chain, but you'll have a new identity)

### Option 2: Clear Everything and Start Fresh

```javascript
// Clear all blockchain data
localStorage.clear();
sessionStorage.clear();
// Then refresh and create new account
```

### Option 3: Use Recovery (If Available)

If you saved your recovery phrase:
1. Click "Recover Account" 
2. Enter your 12-word recovery phrase
3. Note: This will find your node but won't restore the private key (limitation of current system)

## Why This Happens

Private keys in localStorage can be lost due to:
- Browser clearing storage
- Storage corruption
- Browser updates
- Privacy mode
- Storage quota limits

## Prevention

The session token system we built prevents this for dApps - they don't need private keys!

For the main app, we've added:
- Key validation before saving
- IndexedDB backup restore
- Better error messages

But localStorage is still unreliable. Consider:
- Using recovery phrases (save them!)
- Creating new accounts when keys are lost
- Using the session token system for dApps

## After Fixing

Once you have a valid private key:
1. You can use the main blockchain app normally
2. You can use dApps via session tokens (no private key needed in dApps)
3. Make sure to save your recovery phrase!
