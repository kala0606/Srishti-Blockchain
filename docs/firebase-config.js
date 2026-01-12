/**
 * Srishti Blockchain - Firebase Configuration
 * 
 * This file handles Firebase initialization and provides
 * helper functions for node CRUD operations.
 */

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBq_IC9pfAk1ksEmgF4OZ7TgvN40nlUd4Y",
    authDomain: "srishti-2afa7.firebaseapp.com",
    databaseURL: "https://srishti-2afa7-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "srishti-2afa7",
    storageBucket: "srishti-2afa7.firebasestorage.app",
    messagingSenderId: "785315383130",
    appId: "1:785315383130:web:afc1218b1a9eb4b2071563",
    measurementId: "G-3LRZVM282H"
};

// Initialize Firebase
let app, database;

function initializeFirebase() {
    if (typeof firebase === 'undefined') {
        console.error('Firebase SDK not loaded');
        return false;
    }
    
    try {
        app = firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        console.log('🔥 Firebase initialized successfully');
        return true;
    } catch (error) {
        console.error('Firebase initialization error:', error);
        return false;
    }
}

// ============================================
// Node Data Model
// ============================================

/**
 * Generate a unique node ID
 */
function generateNodeId() {
    return 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Create a new node in the database
 * @param {Object} nodeData - Node properties
 * @returns {Promise<string>} - The created node's ID
 */
async function createNode(nodeData) {
    const nodeId = nodeData.id || generateNodeId();
    const node = {
        id: nodeId,
        name: nodeData.name || 'Anonymous',
        parentId: nodeData.parentId || null,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        lastSeen: firebase.database.ServerValue.TIMESTAMP,
        childCount: 0,
        isOnline: true
    };
    
    await database.ref(`nodes/${nodeId}`).set(node);
    
    // Increment parent's child count if this node has a parent
    if (node.parentId) {
        await incrementChildCount(node.parentId);
    }
    
    return nodeId;
}

/**
 * Get a node by ID
 * @param {string} nodeId 
 * @returns {Promise<Object|null>}
 */
async function getNode(nodeId) {
    const snapshot = await database.ref(`nodes/${nodeId}`).once('value');
    return snapshot.val();
}

/**
 * Update a node's properties
 * @param {string} nodeId 
 * @param {Object} updates 
 */
async function updateNode(nodeId, updates) {
    await database.ref(`nodes/${nodeId}`).update({
        ...updates,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
}

/**
 * Update last seen timestamp
 * @param {string} nodeId 
 */
async function updateLastSeen(nodeId) {
    await database.ref(`nodes/${nodeId}`).update({
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
}

/**
 * Increment a node's child count
 * @param {string} nodeId 
 */
async function incrementChildCount(nodeId) {
    const nodeRef = database.ref(`nodes/${nodeId}/childCount`);
    await nodeRef.transaction((currentCount) => {
        return (currentCount || 0) + 1;
    });
}

/**
 * Get all nodes from the database
 * @returns {Promise<Object>} - Object with node IDs as keys
 */
async function getAllNodes() {
    const snapshot = await database.ref('nodes').once('value');
    return snapshot.val() || {};
}

/**
 * Subscribe to real-time node updates
 * @param {Function} callback - Called with nodes object on each update
 * @returns {Function} - Unsubscribe function
 */
function subscribeToNodes(callback) {
    const nodesRef = database.ref('nodes');
    
    const listener = nodesRef.on('value', (snapshot) => {
        const nodes = snapshot.val() || {};
        callback(nodes);
    });
    
    // Return unsubscribe function
    return () => nodesRef.off('value', listener);
}

/**
 * Subscribe to a specific node's updates
 * @param {string} nodeId 
 * @param {Function} callback 
 * @returns {Function} - Unsubscribe function
 */
function subscribeToNode(nodeId, callback) {
    const nodeRef = database.ref(`nodes/${nodeId}`);
    
    const listener = nodeRef.on('value', (snapshot) => {
        callback(snapshot.val());
    });
    
    return () => nodeRef.off('value', listener);
}

/**
 * Transform flat nodes object into D3 hierarchy format
 * @param {Object} nodes - Flat object of nodes
 * @returns {Object} - Hierarchical tree structure
 */
function buildHierarchy(nodes) {
    const nodesArray = Object.values(nodes);
    
    if (nodesArray.length === 0) {
        return null;
    }
    
    // Find root node (no parent)
    const rootNodes = nodesArray.filter(n => !n.parentId);
    
    if (rootNodes.length === 0) {
        // If no root, use the oldest node as root
        nodesArray.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        rootNodes.push(nodesArray[0]);
    }
    
    // Build children map
    const childrenMap = {};
    nodesArray.forEach(node => {
        if (node.parentId) {
            if (!childrenMap[node.parentId]) {
                childrenMap[node.parentId] = [];
            }
            childrenMap[node.parentId].push(node);
        }
    });
    
    // Recursive function to build tree
    function buildTree(node) {
        const children = childrenMap[node.id] || [];
        return {
            ...node,
            name: node.name,
            children: children.length > 0 ? children.map(buildTree) : undefined
        };
    }
    
    // If multiple roots, create a virtual root
    if (rootNodes.length > 1) {
        return {
            id: 'srishti-root',
            name: 'Srishti',
            isVirtualRoot: true,
            children: rootNodes.map(buildTree)
        };
    }
    
    return buildTree(rootNodes[0]);
}

/**
 * Check if a node ID exists
 * @param {string} nodeId 
 * @returns {Promise<boolean>}
 */
async function nodeExists(nodeId) {
    const snapshot = await database.ref(`nodes/${nodeId}`).once('value');
    return snapshot.exists();
}

/**
 * Get the database reference for direct access
 * @returns {firebase.database.Database}
 */
function getDatabase() {
    return database;
}

// Export functions for use in other modules
window.SrishtiFirebase = {
    init: initializeFirebase,
    generateNodeId,
    createNode,
    getNode,
    updateNode,
    updateLastSeen,
    getAllNodes,
    subscribeToNodes,
    subscribeToNode,
    buildHierarchy,
    nodeExists,
    getDatabase
};
