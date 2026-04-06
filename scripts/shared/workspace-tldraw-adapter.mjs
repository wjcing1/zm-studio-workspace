import {
  createBoardSnapshot,
  resolveNodeHeight,
  sanitizeCanvasCamera,
  sanitizeCanvasEdges,
  sanitizeCanvasNodes,
} from "./workspace-board.js";

const PAGE_ID = "page:workspace";

function cloneValue(value) {
  if (typeof structuredClone === "function")
    return structuredClone(value);

  return JSON.parse(JSON.stringify(value));
}

function shapeRecordId(nodeId) {
  return `shape:${nodeId}`;
}

function arrowRecordId(edgeId) {
  return `arrow:${edgeId}`;
}

function assetRecordId(nodeId) {
  return `asset:${nodeId}`;
}

function nodeToRecord(node) {
  return {
    id: shapeRecordId(node.id),
    typeName: "shape",
    type: "zm-card",
    x: node.x,
    y: node.y,
    parentId: PAGE_ID,
    props: {
      nodeId: node.id,
      nodeType: node.type,
      w: node.w,
      h: resolveNodeHeight(node),
      payload: cloneValue(node),
    },
  };
}

function edgeToRecord(edge) {
  return {
    id: arrowRecordId(edge.id),
    typeName: "shape",
    type: "zm-arrow",
    parentId: PAGE_ID,
    props: {
      edgeId: edge.id,
      from: edge.from,
      to: edge.to,
      fromSide: edge.fromSide,
      toSide: edge.toSide,
      fromEnd: edge.fromEnd,
      toEnd: edge.toEnd,
      color: edge.color,
      label: edge.label || "",
    },
  };
}

function fileAssetRecord(node) {
  return {
    id: assetRecordId(node.id),
    typeName: "asset",
    type: "image",
    props: {
      src: node.file || node.content || "",
      mimeType: node.mimeType || "",
      fileKind: node.fileKind || "",
    },
  };
}

export function boardPayloadToTldrawSnapshot(board) {
  const snapshot = createBoardSnapshot(board);
  const records = {
    [PAGE_ID]: {
      id: PAGE_ID,
      typeName: "page",
      name: board?.title || "Workspace",
      meta: {
        key: board?.key || "workspace",
        title: board?.title || "",
        description: board?.description || "",
      },
    },
  };

  for (const node of snapshot.nodes) {
    records[shapeRecordId(node.id)] = nodeToRecord(node);

    if (node.type === "file")
      records[assetRecordId(node.id)] = fileAssetRecord(node);
  }

  for (const edge of snapshot.edges)
    records[arrowRecordId(edge.id)] = edgeToRecord(edge);

  return {
    meta: {
      key: board?.key || "workspace",
      title: board?.title || "",
      description: board?.description || "",
    },
    camera: sanitizeCanvasCamera(snapshot.camera),
    records,
  };
}

export function tldrawSnapshotToBoardPayload(snapshot, fallback = {}) {
  const records = snapshot?.records && typeof snapshot.records === "object" ? snapshot.records : {};
  const nodes = [];
  const edges = [];

  for (const record of Object.values(records)) {
    if (record?.typeName === "shape" && record.type === "zm-card" && record.props?.payload)
      nodes.push(record.props.payload);

    if (record?.typeName === "shape" && record.type === "zm-arrow" && record.props?.edgeId) {
      edges.push({
        id: record.props.edgeId,
        from: record.props.from,
        to: record.props.to,
        fromSide: record.props.fromSide,
        toSide: record.props.toSide,
        fromEnd: record.props.fromEnd,
        toEnd: record.props.toEnd,
        color: record.props.color,
        label: record.props.label || "",
      });
    }
  }

  return {
    key: fallback.key || snapshot?.meta?.key || "workspace",
    title: fallback.title || snapshot?.meta?.title || "Workspace",
    description: fallback.description || snapshot?.meta?.description || "",
    camera: sanitizeCanvasCamera(snapshot?.camera),
    nodes: sanitizeCanvasNodes(nodes),
    edges: sanitizeCanvasEdges(edges),
  };
}
