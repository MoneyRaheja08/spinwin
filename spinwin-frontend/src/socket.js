import { io } from "socket.io-client";
import { SOCKET_URL } from "./config";

export function makeSocket() {
  return io(SOCKET_URL, { transports: ["websocket", "polling"], autoConnect: true });
}
