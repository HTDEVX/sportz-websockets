import WebSocket, { WebSocketServer } from 'ws';
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

    wss.on('connection', (socket) => {
        sendJson(socket, { type: 'connected' });

        socket.on('error', (err) => console.error);

    });

    function broadcastMatchCreated(match) {
        broadcast(wss, { type: 'match_created', match });
    }

    return { broadcastMatchCreated};
}