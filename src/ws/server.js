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
    let matchId;

    try {
        parsed = JSON.parse(message);
    } catch (error) {
        sendJson(socket, { type: 'error', message: 'Invalid JSON' });
        return;
    }

    // Handle different message types
    switch (parsed.type) {
        case 'subscribe':
            matchId = String(parsed.matchId);
            subscribeToMatch(socket, matchId);
            sendJson(socket, { type: 'subscribed', matchId: matchId });
            break;
        case 'unsubscribe':
            matchId = String(parsed.matchId);
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

    const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

    server.on('upgrade', async (request, socket, head) => {
        if (new URL(request.url, 'ws://localhost').pathname !== '/ws') return;

        try {
            const decision = await wsArcjet.protect(request);
            if (decision.isDenied()) {
                const statusLine = decision.reason.isRateLimit()
                    ? 'HTTP/1.1 429 Too Many Requests\r\n\r\n'
                    : 'HTTP/1.1 403 Forbidden\r\n\r\n';
                socket.write(statusLine);
                socket.destroy();
                return;
            }
        } catch (error) {
            socket.destroy();
            return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });

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
