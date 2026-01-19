
import { io, Socket } from 'socket.io-client';
import { CubeElement, Vector3 } from '../types';

// const SERVER_URL = 'http://localhost:3001'; // Dev
const SERVER_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/api/multiplayer'; // Adjust for prod if needed

export interface RemoteCursor {
    position: { x: number, y: number, z: number };
    color: string;
    userName: string;
    timestamp: number;
}

class MultiplayerService {
    private socket: Socket | null = null;
    private roomId: string | null = null;

    // Callbacks
    public onRemoteUpdate: ((cubes: CubeElement[]) => void) | null = null;
    public onRemoteCursors: ((cursors: Record<string, RemoteCursor>) => void) | null = null;

    connect(roomId: string, userName: string) {
        if (this.socket) this.disconnect();

        this.socket = io(SERVER_URL);
        this.roomId = roomId;

        this.socket.on('connect', () => {
            console.log('Connected to multiplayer server');
            this.socket?.emit('join_room', roomId);
        });

        this.socket.on('init_state', (cubes: CubeElement[]) => {
            console.log('Received init state:', cubes.length);
            if (this.onRemoteUpdate && cubes.length > 0) this.onRemoteUpdate(cubes);
        });

        this.socket.on('remote_update_cubes', (cubes: CubeElement[]) => {
            // console.log('Remote update received');
            if (this.onRemoteUpdate) this.onRemoteUpdate(cubes);
        });

        this.socket.on('remote_cursors', (cursors: Record<string, RemoteCursor>) => {
            if (this.onRemoteCursors) this.onRemoteCursors(cursors);
        });
    }

    sendUpdate(cubes: CubeElement[]) {
        if (!this.socket || !this.roomId) return;
        this.socket.emit('update_cubes', { roomId: this.roomId, cubes });
    }

    sendCursor(position: Vector3, color: string, userName: string) {
        if (!this.socket || !this.roomId) return;
        this.socket.emit('cursor_move', { roomId: this.roomId, position, color, userName });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}

export const multiplayer = new MultiplayerService();
