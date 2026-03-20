import WebSocket, { WebSocketServer } from 'ws';
import { wsArcjet } from '../arcjet.js';

const matchSubscribers = new Map(); // Map of matchId to Set of WebSocket clients subscribed to that match

function subscribeToMatch(socket, matchId) {
    if (!matchSubscribers.has(matchId)) {
        matchSubscribers.set(matchId, new Set());
    }
    matchSubscribers.get(matchId).add(socket);
}

function unsubscribeFromMatch(socket, matchId) {
    if (matchSubscribers.has(matchId)) {
        matchSubscribers.get(matchId).delete(socket);
        if (matchSubscribers.get(matchId).size === 0) {
            matchSubscribers.delete(matchId);
        }
    }
}

function cleanupSubscriptions(socket) {
    for (const [matchId, subscribers] of matchSubscribers.entries()) {
        if (subscribers.has(socket)) {
            subscribers.delete(socket);
            if (subscribers.size === 0) {
                matchSubscribers.delete(matchId);
            }
        }
    }
}

function broadcastToMatchSubscribers(matchId, payload) {
    if (matchSubscribers.has(matchId)) {
        for (const client of matchSubscribers.get(matchId)) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(payload));
            }
        }
    }
}

function handleMessage(socket, message) {
    let parsed;

    try {
        parsed = JSON.parse(message);
    } catch (error) {
        sendJson(socket, { type: 'error', message: 'Invalid JSON' });
        return;
    }

    // Handle different message types
    switch (parsed.type) {
        case 'subscribe':
            subscribeToMatch(socket, parsed.matchId);
            sendJson(socket, { type: 'subscribed', matchId: parsed.matchId });
            break;
        case 'unsubscribe':
            unsubscribeFromMatch(socket, parsed.matchId);
            sendJson(socket, { type: 'unsubscribed', matchId: parsed.matchId });
            break;
        default:
            sendJson(socket, { type: 'error', message: 'Unknown message type' });
    }
}

function sendJson(socket, payload) {
    if (socket.readyState !== WebSocket.OPEN)  return;
    
    socket.send(JSON.stringify(payload));
}

function broadcastToAll(wss, payload) {
    wss.clients.forEach(client => {
        if (client.readyState !== WebSocket.OPEN)  return;
        sendJson(client, payload);
    });
}

export function createWebSocketServer(server) {

    const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 * 1024 });

    wss.on('upgrade', async (socket, req) => {
        if (wsArcjet) {
            try {
                const decision = await wsArcjet.protect(req);

                if (decision.isDenied()) {
                    const code = decision.reason.isRateLimit() ? 1013 : 1008; // 1013 indicates that the connection is being closed due to rate limiting, while 1008 indicates a policy violation for other types of denials.
                    const reason = decision.reason.isRateLimit() ? 'Connection closed due to rate limiting' : 'Connection denied by security rules';

                    socket.close(code, reason); // 1008 indicates that the connection was closed due to a policy violation, which is appropriate for denied connections based on Arcjet's security rules.
                    return;
                }
            } catch (error) {
                socket.close(1011, 'Arcjet protection failed'); // 1011 indicates an internal error occurred, and the connection is being closed as a result.
                return;
            }
        }
    })

    wss.on('connection', async (socket, req) => {
        socket.isAlive = true;

        socket.on('pong', () => {
            socket.isAlive = true;
        });
        
        sendJson(socket, { type: 'connected' });

        socket.on('message', (message) => {
            handleMessage(socket, message);
        });

        socket.on('close', () => {
            cleanupSubscriptions(socket);
        });

        socket.on('error', (err) => {
            socket.terminate();
        });

    });

    const interval = setInterval(() => {
        wss.clients.forEach(socket => {
            if (!socket.isAlive) {
                return socket.terminate();
            }
            socket.isAlive = false;
            socket.ping();
        });
    }, 30000);

    wss.on('close', () => {
        clearInterval(interval);
    });

    function broadcastMatchCreated(match) {
        broadcastToAll(wss, { type: 'match_created', match });
    }

    function broadcastCommentaryAdded(matchId, comment) {
        broadcastToMatchSubscribers(matchId, { type: 'commentary', data: comment });
    }

    return { broadcastMatchCreated, broadcastCommentaryAdded };
}

// for i in {1..60}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/matches; done
