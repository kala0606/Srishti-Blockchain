# Srishti Blockchain - Deployment Guide

## Signaling Server (Fly.io)

The signaling server is deployed and running at:
- **Production URL**: `wss://srishti-signaling.fly.dev`
- **Local Development**: `ws://localhost:8080`

### Deployed Components

1. **Signaling Server** (`signaling-server/`)
   - WebSocket server for WebRTC signaling
   - Deployed to Fly.io
   - Handles peer discovery and connection offers/answers

### App Configuration

The blockchain app automatically uses the correct signaling URL:
- **HTTPS sites** (production): `wss://srishti-signaling.fly.dev`
- **HTTP sites** (local dev): `ws://localhost:8080`
- **Custom URL**: Set `window.SRISHTI_SIGNALING_URL` before initialization

### Testing the Deployment

1. **Deploy your blockchain app** to GitHub Pages or another static host
2. **Open the app** on multiple devices/browsers
3. **Create nodes** on each device
4. **Scan QR codes** to connect devices
5. **Verify** that chains sync between devices

### Signaling Server Commands

```bash
# View logs
cd signaling-server
fly logs

# Check status
fly status

# Restart server
fly apps restart srishti-signaling

# Scale server
fly scale count 2
```

### Troubleshooting

- **Connection issues**: Check Fly.io logs with `fly logs`
- **WebSocket errors**: Verify HTTPS is being used (required for WebRTC)
- **No peers connecting**: Ensure signaling server is running and accessible
