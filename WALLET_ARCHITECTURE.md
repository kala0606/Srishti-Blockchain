# Wallet-First Architecture

## Overview

The Srishti Blockchain has been redesigned with a **wallet-first architecture**. The main blockchain app now acts as a wallet that users must log into before accessing any features or dApps.

## Architecture Changes

### Before
- Users could access dApps directly
- dApps stored private keys in localStorage (security risk)
- No centralized wallet management
- Authentication was scattered across apps

### After
- **Main app = Wallet**: Users must log in to the main blockchain app first
- **dApps are launched from wallet**: All dApps are accessed through the wallet dashboard
- **Centralized authentication**: Wallet manages all credentials and signing
- **Session tokens**: dApps use session tokens, never store private keys

## Components

### 1. WalletManager (`src/auth/WalletManager.js`)
- Manages wallet authentication state
- Enforces login-first architecture
- Generates session tokens for dApps
- Launches dApps with authentication

### 2. Main Blockchain App (`index.html`)
- **Login screen first**: Shows onboarding modal if user is not authenticated
- **Dashboard**: After login, shows wallet dashboard with:
  - User stats (KARMA, network, etc.)
  - **dApp Browser**: Section to launch dApps
  - Network visualization
- **Wallet Provider**: Handles signature requests from dApps

### 3. dApps (e.g., Attendance App)
- **No private keys**: dApps never store private keys
- **Session tokens**: Authenticate using tokens from wallet
- **Wallet Provider**: Request signatures via postMessage
- **Launched from wallet**: Users access dApps through wallet dashboard

## User Flow

### First Time User
1. User opens main blockchain app
2. Sees login/onboarding screen (blocked from other features)
3. Creates account or recovers existing account
4. After login, sees wallet dashboard
5. Can launch dApps from dashboard

### Returning User
1. User opens main blockchain app
2. Wallet checks authentication state
3. If authenticated → shows dashboard immediately
4. If not authenticated → shows login screen
5. After login → can access dApps

### Using a dApp
1. User clicks dApp in wallet dashboard
2. Wallet generates session token
3. dApp opens in new window/tab with token
4. dApp verifies token and authenticates user
5. When dApp needs to sign transactions:
   - dApp requests signature from wallet via postMessage
   - Wallet signs and returns signature
   - Transaction is submitted

## Security Benefits

✅ **No private keys in dApps** - Much more secure
✅ **Centralized key management** - All keys in one place (wallet)
✅ **Session-based authentication** - Tokens expire after 24 hours
✅ **Wallet controls access** - Users must log in to wallet first
✅ **Signature requests** - dApps request signatures, never access keys directly

## Files Changed

1. **`src/auth/WalletManager.js`** (NEW)
   - Wallet state management
   - Authentication enforcement
   - dApp launching

2. **`index.html`**
   - Added WalletManager initialization
   - Added dApp browser section to dashboard
   - Updated login flow to mark users as authenticated
   - Enforced login-first check in initialization

3. **`attendance-app/`** (No changes needed)
   - Already uses session token authentication
   - Already uses WalletProvider for signatures
   - Works with new wallet architecture

## Migration Notes

- Existing users: No migration needed - existing credentials work
- dApps: Already compatible (use session tokens and WalletProvider)
- New dApps: Should follow the same pattern (session tokens + WalletProvider)

## Future Enhancements

- [ ] Add more dApps to the browser
- [ ] dApp discovery/registry
- [ ] dApp permissions management
- [ ] Multi-account support
- [ ] Hardware wallet integration
