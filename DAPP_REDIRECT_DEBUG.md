# dApp Redirect Debugging Guide

## Issue: Redirect Not Happening After Login

If the redirect back to the dApp isn't happening after login, follow these steps:

## Debugging Steps

### 1. Check Browser Console

Open the browser console (F12) and look for these messages:

**Expected flow:**
```
🔐 dApp login requested: [return_url]
✅ Wallet Provider initialized for dApp authentication
✅ Returning user set: [name] ([nodeId])
🔍 Checking dApp redirect: {hasNodeId: true, hasKeyPair: true, hasPrivateKey: true, hasSessionAuth: true}
✅ Generating session token for dApp...
✅ Session token generated, redirecting to dApp...
```

**If you see:**
- `⏳ Waiting for credentials to load before redirecting to dApp...` - Credentials not loaded yet
- `❌ Failed to generate session token` - Error generating token
- Missing `hasPrivateKey: true` - Private key not loaded

### 2. Check sessionStorage

In browser console, run:
```javascript
sessionStorage.getItem('dapp_return_url')
```

Should show the return URL if dApp login was requested.

### 3. Check Credentials

In browser console, run:
```javascript
console.log({
    nodeId: window.SrishtiApp?.nodeId,
    hasKeyPair: !!window.SrishtiApp?.keyPair,
    hasPrivateKey: !!window.SrishtiApp?.keyPair?.privateKey,
    hasSessionAuth: !!window.SrishtiSessionAuth
});
```

All should be `true` for redirect to work.

### 4. Manual Redirect Test

If credentials are loaded but redirect didn't happen, manually trigger it:

```javascript
const dappReturnUrl = sessionStorage.getItem('dapp_return_url');
if (dappReturnUrl && window.SrishtiApp && window.SrishtiApp.nodeId && window.SrishtiApp.keyPair && window.SrishtiApp.keyPair.privateKey && window.SrishtiSessionAuth) {
    const dAppOrigin = new URL(dappReturnUrl).origin;
    const token = await window.SrishtiSessionAuth.generateToken(
        window.SrishtiApp.nodeId,
        window.SrishtiApp.keyPair.privateKey,
        { expiresIn: 24 * 60 * 60, dAppOrigin: dAppOrigin }
    );
    const returnUrlObj = new URL(dappReturnUrl);
    returnUrlObj.searchParams.set('session_token', token);
    window.location.href = returnUrlObj.toString();
}
```

## Common Issues

### Issue 1: Private Key Not Loading

**Symptom:** `hasPrivateKey: false` in console

**Cause:** Private key import failed (corrupted key)

**Solution:**
1. Clear localStorage:
   ```javascript
   localStorage.removeItem('srishti_private_key');
   localStorage.removeItem('srishti_public_key');
   ```
2. Re-login on main app
3. Try dApp login again

### Issue 2: SessionAuth Not Loaded

**Symptom:** `hasSessionAuth: false` in console

**Cause:** Auth scripts not loaded

**Solution:**
1. Check that `src/auth/SessionAuth.js` is loaded
2. Check browser console for script loading errors
3. Verify the script path is correct

### Issue 3: Return URL Not Stored

**Symptom:** `sessionStorage.getItem('dapp_return_url')` returns `null`

**Cause:** dApp login request not detected

**Solution:**
1. Check URL has `?dapp_login=true&return_url=...`
2. Check that the code stores it in sessionStorage
3. Try accessing the main app directly with those params

### Issue 4: Redirect Happens But Token Invalid

**Symptom:** Redirect happens but dApp shows authentication failed

**Cause:** Token verification failing

**Solution:**
1. Check token in URL: `?session_token=...`
2. Check dApp console for verification errors
3. Verify public key is on chain for your nodeId

## Testing Flow

1. **Clear everything:**
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   ```

2. **Open attendance app:**
   - Should redirect to main app with `?dapp_login=true&return_url=...`

3. **On main app:**
   - Check console for dApp login messages
   - Log in or register
   - Should automatically redirect back

4. **On attendance app:**
   - Should receive token in URL
   - Should authenticate and show your institution

## Quick Fix Script

If redirect isn't happening, run this in main app console:

```javascript
(async () => {
    const dappReturnUrl = sessionStorage.getItem('dapp_return_url');
    if (!dappReturnUrl) {
        console.log('❌ No dApp return URL found');
        return;
    }
    
    if (!window.SrishtiApp || !window.SrishtiApp.nodeId || !window.SrishtiApp.keyPair || !window.SrishtiApp.keyPair.privateKey) {
        console.log('❌ Credentials not loaded:', {
            hasApp: !!window.SrishtiApp,
            hasNodeId: !!window.SrishtiApp?.nodeId,
            hasKeyPair: !!window.SrishtiApp?.keyPair,
            hasPrivateKey: !!window.SrishtiApp?.keyPair?.privateKey
        });
        return;
    }
    
    if (!window.SrishtiSessionAuth) {
        console.log('❌ SessionAuth not loaded');
        return;
    }
    
    try {
        console.log('🔄 Generating token...');
        const dAppOrigin = new URL(dappReturnUrl).origin;
        const token = await window.SrishtiSessionAuth.generateToken(
            window.SrishtiApp.nodeId,
            window.SrishtiApp.keyPair.privateKey,
            { expiresIn: 24 * 60 * 60, dAppOrigin: dAppOrigin }
        );
        
        console.log('✅ Token generated, redirecting...');
        sessionStorage.removeItem('dapp_return_url');
        const returnUrlObj = new URL(dappReturnUrl);
        returnUrlObj.searchParams.set('session_token', token);
        window.location.href = returnUrlObj.toString();
    } catch (error) {
        console.error('❌ Error:', error);
    }
})();
```
