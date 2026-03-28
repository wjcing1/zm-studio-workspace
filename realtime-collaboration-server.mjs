import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import WebSocket, { WebSocketServer } from "ws";
import {
  applyBoardPayloadToDoc,
  readBoardPayloadFromDoc,
} from "./scripts/shared/workspace-collaboration.js";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_QUERY_AWARENESS = 3;
const DOC_ORIGIN_API = Symbol("doc-api");
const DOC_ORIGIN_BOOT = Symbol("doc-boot");

function createBoardNotFoundError(boardId) {
  const error = new Error(`Unknown board: ${boardId}`);
  error.code = "BOARD_NOT_FOUND";
  return error;
}

function safeSend(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(payload);
  }
}

function encodeSyncUpdate(update) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

function encodeAwareness(awareness, clientIds) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, clientIds));
  return encoding.toUint8Array(encoder);
}

function encodeQueryAwareness() {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_QUERY_AWARENESS);
  return encoding.toUint8Array(encoder);
}

export function createRealtimeCollaborationServer({
  boardStore,
  config,
  persistDelayMs = 240,
} = {}) {
  const wss = new WebSocketServer({ noServer: true });
  const realtimeEnabled = Boolean(config?.features?.realtime);
  const realtimeEndpoint = config?.endpoints?.realtime || "/api/collaboration/ws";
  const rooms = new Map();

  function broadcast(room, payload, exclude = null) {
    for (const socket of room.connections) {
      if (socket === exclude) continue;
      safeSend(socket, payload);
    }
  }

  async function persistRoom(room) {
    if (room.persistTimer) {
      clearTimeout(room.persistTimer);
      room.persistTimer = null;
    }

    const payload = readBoardPayloadFromDoc(room.doc, {
      fallback: room.lastPersistedBoard || room.seedBoard || { key: room.boardId },
    });
    const saved = await boardStore.saveBoard(room.boardId, payload);
    room.lastPersistedBoard = saved.board;
    return saved;
  }

  function schedulePersist(room) {
    if (room.persistTimer) {
      clearTimeout(room.persistTimer);
    }

    room.persistTimer = setTimeout(() => {
      void persistRoom(room).catch((error) => {
        console.warn(error instanceof Error ? error.message : `Unable to persist board ${room.boardId}.`);
      });
    }, persistDelayMs);
  }

  async function loadRoom(boardId) {
    if (rooms.has(boardId)) {
      const existing = rooms.get(boardId);
      await existing.ready;
      return existing;
    }

    const room = {
      boardId,
      doc: new Y.Doc(),
      awareness: null,
      connections: new Set(),
      persistTimer: null,
      seedBoard: null,
      lastPersistedBoard: null,
      ready: null,
    };

    room.awareness = new awarenessProtocol.Awareness(room.doc);
    room.doc.on("update", (update, origin) => {
      if (origin === DOC_ORIGIN_BOOT) {
        return;
      }

      broadcast(room, encodeSyncUpdate(update), origin);
      schedulePersist(room);
    });

    room.awareness.on("update", ({ added, updated, removed }, origin) => {
      const changedClients = [...added, ...updated, ...removed];
      if (changedClients.length === 0) return;

      if (origin?.awarenessClientIds instanceof Set) {
        for (const clientId of added) {
          origin.awarenessClientIds.add(clientId);
        }

        for (const clientId of updated) {
          if (room.awareness.getStates().has(clientId)) {
            origin.awarenessClientIds.add(clientId);
          }
        }

        for (const clientId of removed) {
          origin.awarenessClientIds.delete(clientId);
        }
      }

      broadcast(room, encodeAwareness(room.awareness, changedClients), origin);
    });

    room.ready = (async () => {
      const snapshot = await boardStore.getBoard(boardId);
      if (!snapshot?.board) {
        throw createBoardNotFoundError(boardId);
      }

      room.seedBoard = snapshot.board;
      room.lastPersistedBoard = snapshot.board;
      applyBoardPayloadToDoc(room.doc, snapshot.board, {
        origin: DOC_ORIGIN_BOOT,
        includeCamera: true,
      });
    })();

    rooms.set(boardId, room);

    try {
      await room.ready;
      return room;
    } catch (error) {
      rooms.delete(boardId);
      room.doc.destroy();
      throw error;
    }
  }

  async function getBoard(boardId) {
    if (!realtimeEnabled) {
      return boardStore.getBoard(boardId);
    }

    let room;
    try {
      room = await loadRoom(boardId);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "BOARD_NOT_FOUND") {
        return null;
      }
      throw error;
    }

    return {
      board: readBoardPayloadFromDoc(room.doc, {
        fallback: room.lastPersistedBoard || room.seedBoard || { key: boardId },
      }),
      persistence: {
        provider: boardStore.provider,
        source: room.lastPersistedBoard ? "realtime" : "seed",
      },
    };
  }

  async function saveBoard(boardId, input) {
    if (!realtimeEnabled) {
      return boardStore.saveBoard(boardId, input);
    }

    const room = await loadRoom(boardId);

    applyBoardPayloadToDoc(
      room.doc,
      {
        ...(room.lastPersistedBoard || room.seedBoard || { key: boardId }),
        ...input,
        key: boardId,
      },
      {
        origin: DOC_ORIGIN_API,
        includeCamera: true,
      },
    );

    return persistRoom(room);
  }

  async function attachConnection(socket, boardId) {
    const room = await loadRoom(boardId);

    socket.boardId = boardId;
    socket.awarenessClientIds = new Set();
    room.connections.add(socket);

    safeSend(socket, encodeQueryAwareness());

    const currentClients = Array.from(room.awareness.getStates().keys());
    if (currentClients.length > 0) {
      safeSend(socket, encodeAwareness(room.awareness, currentClients));
    }

    socket.on("message", (data) => {
      const payload = data instanceof Uint8Array ? data : new Uint8Array(data);
      const decoder = decoding.createDecoder(payload);
      const encoder = encoding.createEncoder();
      const messageType = decoding.readVarUint(decoder);

      try {
        if (messageType === MESSAGE_SYNC) {
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, socket);

          const reply = encoding.toUint8Array(encoder);
          if (reply.length > 1) {
            safeSend(socket, reply);
          }
          return;
        }

        if (messageType === MESSAGE_AWARENESS) {
          const awarenessUpdate = decoding.readVarUint8Array(decoder);
          awarenessProtocol.applyAwarenessUpdate(room.awareness, awarenessUpdate, socket);
          return;
        }

        if (messageType === MESSAGE_QUERY_AWARENESS) {
          const clientIds = Array.from(room.awareness.getStates().keys());
          if (clientIds.length > 0) {
            safeSend(socket, encodeAwareness(room.awareness, clientIds));
          }
        }
      } catch (error) {
        console.warn(error instanceof Error ? error.message : `Unable to apply realtime update for ${boardId}.`);
      }
    });

    const cleanup = () => {
      room.connections.delete(socket);

      if (socket.awarenessClientIds?.size) {
        awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(socket.awarenessClientIds), socket);
        socket.awarenessClientIds.clear();
      }
    };

    socket.on("close", cleanup);
    socket.on("error", cleanup);
  }

  function parseBoardId(requestUrl, requestHost = "127.0.0.1") {
    if (!requestUrl) return null;

    const url = new URL(requestUrl, `http://${requestHost}`);
    const prefix = realtimeEndpoint.endsWith("/") ? realtimeEndpoint.slice(0, -1) : realtimeEndpoint;

    if (!url.pathname.startsWith(`${prefix}/`)) {
      return null;
    }

    const boardId = decodeURIComponent(url.pathname.slice(prefix.length + 1)).trim();
    return boardId || null;
  }

  function handleUpgrade(request, socket, head) {
    if (!realtimeEnabled) {
      socket.destroy();
      return false;
    }

    const boardId = parseBoardId(request.url, request.headers.host || "127.0.0.1");
    if (!boardId) {
      return false;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      void attachConnection(ws, boardId).catch((error) => {
        if (error && typeof error === "object" && "code" in error && error.code === "BOARD_NOT_FOUND") {
          ws.close(1008, `Board ${boardId} not found`);
          return;
        }

        ws.close(1011, "Realtime collaboration failed");
      });
    });

    return true;
  }

  function close() {
    for (const room of rooms.values()) {
      if (room.persistTimer) {
        clearTimeout(room.persistTimer);
      }

      for (const socket of room.connections) {
        socket.close();
      }

      room.doc.destroy();
    }

    rooms.clear();
    wss.close();
  }

  return {
    getBoard,
    saveBoard,
    handleUpgrade,
    close,
  };
}
