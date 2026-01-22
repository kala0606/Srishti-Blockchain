# Dynamic QR Code Attendance System

## Overview

This implementation adds a **dynamic QR code system** to prevent proxy attendance, as described in the Gemini conversation. The system uses time-based QR codes that change every 10 seconds and are signed by the professor's private key.

## Features

### 1. Dynamic QR Code Generation (Professors)
- **Time-based QR codes**: QR codes automatically refresh every 10 seconds
- **Signed messages**: Each QR code contains a signature from the professor's private key
- **One-time use**: QR codes expire after 30 seconds to prevent reuse
- **Physical presence proof**: Students must be physically present to scan the QR code

### 2. Student Registry
- **Wallet-to-Student ID mapping**: Link wallet addresses to student IDs
- **On-chain storage**: Registry is stored on-chain for cross-device sync
- **Easy identification**: Institutions can see student IDs in attendance records

### 3. QR Code Verification
- **Cryptographic verification**: QR codes are verified using the professor's public key from the blockchain
- **Timestamp validation**: Ensures QR codes are recent (within 30 seconds)
- **Session validation**: Verifies QR code is for the correct session

### 4. Enhanced Attendance Marking
- **QR code method** (recommended): Scan QR code to prove physical presence
- **Geofencing method** (alternative): Use GPS location as proof
- **Hybrid support**: Can use both methods together for extra security

## Architecture

### Components

1. **AttendanceQRCode.js**: Core QR code generation and verification module
   - Generates time-based signed QR codes
   - Verifies QR code signatures
   - Handles QR code expiration

2. **AttendanceApp.js** (Extended):
   - Student registry management
   - QR code generation for sessions
   - QR-based attendance marking
   - Verification logic

3. **UI Components**:
   - QR code display modal for professors
   - QR scanner for students
   - Student registration form

## Usage

### For Professors (Institutions)

1. **Create a Session**:
   ```javascript
   const sessionId = await attendanceApp.createSession({
       title: 'Blockchain 101 - Lecture 5',
       location: 'Room 301'
   });
   ```

2. **Start QR Code Generation**:
   ```javascript
   await attendanceApp.startQRGeneration(sessionId, (qrData) => {
       // QR code updated - refresh display
       updateQRDisplay(qrData);
   });
   ```

3. **Display QR Code**:
   - Click "Show QR Code" button on active session
   - QR code refreshes automatically every 10 seconds
   - Students scan this code to mark attendance

### For Students

1. **Register Student ID** (optional but recommended):
   ```javascript
   await attendanceApp.registerStudent('STU12345');
   ```

2. **Mark Attendance with QR Code**:
   - Click "Scan QR Code & Mark" on an active session
   - Scan the QR code displayed by the professor
   - Attendance is automatically marked with QR proof

3. **Mark Attendance with Location** (alternative):
   ```javascript
   navigator.geolocation.getCurrentPosition(async (pos) => {
       await attendanceApp.markAttendance(sessionId, {
           location: { lat: pos.coords.latitude, lng: pos.coords.longitude }
       });
   });
   ```

## Security Features

### Prevents Proxy Attendance

1. **Time-based QR codes**: QR codes change every 10 seconds, making it impossible to share a static QR code
2. **Cryptographic signatures**: Each QR code is signed by the professor's private key
3. **Expiration**: QR codes expire after 30 seconds
4. **One-time use**: Each QR code can only be used once per student

### Verification Process

When a student scans a QR code:

1. **Parse QR data**: Extract session ID, timestamp, nonce, and signature
2. **Verify timestamp**: Ensure QR code is recent (within 30 seconds)
3. **Get professor's public key**: Retrieve from blockchain
4. **Verify signature**: Validate signature using professor's public key
5. **Validate session**: Ensure QR code is for the correct session
6. **Check expiration**: Reject if QR code is too old

## Data Structure

### QR Code Data
```javascript
{
    sessionId: 'sess_abc123',
    professorNodeId: 'node_xyz789',
    timestamp: 1234567890000,  // Rounded to 10-second intervals
    nonce: 'base64-encoded-random',
    type: 'ATTENDANCE_QR',
    signature: 'base64-encoded-signature'
}
```

### Attendance Record (with QR proof)
```javascript
{
    id: 'sess_abc123_node_xyz789',
    sessionId: 'sess_abc123',
    studentId: 'STU12345',  // From registry
    walletAddress: 'node_xyz789',
    timestamp: Date.now(),
    qrProof: {
        timestamp: 1234567890000,
        nonce: 'base64-encoded-random',
        signature: 'base64-encoded-signature'
    },
    status: 'PENDING'
}
```

## Benefits

1. **Prevents Proxy Attendance**: Students must be physically present to scan QR code
2. **Immutable Records**: All attendance is recorded on blockchain
3. **Transparency**: Students can verify their attendance on-chain
4. **No Central Server**: Fully decentralized, no single point of failure
5. **Privacy**: Location data stays off-chain unless geofencing is used

## Future Enhancements

1. **Bluetooth Low Energy (BLE)**: Alternative to QR codes using beacons
2. **Biometric verification**: Add fingerprint/face recognition
3. **Multi-factor attendance**: Combine QR + location + biometric
4. **Attendance analytics**: Track attendance patterns and trends
5. **Automated certificates**: Auto-issue certificates for 90%+ attendance

## Technical Notes

- QR codes use Ed25519 signatures for cryptographic security
- QR code refresh interval: 10 seconds (configurable)
- QR code expiration: 30 seconds (configurable)
- Requires professor's private key for QR generation
- Works with session token authentication (dApps)

## Dependencies

- `SrishtiKeys`: For Ed25519 signing and verification
- `QRCode` or `QRCodeStyling`: For QR code visualization
- `QRScanner`: For scanning QR codes (optional, can use camera API)

---

**Implementation Date**: 2024
**Version**: 1.0.0
**Status**: ✅ Complete
