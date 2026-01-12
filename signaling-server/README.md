# Srishti Signaling Server

WebRTC signaling server for Srishti Blockchain P2P networking.

## Deployment to Fly.io

### Prerequisites

1. Install Fly CLI:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. Login to Fly.io:
   ```bash
   fly auth login
   ```

### Deploy

1. Navigate to this directory:
   ```bash
   cd signaling-server
   ```

2. Create the app (first time only):
   ```bash
   fly apps create srishti-signaling
   ```

3. Deploy:
   ```bash
   fly deploy
   ```

4. Get the URL:
   ```bash
   fly status
   ```

You'll get a URL like: `wss://srishti-signaling.fly.dev`

## Usage

The signaling server accepts WebSocket connections and forwards WebRTC offers/answers between nodes.

### Message Types

- `register` - Register a node with the server
- `offer` - Forward WebRTC offer to target node
- `answer` - Forward WebRTC answer to target node
- `ice-candidate` - Forward ICE candidate to target node
- `ping` - Heartbeat/ping

## Local Development

```bash
npm install
npm start
```

Server runs on `ws://localhost:8080`
