/**
 * Srishti Blockchain - WebRTC Signaling Server
 * 
 * WebSocket server for exchanging WebRTC connection offers/answers
 * between peers. Deployed on Fly.io for P2P blockchain networking.
 */

const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// Server stats for monitoring
const stats = {
    startTime: Date.now(),
    totalConnections: 0,
    messagesForwarded: 0
};

// Create HTTP server with health check endpoint
const server = http.createServer((req, res) => {
    // Health check endpoint (used by Fly.io to keep server warm)
    if (req.url === '/' && req.method === 'GET') {
        const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            uptime: uptime,
            connections: nodes.size,
            totalConnections: stats.totalConnections,
            messagesForwarded: stats.messagesForwarded
        }));
        return;
    }
    
    // Reject non-WebSocket requests
    res.writeHead(426, { 'Upgrade': 'websocket' });
    res.end('Upgrade required');
});

// Create WebSocket server attached to HTTP server
const wss = new WebSocket.Server({ server });

console.log(`🚀 Srishti Signaling Server started on port ${PORT}`);

// Store connected nodes
const nodes = new Map(); // nodeId -> ws connection
const pendingOffers = new Map(); // nodeId -> [{ fromNodeId, offer, timestamp }]
const nodeLastSeen = new Map(); // nodeId -> timestamp (for cleanup)

wss.on('connection', (ws, req) => {
    let nodeId = null;
    
    stats.totalConnections++;
    console.log(`📡 New connection from ${req.socket.remoteAddress} (total: ${stats.totalConnections})`);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            switch (data.type) {
                case 'register':
                    // Node registers with the server
                    nodeId = data.nodeId;
                    
                    if (!nodeId) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'nodeId required'
                        }));
                        return;
                    }
                    
                    nodes.set(nodeId, ws);
                    nodeLastSeen.set(nodeId, Date.now());
                    console.log(`✅ Node registered: ${nodeId} (${nodes.size} total)`);
                    
                    // Send any pending offers for this node
                    if (pendingOffers.has(nodeId)) {
                        const offers = pendingOffers.get(nodeId);
                        for (const offerData of offers) {
                            ws.send(JSON.stringify({
                                type: 'offer',
                                fromNodeId: offerData.fromNodeId,
                                offer: offerData.offer
                            }));
                        }
                        pendingOffers.delete(nodeId);
                    }
                    
                    // Send list of other nodes to the new peer
                    const otherNodes = Array.from(nodes.keys()).filter(id => id !== nodeId);
                    ws.send(JSON.stringify({
                        type: 'registered',
                        nodeId: nodeId,
                        peers: otherNodes
                    }));
                    
                    // Notify ALL existing peers that a new peer has joined
                    for (const [existingNodeId, existingWs] of nodes.entries()) {
                        if (existingNodeId !== nodeId && existingWs.readyState === WebSocket.OPEN) {
                            existingWs.send(JSON.stringify({
                                type: 'peer_joined',
                                nodeId: nodeId
                            }));
                            console.log(`📢 Notified ${existingNodeId} about new peer ${nodeId}`);
                        }
                    }
                    break;
                    
                case 'offer':
                    // WebRTC offer - forward to target node
                    const targetNodeId = data.targetNodeId;
                    const targetWs = nodes.get(targetNodeId);
                    
                    if (!targetNodeId) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'targetNodeId required'
                        }));
                        return;
                    }
                    
                    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                        targetWs.send(JSON.stringify({
                            type: 'offer',
                            fromNodeId: nodeId,
                            offer: data.offer
                        }));
                        stats.messagesForwarded++;
                        console.log(`📤 Forwarded offer from ${nodeId} to ${targetNodeId}`);
                    } else {
                        // Store offer if target not connected yet (with timestamp for cleanup)
                        if (!pendingOffers.has(targetNodeId)) {
                            pendingOffers.set(targetNodeId, []);
                        }
                        pendingOffers.get(targetNodeId).push({
                            fromNodeId: nodeId,
                            offer: data.offer,
                            timestamp: Date.now()
                        });
                        console.log(`💾 Stored offer from ${nodeId} to ${targetNodeId} (target offline)`);
                        ws.send(JSON.stringify({
                            type: 'pending',
                            message: `Node ${targetNodeId} not connected, offer stored`
                        }));
                    }
                    break;
                    
                case 'answer':
                    // WebRTC answer - forward to target node
                    const answerTargetNodeId = data.targetNodeId;
                    const answerTargetWs = nodes.get(answerTargetNodeId);
                    
                    if (!answerTargetNodeId) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'targetNodeId required'
                        }));
                        return;
                    }
                    
                    if (answerTargetWs && answerTargetWs.readyState === WebSocket.OPEN) {
                        answerTargetWs.send(JSON.stringify({
                            type: 'answer',
                            fromNodeId: nodeId,
                            answer: data.answer
                        }));
                        stats.messagesForwarded++;
                        console.log(`📤 Forwarded answer from ${nodeId} to ${answerTargetNodeId}`);
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: `Node ${answerTargetNodeId} not connected`
                        }));
                    }
                    break;
                    
                case 'ice-candidate':
                    // ICE candidate - forward to target node
                    const candidateTargetNodeId = data.targetNodeId;
                    const candidateTargetWs = nodes.get(candidateTargetNodeId);
                    
                    if (!candidateTargetNodeId) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'targetNodeId required'
                        }));
                        return;
                    }
                    
                    if (candidateTargetWs && candidateTargetWs.readyState === WebSocket.OPEN) {
                        candidateTargetWs.send(JSON.stringify({
                            type: 'ice-candidate',
                            fromNodeId: nodeId,
                            candidate: data.candidate
                        }));
                        stats.messagesForwarded++;
                    }
                    break;
                    
                case 'ping':
                    // Heartbeat/ping - update last seen and respond
                    if (nodeId) {
                        nodeLastSeen.set(nodeId, Date.now());
                    }
                    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                    break;
                    
                default:
                    console.warn(`Unknown message type: ${data.type}`);
            }
        } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: error.message
            }));
        }
    });
    
    ws.on('close', () => {
        if (nodeId) {
            nodes.delete(nodeId);
            nodeLastSeen.delete(nodeId);
            console.log(`❌ Node disconnected: ${nodeId} (${nodes.size} remaining)`);
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
    
    // Send welcome message
    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to Srishti Signaling Server'
    }));
});

