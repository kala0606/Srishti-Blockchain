/**
 * Srishti Blockchain - WebSocket Relay Server
 * 
 * Full P2P message relay server. All peer communication flows through
 * this server (no WebRTC). Simpler, more reliable than WebRTC for
 * small-to-medium scale networks.
 * 
 * Message Types:
 * - register: Node joins the network
 * - relay: Forward message to specific peer(s)
 * - broadcast: Forward message to all peers
 * - ping/pong: Keep-alive
 */

const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// Server stats for monitoring
const stats = {
    startTime: Date.now(),
    totalConnections: 0,
    messagesRelayed: 0,
    messagesBroadcast: 0
};

// Create HTTP server with health check endpoint
const server = http.createServer((req, res) => {
    if (req.url === '/' && req.method === 'GET') {
        const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            version: '2.0.0',
            transport: 'websocket-relay',
            uptime: uptime,
            connections: nodes.size,
            totalConnections: stats.totalConnections,
            messagesRelayed: stats.messagesRelayed,
            messagesBroadcast: stats.messagesBroadcast
        }));
        return;
    }
    
    res.writeHead(426, { 'Upgrade': 'websocket' });
    res.end('Upgrade required');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

console.log(`🚀 Srishti Relay Server v2.0 (WebSocket-only P2P)`);

// Connected nodes
const nodes = new Map(); // nodeId -> { ws, lastSeen, chainLength, chainEpoch }

/**
 * Send message to a specific node
 */
function sendToNode(nodeId, message) {
    const node = nodes.get(nodeId);
    if (node && node.ws.readyState === WebSocket.OPEN) {
        try {
            node.ws.send(JSON.stringify(message));
            return true;
        } catch (e) {
            console.error(`Failed to send to ${nodeId}:`, e.message);
            return false;
        }
    }
    return false;
}

/**
 * Broadcast message to all nodes except sender
 */
function broadcast(message, excludeNodeId = null) {
    let count = 0;
    for (const [nodeId, node] of nodes.entries()) {
        if (nodeId !== excludeNodeId && node.ws.readyState === WebSocket.OPEN) {
            try {
                node.ws.send(JSON.stringify(message));
                count++;
            } catch (e) {
                console.error(`Failed to broadcast to ${nodeId}:`, e.message);
            }
        }
    }
    return count;
}

/**
 * Get list of online peers (excluding a specific node)
 */
function getOnlinePeers(excludeNodeId = null) {
    const peers = [];
    for (const [nodeId, node] of nodes.entries()) {
        if (nodeId !== excludeNodeId && node.ws.readyState === WebSocket.OPEN) {
            peers.push({
                nodeId: nodeId,
                chainLength: node.chainLength || 0,
                chainEpoch: node.chainEpoch || 1
            });
        }
    }
    return peers;
}

