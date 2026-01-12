/**
 * Srishti Blockchain - WebRTC Signaling Server
 * 
 * WebSocket server for exchanging WebRTC connection offers/answers
 * between peers. Deployed on Fly.io for P2P blockchain networking.
 */

const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// Create HTTP server with health check endpoint
const server = http.createServer((req, res) => {
    // Health check endpoint
    if (req.url === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Srishti Signaling Server - OK');
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
const pendingOffers = new Map(); // nodeId -> [offers]

wss.on('connection', (ws, req) => {
    let nodeId = null;
    
    console.log(`📡 New connection from ${req.socket.remoteAddress}`);
    
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
                    console.log(`✅ Node registered: ${nodeId}`);
                    
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
                    
                    // Send list of other nodes
                    const otherNodes = Array.from(nodes.keys()).filter(id => id !== nodeId);
                    ws.send(JSON.stringify({
                        type: 'registered',
                        nodeId: nodeId,
                        peers: otherNodes
                    }));
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
                        console.log(`📤 Forwarded offer from ${nodeId} to ${targetNodeId}`);
                    } else {
                        // Store offer if target not connected yet
                        if (!pendingOffers.has(targetNodeId)) {
                            pendingOffers.set(targetNodeId, []);
                        }
                        pendingOffers.get(targetNodeId).push({
                            fromNodeId: nodeId,
                            offer: data.offer
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
                    }
                    break;
                    
                case 'ping':
                    // Heartbeat/ping
                    ws.send(JSON.stringify({ type: 'pong' }));
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
