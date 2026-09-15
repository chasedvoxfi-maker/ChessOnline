import { Peer, type DataConnection } from "peerjs";
import type { PieceColor, PieceType } from "../game/types";

export type NetMessage =
  | { kind: "move"; from: string; to: string; promotion?: PieceType }
  | { kind: "resign" }
  | { kind: "rematchRequest" }
  | { kind: "rematchAccept" }
  | { kind: "chat"; text: string };

interface OnlineSessionEvents {
  connected: () => void;
  disconnected: () => void;
  message: (msg: NetMessage) => void;
  error: (message: string) => void;
}

const ROOM_ID_PREFIX = "chessonline-room-";

function randomRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

/** Peer-to-peer online play over WebRTC via the public PeerJS broker — no game server needed. */
export class OnlineSession {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private listeners: { [K in keyof OnlineSessionEvents]: OnlineSessionEvents[K][] } = {
    connected: [],
    disconnected: [],
    message: [],
    error: [],
  };
  myColor: PieceColor = "w";
  roomCode = "";

  on<K extends keyof OnlineSessionEvents>(event: K, cb: OnlineSessionEvents[K]) {
    this.listeners[event].push(cb);
  }

  private emit<K extends keyof OnlineSessionEvents>(event: K, ...args: Parameters<OnlineSessionEvents[K]>) {
    for (const cb of this.listeners[event]) (cb as (...a: unknown[]) => void)(...args);
  }

  async hostGame(): Promise<string> {
    this.myColor = "w";
    this.roomCode = randomRoomCode();
    return new Promise((resolve, reject) => {
      this.peer = new Peer(ROOM_ID_PREFIX + this.roomCode);
      this.peer.on("open", () => resolve(this.roomCode));
      this.peer.on("error", (err) => {
        this.emit("error", this.describeError(err));
        reject(err);
      });
      this.peer.on("connection", (conn) => {
        this.conn = conn;
        this.wireConnection(conn);
      });
    });
  }

  async joinGame(code: string): Promise<void> {
    this.myColor = "b";
    this.roomCode = code.trim().toUpperCase();
    return new Promise((resolve, reject) => {
      this.peer = new Peer();
      this.peer.on("open", () => {
        const conn = this.peer!.connect(ROOM_ID_PREFIX + this.roomCode, { reliable: true });
        this.conn = conn;
        this.wireConnection(conn);
        conn.on("open", () => resolve());
        conn.on("error", () => reject(new Error("connection-failed")));
      });
      this.peer.on("error", (err) => {
        this.emit("error", this.describeError(err));
        reject(err);
      });
    });
  }

  private wireConnection(conn: DataConnection) {
    conn.on("open", () => this.emit("connected"));
    conn.on("data", (data) => this.emit("message", data as NetMessage));
    conn.on("close", () => this.emit("disconnected"));
    conn.on("error", () => this.emit("disconnected"));
  }

  private describeError(err: { type?: string }): string {
    switch (err.type) {
      case "peer-unavailable":
        return "Комната не найдена. Проверьте код.";
      case "network":
        return "Ошибка сети. Проверьте подключение к интернету.";
      case "unavailable-id":
        return "Не удалось создать комнату, попробуйте ещё раз.";
      default:
        return "Не удалось подключиться. Попробуйте ещё раз.";
    }
  }

  send(msg: NetMessage) {
    if (this.conn?.open) this.conn.send(msg);
  }

  sendMove(from: string, to: string, promotion?: PieceType) {
    this.send({ kind: "move", from, to, promotion });
  }

  close() {
    this.conn?.close();
    this.peer?.destroy();
    this.conn = null;
    this.peer = null;
  }
}
