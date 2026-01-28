# Srishti Blockchain - WebSocket Relay Server

P2P message relay server for the Srishti Blockchain network. 

## Architecture

All peer communication flows through this server (no WebRTC):

```
Node A ←→ Relay Server ←→ Node B
```

**Why WebSocket relay instead of WebRTC?**
- **Simpler**: No STUN/TURN servers, no ICE negotiation, no NAT traversal issues
- **More reliable**: Works through all firewalls and corporate networks
- **Easier debugging**: Standard WebSocket is well-understood
- **Good enough for scale**: Handles thousands of nodes easily

## Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `register` | Client → Server | Node joins network |
| `relay` | Client → Server → Client | Send message to specific peer |
| `broadcast` | Client → Server → All | Send message to all peers |
| `get_peers` | Client → Server | Request current peer list |
| `ping/pong` | Bidirectional | Keep-alive |

## Server Events

| Event | Description |
|-------|-------------|
| `registered` | Node successfully registered, includes peer list |
| `peer_joined` | New peer joined the network |
| `peer_left` | Peer disconnected |
| `message` | Relayed P2P message from another peer |

## Deployment

### Local Development

```bash
cd signaling-server
npm install
npm start
```

Server runs on `ws://localhost:8080`

### Production (Fly.io)

```bash
cd signaling-server
fly deploy
```

Production URL: `wss://srishti-signaling.fly.dev`

**Important:** For all nodes to see each other, the relay must run as a **single instance**. If you scale to multiple machines, each machine has its own in-memory peer list and nodes on different machines won't discover each other. Keep one machine: `fly scale count 1`.

## Health Check

```bash
curl https://srishti-signaling.fly.dev/
```

Returns:
```json
{
  "status": "ok",
  "version": "2.0.0",
  "transport": "websocket-relay",
  "uptime": 12345,
  "connections": 5,
  "messagesRelayed": 1234,
  "messagesBroadcast": 567
}
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `8080` | Server port |
| `CHAIN_EPOCH` | (none) | If set (e.g. `10`), only list and broadcast peers with this epoch. Hides old cached clients (pre-epoch) from the relay so they don’t appear in the space. Must match `CHAIN_EPOCH` in `config.js`. |

## Monitoring

Server logs stats every minute:
```
📊 5 nodes | 1234 relayed | 567 broadcast | uptime: 3600s
```
