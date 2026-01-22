# How Sessions Work - For Students and Institutions

## Overview

Sessions are stored using a **hybrid on-chain/off-chain** approach:
- **On-chain**: Session proof (ID, hash, essential metadata)
- **Off-chain**: Full session details (stored locally in IndexedDB)

## How It Works

### For Institutions (Creating Sessions)

1. **Create Session**:
   - Full session data stored in local IndexedDB
   - On-chain event created with:
     - Session ID (ref)
     - Data hash (for verification)
     - Essential metadata (title, description, location, geofence, times)

2. **Session is Broadcast**:
   - On-chain event is added to blockchain
   - All nodes sync the blockchain
   - Other nodes see the SESSION_CREATE event

### For Students (Viewing and Marking Attendance)

1. **Discover Sessions**:
   - Queries on-chain events for `SESSION_CREATE`
   - For each event, checks local IndexedDB for full session data
   - **If missing**: Reconstructs session from on-chain metadata
   - Stores reconstructed session locally for future use

2. **View Active Sessions**:
   - Shows all active sessions (from on-chain + local data)
   - Displays: title, description, location, time, geofence info

3. **Mark Attendance**:
   - Validates session is active
   - Checks geofence if required
   - Creates attendance record (off-chain)
   - Submits proof on-chain

## Data Flow

```
Institution creates session
    ↓
Store in IndexedDB (off-chain)
    ↓
Submit SESSION_CREATE event (on-chain)
    ↓
Blockchain syncs to all nodes
    ↓
Student queries on-chain events
    ↓
Reconstructs session from metadata
    ↓
Stores locally for future use
    ↓
Student can mark attendance
```

## What's Included in On-Chain Metadata

To ensure students can see sessions, the following is included in on-chain metadata:

- ✅ `title` - Session title
- ✅ `description` - Session description  
- ✅ `startTime` - When session starts
- ✅ `endTime` - When session ends (if set)
- ✅ `location` - Location description
- ✅ `geofence` - Full geofence data (lat, lng, radius)

This allows students to:
- See all active sessions
- View session details
- Mark attendance with location verification

## Important Notes

1. **Chain Sync Required**: Students need to sync with the blockchain to see new sessions
2. **Automatic Discovery**: Sessions are automatically discovered from on-chain events
3. **No P2P Data Sync Needed**: All essential data is in on-chain metadata
4. **Privacy**: Full attendance records stay off-chain (only hashes on-chain)

## Troubleshooting

### "No active sessions available"

**Possible causes:**
1. Chain not synced - Wait for blockchain to sync
2. No sessions created yet - Institutions need to create sessions
3. All sessions ended - Check if sessions have end times

**Solution:**
- Wait a few seconds for chain sync
- Refresh the "Mark Attendance" tab
- Check that institutions have created sessions

### "Session not found" when marking attendance

**Cause:** Session data not in local store and not in on-chain events

**Solution:**
- Wait for blockchain to sync
- Refresh the page
- Check that the session was successfully created on-chain

### Geofence validation fails

**Cause:** Geofence data missing or incomplete

**Solution:**
- Session metadata should include full geofence
- If missing, the session creator needs to recreate the session
- Check browser console for geofence data

## Testing

1. **As Institution:**
   - Create a session
   - Check it appears in "My Sessions"
   - Verify on-chain event was created (check console)

2. **As Student:**
   - Open attendance app
   - Go to "Mark Attendance" tab
   - Should see the session created by institution
   - Click "Mark Attendance"
   - Should successfully mark attendance

## Future Improvements

1. **P2P Data Sync**: Request full session data from creator if metadata is incomplete
2. **Real-time Updates**: Notify students when new sessions are created
3. **Session Discovery**: Filter/search sessions by institution, location, etc.
4. **QR Codes**: Generate QR codes for sessions for easy access
