
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for dev
        methods: ["GET", "POST"]
    }
});

// Store state in memory (for prototype)
const rooms = {}; // roomId -> { cubes: [], cursors: { socketId: {x,y,z, color} } }

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);

        // Initialize room if not exists
        if (!rooms[roomId]) {
            rooms[roomId] = { cubes: [], cursors: {} };
        }

        // Send current state to new user
        socket.emit('init_state', rooms[roomId].cubes);

        // Notify others
        socket.to(roomId).emit('user_joined', socket.id);
    });

    socket.on('update_cubes', ({ roomId, cubes }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].cubes = cubes;
        // Broadcast to everyone else in the room
        socket.to(roomId).emit('remote_update_cubes', cubes);
    });

    socket.on('cursor_move', ({ roomId, position, color, userName }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].cursors[socket.id] = { position, color, userName, timestamp: Date.now() };

        // Broadcast cursors
        socket.to(roomId).emit('remote_cursors', rooms[roomId].cursors);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Clean up cursor
        for (const roomId in rooms) {
            if (rooms[roomId].cursors[socket.id]) {
                delete rooms[roomId].cursors[socket.id];
                io.to(roomId).emit('remote_cursors', rooms[roomId].cursors);
            }
        }
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`PolyGen Multiplayer Server running on port ${PORT}`);
});