wss.on('connection', (ws, req) => {
    let nodeId = null;
    
    stats.totalConnections++;
    console.log(`📡 New connection from ${req.socket.remoteAddress}`);
    
    ws.on('message', (rawMessage) => {
        try {
            const data = JSON.parse(rawMessage.toString());
            
            switch (data.type) {
                // ═══════════════════════════════════════════════════════════════
                // REGISTRATION - Node joins the relay network
                // ═══════════════════════════════════════════════════════════════
                case 'register':
                    nodeId = data.nodeId;
                    
                    if (!nodeId) {
                        ws.send(JSON.stringify({ type: 'error', message: 'nodeId required' }));
                        return;
                    }
                    
                    // Store node info
                    nodes.set(nodeId, {
                        ws: ws,
                        lastSeen: Date.now(),
                        chainLength: data.chainLength || 0,
                        chainEpoch: data.chainEpoch || 1
                    });
                    
                    console.log(`✅ Node registered: ${nodeId} (epoch: ${data.chainEpoch || 1}, ${nodes.size} total)`);
                    
                    // Send confirmation with peer list
                    const peers = getOnlinePeers(nodeId);
                    ws.send(JSON.stringify({
                        type: 'registered',
                        nodeId: nodeId,
                        peers: peers,
                        serverTime: Date.now()
                    }));
                    
                    // Notify all other peers about new node
                    broadcast({
                        type: 'peer_joined',
                        nodeId: nodeId,
                        chainLength: data.chainLength || 0,
                        chainEpoch: data.chainEpoch || 1
                    }, nodeId);
                    break;
                
                // ═══════════════════════════════════════════════════════════════
                // RELAY - Forward message to specific peer(s)
                // ═══════════════════════════════════════════════════════════════
                case 'relay':
                    if (!nodeId) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Not registered' }));
                        return;
                    }
                    
                    const targetNodeId = data.targetNodeId;
                    const payload = data.payload;
                    
                    if (!targetNodeId || !payload) {
                        ws.send(JSON.stringify({ type: 'error', message: 'targetNodeId and payload required' }));
                        return;
                    }
                    
                    // Forward the payload to target, adding sender info
                    const relayMessage = {
                        type: 'message',
                        fromNodeId: nodeId,
                        payload: payload
                    };
                    
                    const sent = sendToNode(targetNodeId, relayMessage);
                    if (sent) {
                        stats.messagesRelayed++;
                    } else {
                        // Target not connected - notify sender
                        ws.send(JSON.stringify({
                            type: 'peer_offline',
                            nodeId: targetNodeId
                        }));
                    }
                    break;
                
                // ═══════════════════════════════════════════════════════════════
                // BROADCAST - Forward message to all peers
                // ═══════════════════════════════════════════════════════════════
                case 'broadcast':
                    if (!nodeId) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Not registered' }));
                        return;
                    }
                    
                    const broadcastPayload = data.payload;
                    if (!broadcastPayload) {
                        ws.send(JSON.stringify({ type: 'error', message: 'payload required' }));
                        return;
                    }
                    
                    // Broadcast to all peers
                    const broadcastMessage = {
                        type: 'message',
                        fromNodeId: nodeId,
                        payload: broadcastPayload
                    };
                    
                    const count = broadcast(broadcastMessage, nodeId);
                    stats.messagesBroadcast += count;
                    break;
                
                // ═══════════════════════════════════════════════════════════════
                // UPDATE - Node updates its state (chain length, etc)
                // ═══════════════════════════════════════════════════════════════
                case 'update':
                    if (!nodeId) return;
                    
                    const node = nodes.get(nodeId);
                    if (node) {
                        node.lastSeen = Date.now();
                        if (data.chainLength !== undefined) node.chainLength = data.chainLength;
                        if (data.chainEpoch !== undefined) node.chainEpoch = data.chainEpoch;
                    }
                    break;
                
                // ═══════════════════════════════════════════════════════════════
                // GET_PEERS - Request current peer list
                // ═══════════════════════════════════════════════════════════════
                case 'get_peers':
                    if (!nodeId) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Not registered' }));
                        return;
                    }
                    
                    ws.send(JSON.stringify({
                        type: 'peers',
                        peers: getOnlinePeers(nodeId)
                    }));
                    break;
                
                // ═══════════════════════════════════════════════════════════════
                // PING - Keep-alive
                // ═══════════════════════════════════════════════════════════════
                case 'ping':
                    if (nodeId) {
                        const n = nodes.get(nodeId);
                        if (n) n.lastSeen = Date.now();
                    }
                    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                    break;
                
                case 'pong':
                    // Response to server ping
                    if (nodeId) {
                        const n = nodes.get(nodeId);
                        if (n) n.lastSeen = Date.now();
                    }
                    break;
                
                default:
                    console.warn(`Unknown message type: ${data.type} from ${nodeId || 'unregistered'}`);
            }
        } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    });
    
    ws.on('close', () => {
        if (nodeId) {
            nodes.delete(nodeId);
            console.log(`❌ Node disconnected: ${nodeId} (${nodes.size} remaining)`);
            
            // Notify other peers
            broadcast({
                type: 'peer_left',
                nodeId: nodeId
            });
        }
    });
    
    ws.on('error', (error) => {
        console.error(`WebSocket error for ${nodeId || 'unknown'}:`, error.message);
    });
    
    // Welcome message
    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to Srishti Relay Server v2.0',
        serverTime: Date.now()
    }));
});

// Start server
server.listen(PORT, () => {
    console.log(`✅ Relay server listening on port ${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
});

// =============================================================================
// Maintenance
// =============================================================================

// Ping all clients every 30 seconds
setInterval(() => {
    const now = Date.now();
    for (const [nodeId, node] of nodes.entries()) {
        if (node.ws.readyState === WebSocket.OPEN) {
            try {
                node.ws.send(JSON.stringify({ type: 'server_ping', timestamp: now }));
            } catch (e) {
                console.error(`Failed to ping ${nodeId}`);
            }
        }
    }
}, 30 * 1000);

// Clean up stale connections every minute
setInterval(() => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [nodeId, node] of nodes.entries()) {
        if (node.lastSeen < fiveMinutesAgo) {
            console.log(`🧹 Cleaning stale node: ${nodeId}`);
            node.ws.close();
            nodes.delete(nodeId);
        }
    }
}, 60 * 1000);

// Log stats every minute
setInterval(() => {
    const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
    console.log(`📊 ${nodes.size} nodes | ${stats.messagesRelayed} relayed | ${stats.messagesBroadcast} broadcast | uptime: ${uptime}s`);
}, 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    
    // Notify all clients
    broadcast({ type: 'server_shutdown' });
    
    wss.close(() => {
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
});
