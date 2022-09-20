import * as http from 'http';
import * as WebSocket from 'ws';
import {DEFAULT_EMIT_PORT, emitInfo} from '.';

export enum EmitEventType {
  CONNECTED = 'connected',
  CLOSED = 'closed',
  MESSAGE = 'message',
  PRODUCT = 'product',
  CURRENCY = 'currency',
  RANKING = 'ranking',
}

interface EmitMessage {
  type: EmitEventType;
  data: Object;
  timestamp: string;
}

export class EmitServer {
  private static enabled: boolean = false;
  private static http: http.Server | undefined;
  private static socket: WebSocket.Server | undefined;

  /**
   * Initialized the Emit Server, but does not start it.
   */
  static init() {
    if (EmitServer.socket) throw new Error('emit server already initialized.');

    const server = http.createServer();
    EmitServer.http = server;
    EmitServer.socket = new WebSocket.Server({server});

    EmitServer.onConnect((client: WebSocket) => {
      const retMsg = EmitServer.createMessage(
        EmitEventType.CONNECTED,
        'You are now connected.',
      );
      EmitServer.send(client, retMsg);
    });
  }

  /**
   * If the server is initialized, it will start the server to begin accepting
   * new clients.
   */
  static enable() {
    if (!EmitServer.http || !EmitServer.socket || EmitServer.enabled) {
      throw new Error(
        `emit server already initialized or is missing information.`,
      );
    }

    EmitServer.http.listen(DEFAULT_EMIT_PORT, () => {
      emitInfo('server started.');
    });
    EmitServer.enabled = true;

    const sendTime = () => {
      if (!EmitServer.enabled) return;

      const sTime = EmitServer.createMessage(
        EmitEventType.MESSAGE,
        `Server time: ${new Date().toISOString()}`,
      );
      EmitServer.broadcast(sTime);
      setTimeout(sendTime, 30000);
    };
    sendTime();
  }

  /**
   * Disable the server, notifying clients of being disabled and lastly closing
   * the connection.
   */
  static disable() {
    if (!EmitServer.enabled || !EmitServer.socket) return;

    const closeMsg = EmitServer.createMessage(
      EmitEventType.CLOSED,
      'Server disabled.',
    );
    EmitServer.broadcast(closeMsg);
    EmitServer.socket.close();

    EmitServer.enabled = false;
    EmitServer.socket = undefined;
  }

  /**
   * An interface to allow other things register callbacks to pass information
   * when new messages arrive.
   */
  static onMessage(callback: (client: WebSocket) => void) {
    if (!EmitServer.socket) throw new Error('emit server is not initialized.');
    EmitServer.socket.on('message', callback);
  }

  /**
   * An interface to allow other things register callbacks to pass information
   * when new client connect.
   */
  static onConnect(callback: (client: WebSocket) => void) {
    if (!EmitServer.socket) throw new Error('emit server is not initialized.');
    EmitServer.socket.on('connection', callback);
  }

  /**
   * Sends a message to all clients currently connected.
   *
   * @param {EmitMessage} message - Message to be sent.
   */
  static broadcast(message: EmitMessage) {
    if (!EmitServer.socket) throw new Error('emit server is not initialized.');
    if (!EmitServer.enabled) throw new Error('emit server not enabled.');

    const msg = JSON.stringify(message);
    for (const c of EmitServer.socket.clients) {
      c.send(msg);
    }
  }

  /**
   * Sends a message to a singular client currently connected.
   *
   * @param {WebSocket} client - Client to contact.
   * @param {EmitMessage} message - Message to be sent.
   */
  static send(client: WebSocket, message: EmitMessage) {
    if (!EmitServer.socket) throw new Error('emit server is not initialized.');
    if (!EmitServer.enabled) throw new Error('emit server not enabled.');

    client.send(JSON.stringify(message));
  }

  /**
   * Creates a message based on information provided, so that it can be sent over
   * the socket and received by client(s).
   *
   * @param {EmitEventType} emitType - Type of event being sent.
   * @param {Object} emitData - Data to send over the websocket.
   * @returns {EmitMessage} Newly created message.
   */
  static createMessage(emitType: EmitEventType, emitData: Object): EmitMessage {
    return <EmitMessage>{
      type: emitType,
      data: emitData,
      timestamp: new Date().toISOString(),
    };
  }
}
