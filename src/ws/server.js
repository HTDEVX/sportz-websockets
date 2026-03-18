import WebSocket, { WebSocketServer } from 'ws';
import { wsArcjet } from '../arcjet.js';

function sendJson(socket, payload) {
    if (socket.readyState !== WebSocket.OPEN)  return;
    
    socket.send(JSON.stringify(payload));
}

function broadcast(wss, payload) {
    wss.clients.forEach(client => {
        if (client.readyState !== WebSocket.OPEN)  return;
        sendJson(client, payload);
    });
}

export function createWebSocketServer(server) {

    const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 * 1024 });

    wss.on('connection', async (socket, req) => {
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
        sendJson(socket, { type: 'connected' });

        socket.on('error', (err) => console.error('WebSocket error:', err));

    });

    function broadcastMatchCreated(match) {
        broadcast(wss, { type: 'match_created', match });
    }

    return { broadcastMatchCreated};
}

// for i in {1..60}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/matches; done