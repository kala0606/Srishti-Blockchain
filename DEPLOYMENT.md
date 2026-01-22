# Srishti Blockchain - Deployment Guide

## P2P Architecture

The network uses **WebSocket relay** for all P2P communication:

```
Node A ←→ Relay Server ←→ Node B
```

**Why WebSocket relay instead of WebRTC?**
- **Simpler**: No STUN/TURN, no ICE negotiation, no NAT traversal
- **More reliable**: Works through all firewalls
- **Easier debugging**: Standard WebSocket protocol

## Relay Server (Fly.io)

The relay server is deployed and running at:
- **Production URL**: `wss://srishti-signaling.fly.dev`
- **Local Development**: `ws://localhost:8080`
- **Transport Version**: 2.0 (WebSocket Relay)

### Deployed Components

1. **Relay Server** (`signaling-server/`)
   - WebSocket server for P2P message relay
   - Deployed to Fly.io
   - Handles peer discovery and message forwarding

### App Configuration

The blockchain app automatically uses the correct relay URL:
- **HTTPS sites** (production): `wss://srishti-signaling.fly.dev`
- **HTTP sites** (local dev): `ws://localhost:8080`
- **Custom URL**: Set `window.SRISHTI_RELAY_URL` before initialization

### Testing the Deployment

1. **Deploy your blockchain app** to GitHub Pages or another static host
2. **Open the app** on multiple devices/browsers
3. **Create nodes** on each device
4. **Verify** that chains sync between devices automatically

### Relay Server Commands

```bash
# View logs
cd signaling-server
fly logs

# Check status
fly status

# Check health endpoint
curl https://srishti-signaling.fly.dev/

# Restart server
fly apps restart srishti-signaling

# Scale server
fly scale count 2
```

### Troubleshooting

- **Connection issues**: Check Fly.io logs with `fly logs`
- **WebSocket errors**: Verify HTTPS is being used
- **No peers connecting**: Ensure relay server is running and accessible
- **Check server health**: `curl https://srishti-signaling.fly.dev/` should return JSON status
