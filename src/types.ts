import { WebSocket } from 'ws';

export interface Client {
    id: string;
    ws: WebSocket;
}