// Handle server errors
wss.on('error', (error) => {
    console.error('Server error:', error);
});

// Start HTTP server
server.listen(PORT, () => {
    console.log(`✅ HTTP server listening on port ${PORT}`);
    console.log(`✅ WebSocket server ready. Connect to ws://localhost:${PORT}`);
});

// =============================================================================
// Maintenance Intervals (keep server warm and clean up stale data)
// =============================================================================

// Clean up stale pending offers every 5 minutes
// Offers older than 2 minutes are removed (connection likely failed)
setInterval(() => {
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
    let cleanedCount = 0;
    
    for (const [targetNodeId, offers] of pendingOffers.entries()) {
        const validOffers = offers.filter(o => o.timestamp > twoMinutesAgo);
        const removed = offers.length - validOffers.length;
        
        if (removed > 0) {
            cleanedCount += removed;
            if (validOffers.length === 0) {
                pendingOffers.delete(targetNodeId);
            } else {
                pendingOffers.set(targetNodeId, validOffers);
            }
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} stale pending offers`);
    }
}, 5 * 60 * 1000); // Every 5 minutes

// Server-side ping to all connected clients every 30 seconds
// This keeps connections alive and helps detect disconnected clients
setInterval(() => {
    const now = Date.now();
    let pinged = 0;
    
    for (const [nodeId, ws] of nodes.entries()) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({ type: 'server_ping', timestamp: now }));
                pinged++;
            } catch (error) {
                console.error(`Failed to ping ${nodeId}:`, error);
            }
        }
    }
    
    if (pinged > 0) {
        console.log(`🏓 Pinged ${pinged} clients`);
    }
}, 30 * 1000); // Every 30 seconds

// Log stats every minute for monitoring
setInterval(() => {
    const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
    console.log(`📊 Stats: ${nodes.size} connections, ${stats.messagesForwarded} messages forwarded, uptime: ${uptime}s`);
}, 60 * 1000); // Every minute

// =============================================================================

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    wss.close(() => {
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
});
