import { useEffect, useRef, useState } from "react";
import {
  BaseBoxShapeUtil,
  createBindingId,
  createShapeId,
  Editor,
  HTMLContainer,
  Rectangle2d,
  T,
  TLArrowShape,
  TLShape,
  Tldraw,
  toRichText,
  useEditor,
} from "tldraw";

type WorkspaceNode = {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h?: number | "auto";
  autoHeight?: number;
  content?: string;
  title?: string;
  desc?: string;
  tags?: string[];
  url?: string;
  label?: string;
  file?: string;
  mimeType?: string;
  fileKind?: string;
  size?: number;
};

type WorkspaceBoard = {
  key: string;
  title: string;
  description: string;
  camera?: {
    x: number;
    y: number;
    z: number;
  };
  defaultCamera?: {
    x: number;
    y: number;
    z: number;
  };
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
};

type WorkspaceEdge = {
  id: string;
  from: string;
  to: string;
  fromSide?: string;
  toSide?: string;
  fromEnd?: string;
  toEnd?: string;
  color?: string;
  label?: string;
};

type WorkspacePoint = {
  x: number;
  y: number;
};

type WorkspaceClipboardPayload = {
  version: 1;
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
};

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "zm-card": {
      w: number;
      h: number;
      nodeId: string;
      nodeType: string;
      payload: unknown;
    };
  }
}

type ZmCardShape = TLShape<"zm-card">;

declare global {
  interface Window {
    __workspaceApp?: {
      engine: string;
      ready: boolean;
      status?: string;
      boardKey?: string | null;
      currentToolId?: string;
      nodeCount?: number;
      edgeCount?: number;
      arrowCount?: number;
      bindingCount?: number;
      shapeCount?: number;
      selectedNodeIds?: string[];
      selectedEdgeIds?: string[];
      editingNodeId?: string | null;
      pageSelectedNodeIds?: string[];
      pageSelectedEdgeIds?: string[];
    };
    __workspaceClipboardMode?: string;
    __workspaceBoardState?: WorkspaceBoard | null;
    __workspaceAppBridge?: {
      setBoardPayload(board: WorkspaceBoard): void;
      selectNodeIds(nodeIds: string[]): void;
      addNode(type: string, point?: WorkspacePoint): string | null;
      beginEdgeDrag(fromNodeId: string, fromSide: string, clientPoint: WorkspacePoint): void;
      copySelectionToClipboard(): Promise<boolean>;
      cutSelectionToClipboard(): Promise<boolean>;
      pasteFromClipboard(): Promise<boolean>;
      copySelection(): void;
      pasteSelection(): void;
      setTool(toolId: string): void;
      undo(): void;
      redo(): void;
      resetView(): void;
    } | null;
  }
}

const TEXT_NODE_PLACEHOLDER = "Start typing...";
const TEXT_NODE_MIN_TEXTAREA_HEIGHT = 148;
const TEXT_NODE_MIN_FRAME_HEIGHT = 170;
const TEXT_NODE_CHROME_HEIGHT = 22;
const WORKSPACE_CLIPBOARD_MIME = "application/x-zm-workspace+json";
const WORKSPACE_CLIPBOARD_HTML_ATTR = "data-zm-workspace";

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function toSerializableValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function resolveCardHeight(node: WorkspaceNode) {
  if (typeof node.h === "number") return node.h;
  if (typeof node.autoHeight === "number") return Math.max(170, Math.round(node.autoHeight));
  if (node.type === "file") {
    if (node.fileKind === "pdf") return 420;
    if (node.fileKind === "image") return 280;
    return 188;
  }
  if (node.type === "project") return 250;
  if (node.type === "group") return 280;
  if (node.type === "link") return 156;

  const content = String(node.content || "");
  const lineCount = content.split("\n").length;
  return Math.max(170, 100 + lineCount * 22);
}

function shapeIdForNode(nodeId: string) {
  return createShapeId(nodeId);
}

function shapeIdForEdge(edgeId: string) {
  return createShapeId(`edge:${edgeId}`);
}

function edgeIdFromArrowShape(shape: { id: string; meta?: Record<string, unknown> | null }) {
  if (typeof shape.meta?.edgeId === "string" && shape.meta.edgeId.trim()) {
    return shape.meta.edgeId;
  }

  return shape.id.replace(/^shape:edge:/, "").replace(/^shape:/, "");
}

function bindingIdForEdge(edgeId: string, terminal: "start" | "end") {
  return createBindingId(`edge:${edgeId}:${terminal}`);
}

function edgeAnchorEpsilon(value: number) {
  return Math.max(0.001, Math.min(0.999, value));
}

function edgeSideToNormalizedAnchor(side?: string) {
  if (side === "top") {
    return { x: 0.5, y: edgeAnchorEpsilon(0) };
  }
  if (side === "bottom") {
    return { x: 0.5, y: edgeAnchorEpsilon(1) };
  }
  if (side === "left") {
    return { x: edgeAnchorEpsilon(0), y: 0.5 };
  }

  return { x: edgeAnchorEpsilon(1), y: 0.5 };
}

function normalizedAnchorToSide(anchor: { x: number; y: number } | undefined, fallback = "right") {
  if (!anchor) return fallback;

  const distances = [
    { side: "top", distance: Math.abs(anchor.y) },
    { side: "right", distance: Math.abs(1 - anchor.x) },
    { side: "bottom", distance: Math.abs(1 - anchor.y) },
    { side: "left", distance: Math.abs(anchor.x) },
  ];
  distances.sort((left, right) => left.distance - right.distance);
  return distances[0]?.side || fallback;
}

function edgeEndToArrowhead(end?: string): TLArrowShape["props"]["arrowheadStart"] {
  if (end === "none") return "none";
  return "arrow";
}

function arrowheadToEdgeEnd(end?: string) {
  if (end === "none") return "none";
  return "arrow";
}

function edgeAnchor(node: WorkspaceNode | undefined, side?: string) {
  if (!node) {
    return { x: 0, y: 0 };
  }

  const width = node.w || 320;
  const height = resolveCardHeight(node);
  if (side === "top") {
    return { x: node.x + width / 2, y: node.y };
  }
  if (side === "bottom") {
    return { x: node.x + width / 2, y: node.y + height };
  }
  if (side === "left") {
    return { x: node.x, y: node.y + height / 2 };
  }

  return { x: node.x + width, y: node.y + height / 2 };
}

function resolveTargetSide(fromNode: WorkspaceNode | undefined, toNode: WorkspaceNode | undefined) {
  if (!fromNode || !toNode) {
    return "left";
  }

  const fromWidth = fromNode.w || 320;
  const toWidth = toNode.w || 320;
  const fromHeight = resolveCardHeight(fromNode);
  const toHeight = resolveCardHeight(toNode);
  const deltaX = toNode.x + toWidth / 2 - (fromNode.x + fromWidth / 2);
  const deltaY = toNode.y + toHeight / 2 - (fromNode.y + fromHeight / 2);

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? "left" : "right";
  }

  return deltaY >= 0 ? "top" : "bottom";
}

function resolveWorkspaceNodeIdAtClientPoint(
  editor: Editor,
  board: WorkspaceBoard,
  clientPoint: WorkspacePoint,
  excludedNodeId?: string | null,
) {
  const pagePoint = editor.screenToPage(clientPoint);
  const candidates = [...board.nodes].reverse();

  for (const node of candidates) {
    if (excludedNodeId && node.id === excludedNodeId) continue;

    const height = resolveCardHeight(node);
    const containsPoint =
      pagePoint.x >= node.x &&
      pagePoint.x <= node.x + node.w &&
      pagePoint.y >= node.y &&
      pagePoint.y <= node.y + height;

    if (containsPoint) {
      return node.id;
    }
  }

  return null;
}

function readRichTextPlaintext(value: unknown) {
  const content = Array.isArray((value as { content?: unknown[] } | undefined)?.content)
    ? ((value as { content?: Array<{ content?: Array<{ text?: string }> }> }).content || [])
    : [];

  return content
    .map((paragraph) =>
      Array.isArray(paragraph?.content)
        ? paragraph.content
            .map((segment) => (typeof segment?.text === "string" ? segment.text : ""))
            .join("")
        : "",
    )
    .join("\n")
    .trim();
}

function uniqueIds(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function escapeClipboardHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeClipboardText(value: string) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function summarizeNodeForClipboard(node: WorkspaceNode) {
  if (node.type === "project") {
    return [node.title || "", node.desc || node.content || ""].filter(Boolean).join("\n");
  }

  if (node.type === "link") {
    return [node.title || "Reference link", node.url || node.content || ""].filter(Boolean).join("\n");
  }

  if (node.type === "group") {
    return node.label || "Cluster";
  }

  if (node.type === "file") {
    return [node.title || "Attachment", node.file || node.content || ""].filter(Boolean).join("\n");
  }

  return node.content || node.title || "";
}

function createClipboardHtml(payload: WorkspaceClipboardPayload, text: string) {
  const encodedPayload = encodeURIComponent(JSON.stringify(payload));
  const visibleText = escapeClipboardHtml(text || " ");
  return `<div ${WORKSPACE_CLIPBOARD_HTML_ATTR}="${encodedPayload}"><pre>${visibleText}</pre></div>`;
}

function blobToFile(blob: Blob, index = 0) {
  if (blob instanceof File) return blob;
  const extension = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "bin";
  return new File([blob], `clipboard-${Date.now()}-${index}.${extension}`, {
    type: blob.type || "application/octet-stream",
  });
}

function parseWorkspaceClipboardPayload(value: string | null | undefined) {
  if (!value) return null;

  try {
    const payload = JSON.parse(value) as Partial<WorkspaceClipboardPayload>;
    if (!Array.isArray(payload?.nodes) || !Array.isArray(payload?.edges)) {
      return null;
    }

    return {
      version: 1,
      nodes: payload.nodes as WorkspaceNode[],
      edges: payload.edges as WorkspaceEdge[],
    } satisfies WorkspaceClipboardPayload;
  } catch {
    return null;
  }
}

function parseWorkspaceClipboardPayloadFromHtml(html: string | null | undefined) {
  if (!html || !html.includes(WORKSPACE_CLIPBOARD_HTML_ATTR)) return null;

  try {
    const document = new DOMParser().parseFromString(html, "text/html");
    const container = document.querySelector(`[${WORKSPACE_CLIPBOARD_HTML_ATTR}]`);
    const encoded = container?.getAttribute(WORKSPACE_CLIPBOARD_HTML_ATTR);
    if (!encoded) return null;
    return parseWorkspaceClipboardPayload(decodeURIComponent(encoded));
  } catch {
    return null;
  }
}

function resolveWorkspacePastePoint(editor: Editor) {
  const viewportCenter = editor.getViewportPageBounds().center;
  return {
    x: viewportCenter.x,
    y: viewportCenter.y,
  } satisfies WorkspacePoint;
}

function buildTextNodeFromClipboard(text: string, point: WorkspacePoint) {
  return {
    id: createWorkspaceNodeId("text"),
    type: "text",
    x: Math.round(point.x - 140),
    y: Math.round(point.y - 90),
    w: 320,
    h: "auto",
    content: text,
  } satisfies WorkspaceNode;
}

function buildLinkNodeFromClipboard(url: string, point: WorkspacePoint) {
  let title = "Reference link";
  try {
    title = new URL(url).hostname || title;
  } catch {}

  return {
    id: createWorkspaceNodeId("link"),
    type: "link",
    x: Math.round(point.x - 160),
    y: Math.round(point.y - 90),
    w: 320,
    h: 170,
    title,
    url,
    content: url,
  } satisfies WorkspaceNode;
}

function normalizeClipboardUrl(value: string) {
  const trimmed = normalizeClipboardText(value);
  if (!trimmed) return null;

  try {
    const nextUrl = trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;
    const parsed = new URL(nextUrl);
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function getSelectedNodeIds(editor: Editor) {
  return uniqueIds(
    editor
      .getSelectedShapes()
      .filter((shape) => shape.type === "zm-card")
      .map((shape) => ((shape as ZmCardShape).props.nodeId || "").trim()),
  );
}

function getSelectedEdgeIds(editor: Editor) {
  return uniqueIds(
    editor
      .getSelectedShapes()
      .filter((shape) => shape.type === "arrow")
      .map((shape) => edgeIdFromArrowShape(shape)),
  );
}

function createWorkspaceNodeId(prefix = "node") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function buildGroupNodeAtPoint(board: WorkspaceBoard, selectedNodeIds: string[], point: WorkspacePoint) {
  const selectedNodes = board.nodes.filter((node) => selectedNodeIds.includes(node.id));

  if (selectedNodes.length === 0) {
    return {
      id: createWorkspaceNodeId("group"),
      type: "group",
      x: Math.round(point.x - 180),
      y: Math.round(point.y - 120),
      w: 420,
      h: 280,
      label: "Cluster",
    } satisfies WorkspaceNode;
  }

  const frames = selectedNodes.map((node) => ({
    left: node.x,
    top: node.y,
    right: node.x + node.w,
    bottom: node.y + resolveCardHeight(node),
  }));
  const left = Math.min(...frames.map((frame) => frame.left));
  const top = Math.min(...frames.map((frame) => frame.top));
  const right = Math.max(...frames.map((frame) => frame.right));
  const bottom = Math.max(...frames.map((frame) => frame.bottom));

  return {
    id: createWorkspaceNodeId("group"),
    type: "group",
    x: left - 36,
    y: top - 52,
    w: right - left + 72,
    h: bottom - top + 92,
    label: "Cluster",
  } satisfies WorkspaceNode;
}

function createWorkspaceNode(type: string, board: WorkspaceBoard, point: WorkspacePoint, selectedNodeIds: string[]) {
  if (type === "text") {
    return {
      id: createWorkspaceNodeId("text"),
      type: "text",
      x: Math.round(point.x - 120),
      y: Math.round(point.y - 80),
      w: 280,
      h: "auto",
      autoHeight: TEXT_NODE_MIN_FRAME_HEIGHT,
      content: TEXT_NODE_PLACEHOLDER,
    } satisfies WorkspaceNode;
  }

  if (type === "link") {
    return {
      id: createWorkspaceNodeId("link"),
      type: "link",
      x: Math.round(point.x - 120),
      y: Math.round(point.y - 80),
      w: 320,
      h: 170,
      title: "Reference link",
      url: "https://",
      content: "https://",
    } satisfies WorkspaceNode;
  }

  return buildGroupNodeAtPoint(board, selectedNodeIds, point);
}

function nodeToCardShapePartial(node: WorkspaceNode) {
  return {
    id: shapeIdForNode(node.id),
    type: "zm-card" as const,
    x: node.x,
    y: node.y,
    props: {
      nodeId: node.id,
      nodeType: node.type,
      w: node.w,
      h: resolveCardHeight(node),
      payload: toSerializableValue(node),
    },
  };
}

function createDraftArrowId() {
  return createShapeId(`draft-edge:${Date.now()}-${Math.floor(Math.random() * 1000)}`);
}

function createWorkspaceEdgeId() {
  return `edge-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function createArrowShapePartial(params: {
  id: ReturnType<typeof createShapeId>;
  start: WorkspacePoint;
  end: WorkspacePoint;
  edgeId: string;
  fromNodeId: string;
  fromSide: string;
  toNodeId?: string | null;
  toSide?: string | null;
  isDraft?: boolean;
}) {
  return {
    id: params.id,
    type: "arrow" as const,
    x: params.start.x,
    y: params.start.y,
    meta: {
      edgeId: params.edgeId,
      fromNodeId: params.fromNodeId,
      fromSide: params.fromSide,
      toNodeId: params.toNodeId || null,
      toSide: params.toSide || null,
      isDraftEdge: params.isDraft === true,
    },
    props: {
      kind: "arc" as const,
      dash: "draw" as const,
      size: "m" as const,
      fill: "none" as const,
      color: "black" as const,
      labelColor: "black" as const,
      bend: 0,
      start: { x: 0, y: 0 },
      end: { x: params.end.x - params.start.x, y: params.end.y - params.start.y },
      arrowheadStart: "none" as const,
      arrowheadEnd: "arrow" as const,
      richText: toRichText(""),
      labelPosition: 0.5,
      font: "draw" as const,
      scale: 1,
      elbowMidPoint: 0.5,
    },
  };
}

function dispatchSelectionChange(editor: Editor) {
  window.dispatchEvent(
    new CustomEvent("workspace-app:selection-change", {
      detail: {
        nodeIds: getSelectedNodeIds(editor),
        edgeIds: getSelectedEdgeIds(editor),
      },
    }),
  );
}

function getSelectedClipboardFragment(editor: Editor, board: WorkspaceBoard) {
  const liveBoard = buildBoardFromEditor(editor, board);
  const selectedNodeIds = new Set(getSelectedNodeIds(editor));
  if (selectedNodeIds.size === 0) return null;

  return {
    nodes: cloneValue(liveBoard.nodes.filter((node) => selectedNodeIds.has(node.id))),
    edges: cloneValue(liveBoard.edges.filter((edge) => selectedNodeIds.has(edge.from) && selectedNodeIds.has(edge.to))),
  };
}

function formatFileSize(bytes?: number) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\\.0$/, "")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\\.0$/, "")} MB`;
}

function fileKindLabel(node: WorkspaceNode) {
  if (node.fileKind === "pdf") return "PDF";
  if (node.fileKind === "image") return "Image";
  return "File";
}

function updateWorkspaceCardPayload(
  editor: Editor,
  shape: ZmCardShape,
  node: WorkspaceNode,
  patch: Partial<WorkspaceNode>,
  nextHeight = shape.props.h,
) {
  const nextPayload = {
    ...node,
    ...patch,
  };

  editor.updateShapes([
    {
      id: shape.id,
      type: "zm-card",
      props: {
        nodeId: node.id,
        nodeType: node.type,
        w: shape.props.w,
        h: nextHeight,
        payload: toSerializableValue(nextPayload),
      },
    },
  ]);
}

function stopInlineEditingPropagation(event: { stopPropagation(): void }) {
  event.stopPropagation();
}

function resolveSourceSideFromClientPoint(bounds: DOMRect, point: WorkspacePoint) {
  const distances = [
    { side: "top", distance: Math.abs(point.y - bounds.top) },
    { side: "right", distance: Math.abs(bounds.right - point.x) },
    { side: "bottom", distance: Math.abs(bounds.bottom - point.y) },
    { side: "left", distance: Math.abs(point.x - bounds.left) },
  ];

  distances.sort((left, right) => left.distance - right.distance);
  return distances[0]?.side || "right";
}

function WorkspaceCardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="workspace-tldraw-card-shell">
      <div className="workspace-tldraw-drag-handle" />
      {children}
    </div>
  );
}

function WorkspaceCardContainer({
  node,
  variantClass,
  children,
}: {
  node: WorkspaceNode;
  variantClass: string;
  children: React.ReactNode;
}) {
  const editor = useEditor();

  return (
    <HTMLContainer
      className={`workspace-tldraw-card ${variantClass}`}
      data-workspace-node-id={node.id}
      data-node-type={node.type}
      onPointerDownCapture={(event) => {
        if (event.button !== 0) return;
        if (
          editor.getCurrentToolId() !== "arrow" &&
          (!(event.target instanceof Element) || !event.target.closest("input, textarea, button, a, iframe"))
        ) {
          editor.focus();
        }
        if (editor.getCurrentToolId() !== "arrow") return;

        const target = event.target;
        if (target instanceof Element && target.closest(".node-port")) {
          return;
        }

        const side = resolveSourceSideFromClientPoint(event.currentTarget.getBoundingClientRect(), {
          x: event.clientX,
          y: event.clientY,
        });

        event.preventDefault();
        event.stopPropagation();
        window.__workspaceAppBridge?.beginEdgeDrag(node.id, side, {
          x: event.clientX,
          y: event.clientY,
        });
      }}
    >
      <WorkspaceCardShell>{children}</WorkspaceCardShell>
      <WorkspaceNodePorts node={node} />
    </HTMLContainer>
  );
}

function WorkspaceTextCardBody({ shape, node }: { shape: ZmCardShape; node: WorkspaceNode }) {
  const editor = useEditor();
  const isEditing = Boolean(shape.meta?.isEditingText);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function syncEditorHeight(field: HTMLTextAreaElement) {
    field.style.height = "0px";
    const nextFieldHeight = Math.max(TEXT_NODE_MIN_TEXTAREA_HEIGHT, Math.ceil(field.scrollHeight));
    field.style.height = `${nextFieldHeight}px`;
    return Math.max(TEXT_NODE_MIN_FRAME_HEIGHT, TEXT_NODE_CHROME_HEIGHT + nextFieldHeight);
  }

  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;

    syncEditorHeight(field);

    if (!isEditing) return;

    field.focus({ preventScroll: true });
    if ((node.content || "") === TEXT_NODE_PLACEHOLDER) {
      field.setSelectionRange(0, field.value.length);
    }
  }, [isEditing, node.content, shape.id]);

  const updateShapeFromValue = (value: string, field: HTMLTextAreaElement) => {
    const nextNodeHeight = syncEditorHeight(field);
    const nextPayload = {
      ...node,
      content: value,
      h: "auto" as const,
      autoHeight: nextNodeHeight,
    };

    editor.updateShapes([
      {
        id: shape.id,
        type: "zm-card",
        props: {
          nodeId: node.id,
          nodeType: node.type,
          w: shape.props.w,
          h: nextNodeHeight,
          payload: toSerializableValue(nextPayload),
        },
      },
    ]);
  };

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        className="canvas-textarea workspace-tldraw-text-editor"
        data-text-node={node.id}
        spellCheck={false}
        value={node.content || ""}
        onChange={(event) => {
          updateShapeFromValue(event.currentTarget.value, event.currentTarget);
        }}
        onFocus={() => {
        }}
        onBlur={() => {
          editor.updateShapes([
            {
              id: shape.id,
              type: "zm-card",
              meta: {
                ...shape.meta,
                isEditingText: false,
              },
            },
          ]);
        }}
        onPointerDownCapture={(event) => {
          event.stopPropagation();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
        }}
      />
    );
  }

  return (
    <div
      className="workspace-tldraw-text-body"
      onDoubleClick={(event) => {
        event.stopPropagation();
        editor.setSelectedShapes([shape.id]);
        editor.updateShapes([
          {
            id: shape.id,
            type: "zm-card",
            meta: {
              ...shape.meta,
              isEditingText: true,
            },
          },
        ]);
      }}
    >
      {node.content || ""}
    </div>
  );
}

function WorkspaceLinkCardBody({ shape, node }: { shape: ZmCardShape; node: WorkspaceNode }) {
  const editor = useEditor();

  return (
    <div className="link-card">
      <div className="link-card-head">
        <input
          className="canvas-inline-input link-title-input"
          data-node-id={node.id}
          data-link-field="title"
          spellCheck={false}
          value={node.title || "Reference link"}
          onChange={(event) => {
            updateWorkspaceCardPayload(editor, shape, node, { title: event.currentTarget.value });
          }}
          onFocus={() => {
            editor.setSelectedShapes([shape.id]);
          }}
          onPointerDownCapture={stopInlineEditingPropagation}
          onDoubleClick={stopInlineEditingPropagation}
        />
      </div>
      <textarea
        className="canvas-inline-input link-url-input"
        data-node-id={node.id}
        data-link-field="url"
        spellCheck={false}
        value={node.url || node.content || ""}
        onChange={(event) => {
          updateWorkspaceCardPayload(editor, shape, node, {
            url: event.currentTarget.value,
            content: event.currentTarget.value,
          });
        }}
        onFocus={() => {
          editor.setSelectedShapes([shape.id]);
        }}
        onPointerDownCapture={stopInlineEditingPropagation}
        onDoubleClick={stopInlineEditingPropagation}
      />
    </div>
  );
}

function WorkspaceGroupCardBody({ shape, node }: { shape: ZmCardShape; node: WorkspaceNode }) {
  const editor = useEditor();

  return (
    <div className="group-node-body">
      <input
        className="canvas-inline-input group-label-input"
        data-node-id={node.id}
        data-group-field="label"
        spellCheck={false}
        value={node.label || "Cluster"}
        onChange={(event) => {
          updateWorkspaceCardPayload(editor, shape, node, { label: event.currentTarget.value });
        }}
        onFocus={() => {
          editor.setSelectedShapes([shape.id]);
        }}
        onPointerDownCapture={stopInlineEditingPropagation}
        onDoubleClick={stopInlineEditingPropagation}
      />
      <div className="group-node-copy">Group Container</div>
    </div>
  );
}

function WorkspaceFileCardBody({ shape, node }: { shape: ZmCardShape; node: WorkspaceNode }) {
  const editor = useEditor();
  const fileUrl = node.file || node.content || "";
  const sizeLabel = formatFileSize(node.size);
  const caption = [node.mimeType || "", sizeLabel].filter(Boolean).join(" · ");

  return (
    <div className="file-node-shell">
      <div className="file-node-head">
        <div className="file-node-labels">
          <div className="file-node-kicker">Attachment</div>
          <input
            className="canvas-inline-input file-node-title file-title-input"
            data-node-id={node.id}
            data-file-field="title"
            spellCheck={false}
            value={node.title || "Attachment"}
            onChange={(event) => {
              updateWorkspaceCardPayload(editor, shape, node, { title: event.currentTarget.value });
            }}
            onFocus={() => {
              editor.setSelectedShapes([shape.id]);
            }}
            onPointerDownCapture={stopInlineEditingPropagation}
            onDoubleClick={stopInlineEditingPropagation}
          />
        </div>
        <span className="file-node-pill">{fileKindLabel(node)}</span>
      </div>
      {node.fileKind === "image" ? (
        <div className="file-node-preview" data-file-preview-kind="image">
          <img src={fileUrl} alt={node.title || "Attachment"} draggable={false} />
        </div>
      ) : node.fileKind === "pdf" ? (
        <div className="file-node-preview" data-file-preview-kind="pdf">
          <iframe src={`${fileUrl}#view=FitH`} title={node.title || "Attachment"} />
        </div>
      ) : (
        <div className="file-node-preview" data-file-preview-kind="other">
          <div>{node.mimeType || "Preview unavailable"}</div>
        </div>
      )}
      <div className="file-node-meta">
        <div className="file-node-caption">{caption || "Stored on this board"}</div>
        <a
          className="file-node-action"
          data-node-action
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          onPointerDownCapture={stopInlineEditingPropagation}
          onDoubleClick={stopInlineEditingPropagation}
        >
          Open
        </a>
      </div>
    </div>
  );
}

function WorkspaceNodePorts({ node }: { node: WorkspaceNode }) {
  return (
    <>
      {["top", "right", "bottom", "left"].map((side) => (
        <button
          key={side}
          className="node-port"
          data-port-node={node.id}
          data-side={side}
          type="button"
          aria-label={`Connect ${side}`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            window.__workspaceAppBridge?.beginEdgeDrag(node.id, side, {
              x: event.clientX,
              y: event.clientY,
            });
          }}
        />
      ))}
    </>
  );
}

function renderNodeBody(shape: ZmCardShape, node: WorkspaceNode) {
  if (node.type === "text") {
    return <WorkspaceTextCardBody shape={shape} node={node} />;
  }

  if (node.type === "project") {
    return (
      <div className="project-card">
        <div className="project-card-head">
          <h3 className="project-title">{node.title || ""}</h3>
        </div>
        <p className="project-copy">{node.desc || node.content || ""}</p>
        <div className="tag-row">
          {(node.tags || []).map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (node.type === "link") {
    return <WorkspaceLinkCardBody shape={shape} node={node} />;
  }

  if (node.type === "group") {
    return <WorkspaceGroupCardBody shape={shape} node={node} />;
  }

  if (node.type === "file") {
    return <WorkspaceFileCardBody shape={shape} node={node} />;
  }

  return <div className="workspace-tldraw-text-body">{node.content || ""}</div>;
}

class ZmCardShapeUtil extends BaseBoxShapeUtil<ZmCardShape> {
  static override type = "zm-card" as const;

  static override props = {
    w: T.number,
    h: T.number,
    nodeId: T.string,
    nodeType: T.string,
    payload: T.jsonValue,
  };

  override canResize() {
    return true;
  }

  override isAspectRatioLocked() {
    return false;
  }

  override getDefaultProps(): ZmCardShape["props"] {
    return {
      w: 320,
      h: 180,
      nodeId: "",
      nodeType: "text",
      payload: null,
    };
  }

  override getGeometry(shape: ZmCardShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override component(shape: ZmCardShape) {
    const node = (shape.props.payload || {}) as WorkspaceNode;
    const variantClass =
      node.type === "group"
        ? "group-node"
        : node.type === "file"
          ? "file-node"
          : node.type === "link"
            ? "link-node"
            : node.type === "project"
              ? "project-node"
              : "text-node";

    return (
      <WorkspaceCardContainer node={node} variantClass={variantClass}>
        {renderNodeBody(shape, node)}
      </WorkspaceCardContainer>
    );
  }

  override indicator(shape: ZmCardShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={24} ry={24} />;
  }
}

function buildBoardFromEditor(editor: Editor, board: WorkspaceBoard): WorkspaceBoard {
  const cardShapes = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type === "zm-card")
    .map((shape) => {
      const card = shape as ZmCardShape;
      const payload = cloneValue((card.props.payload || {}) as WorkspaceNode);
      payload.id = card.props.nodeId || payload.id;
      payload.type = card.props.nodeType || payload.type;
      payload.x = Math.round(card.x);
      payload.y = Math.round(card.y);
      payload.w = Math.round(card.props.w);
      payload.h = Math.round(card.props.h);
      if (payload.type === "text") {
        payload.autoHeight = Math.round(card.props.h);
      }
      return payload;
    });

  const orderIndex = new Map(board.nodes.map((node, index) => [node.id, index]));
  cardShapes.sort(
    (left, right) => (orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );

  const nodeIdByShapeId = new Map(cardShapes.map((node) => [shapeIdForNode(node.id), node.id]));
  const edgeOrderIndex = new Map(board.edges.map((edge, index) => [edge.id, index]));
  const edges = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type === "arrow" && !shape.meta?.isDraftEdge)
    .map((shape) => {
      const arrow = shape as TLArrowShape;
      const edgeId = edgeIdFromArrowShape(arrow);
      const previousEdge = board.edges.find((edge) => edge.id === edgeId);
      const bindings = editor.getBindingsFromShape(arrow.id, "arrow");
      const startBinding = bindings.find((binding) => binding.props.terminal === "start");
      const endBinding = bindings.find((binding) => binding.props.terminal === "end");
      const from = startBinding ? nodeIdByShapeId.get(startBinding.toId) : previousEdge?.from;
      const to = endBinding ? nodeIdByShapeId.get(endBinding.toId) : previousEdge?.to;

      if (!from || !to || from === to) {
        return previousEdge ? cloneValue(previousEdge) : null;
      }

      return {
        ...(previousEdge ? cloneValue(previousEdge) : {}),
        id: edgeId,
        from,
        to,
        fromSide: normalizedAnchorToSide(startBinding?.props.normalizedAnchor, previousEdge?.fromSide || "right"),
        toSide: normalizedAnchorToSide(endBinding?.props.normalizedAnchor, previousEdge?.toSide || "left"),
        fromEnd: arrowheadToEdgeEnd(arrow.props.arrowheadStart || previousEdge?.fromEnd),
        toEnd: arrowheadToEdgeEnd(arrow.props.arrowheadEnd || previousEdge?.toEnd),
        color: previousEdge?.color,
        label: readRichTextPlaintext(arrow.props.richText) || previousEdge?.label || "",
      } satisfies WorkspaceEdge;
    })
    .filter(Boolean) as WorkspaceEdge[];

  edges.sort(
    (left, right) =>
      (edgeOrderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (edgeOrderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );

  const camera = editor.getCamera();

  return {
    ...cloneValue(board),
    camera: {
      x: camera.x,
      y: camera.y,
      z: camera.z,
    },
    nodes: cardShapes,
    edges,
  };
}

function publishWorkspaceState(editor: Editor | null, board: WorkspaceBoard | null, ready: boolean) {
  const shapes = editor?.getCurrentPageShapes() || [];
  const arrowShapes = shapes.filter((shape) => shape.type === "arrow" && !shape.meta?.isDraftEdge);
  const bindingCount = arrowShapes.reduce(
    (count, shape) => count + editor!.getBindingsFromShape(shape.id, "arrow").length,
    0,
  );
  const previous = (window.__workspaceApp || {}) as NonNullable<Window["__workspaceApp"]>;
  const editingShape =
    editor?.getCurrentPageShapes().find((shape) => shape.type === "zm-card" && shape.meta?.isEditingText) || null;

  window.__workspaceApp = {
    engine: "tldraw",
    ready,
    status: ready ? "ready" : "mounting",
    boardKey: board?.key || null,
    currentToolId: editor?.getCurrentToolId() || previous.currentToolId || "select",
    nodeCount: board?.nodes?.length || 0,
    edgeCount: board?.edges?.length || 0,
    arrowCount: arrowShapes.length,
    bindingCount,
    shapeCount: shapes.length,
    selectedNodeIds: editor ? getSelectedNodeIds(editor) : [],
    selectedEdgeIds: editor ? getSelectedEdgeIds(editor) : [],
    editingNodeId: editingShape && editingShape.type === "zm-card" ? (editingShape as ZmCardShape).props.nodeId : null,
    pageSelectedNodeIds: previous.pageSelectedNodeIds || [],
    pageSelectedEdgeIds: previous.pageSelectedEdgeIds || [],
  };

  window.dispatchEvent(
    new CustomEvent("workspace-app:state-change", {
      detail: cloneValue(window.__workspaceApp),
    }),
  );
}

function syncBoardToEditor(editor: Editor, board: WorkspaceBoard) {
  const currentCardShapes = editor.getCurrentPageShapes().filter((shape) => shape.type === "zm-card") as ZmCardShape[];
  const currentArrowShapes = editor.getCurrentPageShapes().filter((shape) => shape.type === "arrow") as TLArrowShape[];
  const currentCardShapeIds = new Set(currentCardShapes.map((shape) => shape.id));
  const currentArrowShapeIds = new Set(currentArrowShapes.map((shape) => shape.id));
  const nextCardShapes = board.nodes.map((node) => nodeToCardShapePartial(node));
  const nodesById = new Map(board.nodes.map((node) => [node.id, node]));
  const nextArrowShapes = board.edges
    .map((edge) => {
      const fromNode = nodesById.get(edge.from);
      const toNode = nodesById.get(edge.to);
      if (!fromNode || !toNode) return null;

      const start = edgeAnchor(fromNode, edge.fromSide || "right");
      const end = edgeAnchor(toNode, edge.toSide || "left");

      return {
        id: shapeIdForEdge(edge.id),
        type: "arrow" as const,
        x: start.x,
        y: start.y,
        meta: {
          edgeId: edge.id,
          from: edge.from,
          to: edge.to,
          fromSide: edge.fromSide || "right",
          toSide: edge.toSide || "left",
        },
        props: {
          kind: "arc" as const,
          dash: "draw" as const,
          size: "m" as const,
          fill: "none" as const,
          color: "black" as const,
          labelColor: "black" as const,
          bend: 0,
          start: { x: 0, y: 0 },
          end: { x: end.x - start.x, y: end.y - start.y },
          arrowheadStart: edgeEndToArrowhead(edge.fromEnd),
          arrowheadEnd: edgeEndToArrowhead(edge.toEnd),
          richText: toRichText(edge.label || ""),
          labelPosition: 0.5,
          font: "draw" as const,
          scale: 1,
          elbowMidPoint: 0.5,
        },
      };
    })
    .filter(Boolean);

  const nextCardShapeIds = new Set(nextCardShapes.map((shape) => shape.id));
  const nextArrowShapeIds = new Set(nextArrowShapes.map((shape) => shape.id));
  const cardIdsToDelete = currentCardShapes.filter((shape) => !nextCardShapeIds.has(shape.id)).map((shape) => shape.id);
  const arrowIdsToDelete = currentArrowShapes.filter((shape) => !nextArrowShapeIds.has(shape.id)).map((shape) => shape.id);
  const cardShapesToCreate = nextCardShapes.filter((shape) => !currentCardShapeIds.has(shape.id));
  const arrowShapesToCreate = nextArrowShapes.filter((shape) => !currentArrowShapeIds.has(shape.id));

  editor.run(() => {
    if (cardIdsToDelete.length > 0) {
      editor.deleteShapes(cardIdsToDelete);
    }
    if (arrowIdsToDelete.length > 0) {
      editor.deleteShapes(arrowIdsToDelete);
    }
    if (cardShapesToCreate.length > 0) {
      editor.createShapes(cardShapesToCreate);
    }
    if (arrowShapesToCreate.length > 0) {
      editor.createShapes(arrowShapesToCreate);
    }
    if (nextCardShapes.length > 0) {
      editor.updateShapes(nextCardShapes);
    }
    if (nextArrowShapes.length > 0) {
      editor.updateShapes(nextArrowShapes);
    }

    for (const arrow of nextArrowShapes) {
      const edgeId = edgeIdFromArrowShape(arrow);
      const edge = board.edges.find((item) => item.id === edgeId);
      if (!edge) continue;

      const terminals = [
        {
          terminal: "start" as const,
          toId: shapeIdForNode(edge.from),
          normalizedAnchor: edgeSideToNormalizedAnchor(edge.fromSide || "right"),
        },
        {
          terminal: "end" as const,
          toId: shapeIdForNode(edge.to),
          normalizedAnchor: edgeSideToNormalizedAnchor(edge.toSide || "left"),
        },
      ];
      const existingBindings = editor.getBindingsFromShape(arrow.id, "arrow");

      for (const binding of existingBindings) {
        if (!terminals.some((terminal) => terminal.terminal === binding.props.terminal)) {
          editor.deleteBindings([binding.id]);
        }
      }

      for (const terminal of terminals) {
        const existingBinding = editor
          .getBindingsFromShape(arrow.id, "arrow")
          .find((binding) => binding.props.terminal === terminal.terminal);

        if (existingBinding) {
          editor.updateBinding({
            id: existingBinding.id,
            type: "arrow",
            fromId: arrow.id,
            toId: terminal.toId,
            props: {
              terminal: terminal.terminal,
              normalizedAnchor: terminal.normalizedAnchor,
              isExact: false,
              isPrecise: true,
              snap: "none",
            },
          });
          continue;
        }

        editor.createBinding({
          id: bindingIdForEdge(edgeId, terminal.terminal),
          type: "arrow",
          fromId: arrow.id,
          toId: terminal.toId,
          props: {
            terminal: terminal.terminal,
            normalizedAnchor: terminal.normalizedAnchor,
            isExact: false,
            isPrecise: true,
            snap: "none",
          },
        });
      }
    }
    if (board.camera) {
      editor.setCamera(board.camera, { immediate: true });
    }
  }, { history: "ignore" });
}

export default function WorkspaceApp() {
  const [ready, setReady] = useState(false);
  const [board, setBoard] = useState<WorkspaceBoard | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const boardRef = useRef<WorkspaceBoard | null>(null);
  const clipboardRef = useRef<{
    nodes: WorkspaceNode[];
    edges: WorkspaceEdge[];
  } | null>(null);
  const isApplyingExternalBoardRef = useRef(false);
  const edgeDraftRef = useRef<{
    arrowId: ReturnType<typeof createShapeId>;
    fromNodeId: string;
    fromSide: string;
    edgeId: string;
  } | null>(null);
  const removeEdgeDraftListenersRef = useRef<(() => void) | null>(null);

  function clearEdgeDraftListeners() {
    removeEdgeDraftListenersRef.current?.();
    removeEdgeDraftListenersRef.current = null;
  }

  function updateEdgeDraftAtClientPoint(clientPoint: WorkspacePoint) {
    const editor = editorRef.current;
    const boardState = boardRef.current;
    const draft = edgeDraftRef.current;
    if (!editor || !boardState || !draft) return;

    const liveBoard = buildBoardFromEditor(editor, boardState);
    const fromNode = liveBoard.nodes.find((node) => node.id === draft.fromNodeId);
    if (!fromNode) return;

    const screenPoint = editor.screenToPage(clientPoint);
    const targetNodeId = resolveWorkspaceNodeIdAtClientPoint(editor, liveBoard, clientPoint, draft.fromNodeId);
    const targetNode =
      targetNodeId && targetNodeId !== draft.fromNodeId
        ? liveBoard.nodes.find((node) => node.id === targetNodeId) || null
        : null;
    const toSide = targetNode ? resolveTargetSide(fromNode, targetNode) : null;
    const start = edgeAnchor(fromNode, draft.fromSide);
    const end = targetNode ? edgeAnchor(targetNode, toSide || "left") : { x: screenPoint.x, y: screenPoint.y };

    editor.updateShapes([
      createArrowShapePartial({
        id: draft.arrowId,
        edgeId: draft.edgeId,
        fromNodeId: draft.fromNodeId,
        fromSide: draft.fromSide,
        start,
        end,
        toNodeId: targetNode?.id || null,
        toSide,
        isDraft: true,
      }),
    ]);
    publishWorkspaceState(editor, boardRef.current, true);
  }

  function finishEdgeDraft(clientPoint: WorkspacePoint) {
    const editor = editorRef.current;
    const boardState = boardRef.current;
    const draft = edgeDraftRef.current;
    if (!editor || !boardState || !draft) return;

    const liveBoard = buildBoardFromEditor(editor, boardState);
    const fromNode = liveBoard.nodes.find((node) => node.id === draft.fromNodeId);
    const targetNodeId = resolveWorkspaceNodeIdAtClientPoint(editor, liveBoard, clientPoint, draft.fromNodeId);
    const toNode =
      targetNodeId && targetNodeId !== draft.fromNodeId
        ? liveBoard.nodes.find((node) => node.id === targetNodeId) || null
        : null;

    if (!fromNode || !toNode) {
      editor.deleteShapes([draft.arrowId]);
      edgeDraftRef.current = null;
      publishWorkspaceState(editor, boardRef.current, true);
      return;
    }

    const duplicateEdge = liveBoard.edges.find((edge) => edge.from === draft.fromNodeId && edge.to === toNode.id);
    if (duplicateEdge) {
      editor.deleteShapes([draft.arrowId]);
      edgeDraftRef.current = null;
      publishWorkspaceState(editor, boardRef.current, true);
      return;
    }

    const toSide = resolveTargetSide(fromNode, toNode);
    const start = edgeAnchor(fromNode, draft.fromSide);
    const end = edgeAnchor(toNode, toSide);
    const finalEdgeId = createWorkspaceEdgeId();

    editor.updateShapes([
      createArrowShapePartial({
        id: draft.arrowId,
        edgeId: finalEdgeId,
        fromNodeId: draft.fromNodeId,
        fromSide: draft.fromSide,
        start,
        end,
        toNodeId: toNode.id,
        toSide,
        isDraft: false,
      }),
    ]);
    const existingBindings = editor.getBindingsFromShape(draft.arrowId, "arrow");
    if (existingBindings.length > 0) {
      editor.deleteBindings(existingBindings.map((binding) => binding.id));
    }
    editor.createBinding({
      id: bindingIdForEdge(finalEdgeId, "start"),
      type: "arrow",
      fromId: draft.arrowId,
      toId: shapeIdForNode(draft.fromNodeId),
      props: {
        terminal: "start",
        normalizedAnchor: edgeSideToNormalizedAnchor(draft.fromSide),
        isExact: false,
        isPrecise: true,
        snap: "none",
      },
    });
    editor.createBinding({
      id: bindingIdForEdge(finalEdgeId, "end"),
      type: "arrow",
      fromId: draft.arrowId,
      toId: shapeIdForNode(toNode.id),
      props: {
        terminal: "end",
        normalizedAnchor: edgeSideToNormalizedAnchor(toSide),
        isExact: false,
        isPrecise: true,
        snap: "none",
      },
    });
    edgeDraftRef.current = null;
    publishWorkspaceState(editor, boardRef.current, true);
    dispatchSelectionChange(editor);
  }

  function cancelEdgeDraft() {
    const editor = editorRef.current;
    const draft = edgeDraftRef.current;
    if (!editor || !draft) return;

    editor.deleteShapes([draft.arrowId]);
    edgeDraftRef.current = null;
    publishWorkspaceState(editor, boardRef.current, true);
  }

  function createClipboardSelectionExport() {
    const editor = editorRef.current;
    const boardState = boardRef.current;
    if (!editor || !boardState) return null;

    const fragment = getSelectedClipboardFragment(editor, boardState);
    if (!fragment) return null;

    clipboardRef.current = fragment;
    const payload = {
      version: 1,
      nodes: cloneValue(fragment.nodes),
      edges: cloneValue(fragment.edges),
    } satisfies WorkspaceClipboardPayload;
    const text = normalizeClipboardText(payload.nodes.map((node) => summarizeNodeForClipboard(node)).join("\n\n")) || " ";

    return {
      payload,
      text,
      html: createClipboardHtml(payload, text),
      json: JSON.stringify(payload),
    };
  }

  async function copySelectionToClipboard() {
    const exported = createClipboardSelectionExport();
    if (!exported) return false;

    const clipboard = window.navigator?.clipboard;
    if (!clipboard) {
      return false;
    }

    try {
      if (typeof clipboard.write === "function" && typeof ClipboardItem !== "undefined") {
        await clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([exported.text], { type: "text/plain" }),
            "text/html": new Blob([exported.html], { type: "text/html" }),
          }),
        ]);
        return true;
      }

      if (typeof clipboard.writeText === "function") {
        await clipboard.writeText(exported.text);
        return true;
      }
    } catch (error) {
      console.error("Unable to write workspace selection to system clipboard.", error);
    }

    return false;
  }

  async function cutSelectionToClipboard() {
    const copied = await copySelectionToClipboard();
    const editor = editorRef.current;
    if (!copied || !editor) return copied;

    editor.deleteShapes(editor.getSelectedShapeIds());
    publishWorkspaceState(editor, boardRef.current, true);
    dispatchSelectionChange(editor);
    return true;
  }

  function pasteWorkspaceClipboardPayload(payload: WorkspaceClipboardPayload | null) {
    const editor = editorRef.current;
    const boardState = boardRef.current;
    if (!editor || !boardState || !payload || payload.nodes.length === 0) return;

    const idMap = new Map<string, string>();
    const createdNodes = payload.nodes.map((node) => {
      const nextNode = cloneValue(node);
      nextNode.id = createWorkspaceNodeId(node.type || "node");
      nextNode.x += 64;
      nextNode.y += 64;
      idMap.set(node.id, nextNode.id);
      return nextNode;
    });
    const createdEdges = payload.edges
      .map((edge) => {
        const from = idMap.get(edge.from);
        const to = idMap.get(edge.to);
        if (!from || !to) return null;

        return {
          ...cloneValue(edge),
          id: createWorkspaceEdgeId(),
          from,
          to,
        } satisfies WorkspaceEdge;
      })
      .filter(Boolean) as WorkspaceEdge[];

    editor.run(() => {
      editor.createShapes(createdNodes.map((node) => nodeToCardShapePartial(node)));

      for (const edge of createdEdges) {
        const fromNode = createdNodes.find((node) => node.id === edge.from);
        const toNode = createdNodes.find((node) => node.id === edge.to);
        if (!fromNode || !toNode) continue;

        const start = edgeAnchor(fromNode, edge.fromSide || "right");
        const end = edgeAnchor(toNode, edge.toSide || "left");
        const arrowId = shapeIdForEdge(edge.id);

        editor.createShapes([
          {
            ...createArrowShapePartial({
              id: arrowId,
              edgeId: edge.id,
              fromNodeId: edge.from,
              fromSide: edge.fromSide || "right",
              start,
              end,
              toNodeId: edge.to,
              toSide: edge.toSide || "left",
              isDraft: false,
            }),
            meta: {
              edgeId: edge.id,
              from: edge.from,
              to: edge.to,
              fromSide: edge.fromSide || "right",
              toSide: edge.toSide || "left",
            },
            props: {
              kind: "arc" as const,
              dash: "draw" as const,
              size: "m" as const,
              fill: "none" as const,
              color: "black" as const,
              labelColor: "black" as const,
              bend: 0,
              start: { x: 0, y: 0 },
              end: { x: end.x - start.x, y: end.y - start.y },
              arrowheadStart: edgeEndToArrowhead(edge.fromEnd),
              arrowheadEnd: edgeEndToArrowhead(edge.toEnd),
              richText: toRichText(edge.label || ""),
              labelPosition: 0.5,
              font: "draw" as const,
              scale: 1,
              elbowMidPoint: 0.5,
            },
          },
        ]);
        editor.createBinding({
          id: bindingIdForEdge(edge.id, "start"),
          type: "arrow",
          fromId: arrowId,
          toId: shapeIdForNode(edge.from),
          props: {
            terminal: "start",
            normalizedAnchor: edgeSideToNormalizedAnchor(edge.fromSide || "right"),
            isExact: false,
            isPrecise: true,
            snap: "none",
          },
        });
        editor.createBinding({
          id: bindingIdForEdge(edge.id, "end"),
          type: "arrow",
          fromId: arrowId,
          toId: shapeIdForNode(edge.to),
          props: {
            terminal: "end",
            normalizedAnchor: edgeSideToNormalizedAnchor(edge.toSide || "left"),
            isExact: false,
            isPrecise: true,
            snap: "none",
          },
        });
      }

      editor.setSelectedShapes(createdNodes.map((node) => shapeIdForNode(node.id)));
    });

    publishWorkspaceState(editor, boardRef.current, true);
    dispatchSelectionChange(editor);
  }

  function pasteClipboardSelection() {
    const clipboard = clipboardRef.current;
    if (!clipboard) return;

    pasteWorkspaceClipboardPayload({
      version: 1,
      nodes: cloneValue(clipboard.nodes),
      edges: cloneValue(clipboard.edges),
    });
  }

  function pasteExternalTextContent(text: string) {
    const editor = editorRef.current;
    const boardState = boardRef.current;
    const normalizedText = normalizeClipboardText(text);
    if (!editor || !boardState || !normalizedText) return;

    const pastePoint = resolveWorkspacePastePoint(editor);
    const nextNode = normalizeClipboardUrl(normalizedText)
      ? buildLinkNodeFromClipboard(normalizeClipboardUrl(normalizedText)!, pastePoint)
      : buildTextNodeFromClipboard(normalizedText, pastePoint);
    const nextShape = nodeToCardShapePartial(nextNode);

    editor.createShapes([nextShape]);
    editor.setSelectedShapes([nextShape.id]);
    publishWorkspaceState(editor, boardRef.current, true);
    dispatchSelectionChange(editor);
  }

  async function pasteFromClipboard() {
    const clipboard = window.navigator?.clipboard;
    if (!clipboard) {
      pasteClipboardSelection();
      return false;
    }

    try {
      if (typeof clipboard.read === "function") {
        const items = await clipboard.read();
        if (Array.isArray(items) && items.length > 0) {
          const files: File[] = [];

          for (const [itemIndex, item] of items.entries()) {
            const htmlType = item.types.find((type) => type === "text/html");
            if (htmlType) {
              const htmlBlob = await item.getType(htmlType);
              const html = await htmlBlob.text();
              const payload = parseWorkspaceClipboardPayloadFromHtml(html);
              if (payload) {
                clipboardRef.current = {
                  nodes: cloneValue(payload.nodes),
                  edges: cloneValue(payload.edges),
                };
                pasteWorkspaceClipboardPayload(payload);
                return true;
              }

              const pastedText = normalizeClipboardText(
                new DOMParser().parseFromString(html, "text/html").body.textContent || "",
              );
              if (pastedText) {
                pasteExternalTextContent(pastedText);
                return true;
              }
            }

            const plainTextType = item.types.find((type) => type === "text/plain");
            if (plainTextType) {
              const textBlob = await item.getType(plainTextType);
              const pastedText = normalizeClipboardText(await textBlob.text());
              if (pastedText) {
                pasteExternalTextContent(pastedText);
                return true;
              }
            }

            const fileTypes = item.types.filter((type) => type.startsWith("image/"));
            for (const fileType of fileTypes) {
              const blob = await item.getType(fileType);
              files.push(blobToFile(blob, itemIndex));
            }
          }

          if (files.length > 0) {
            window.dispatchEvent(
              new CustomEvent("workspace-app:file-paste", {
                detail: {
                  files,
                },
              }),
            );
            return true;
          }
        }
      }

      if (typeof clipboard.readText === "function") {
        const pastedText = normalizeClipboardText(await clipboard.readText());
        if (pastedText) {
          pasteExternalTextContent(pastedText);
          return true;
        }
      }
    } catch (error) {
      console.error("Unable to read from system clipboard for workspace paste.", error);
    }

    if (clipboardRef.current) {
      pasteClipboardSelection();
      return true;
    }

    return false;
  }

  useEffect(() => {
    return () => {
      clearEdgeDraftListeners();
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const ownerDocument = editor.getContainer().ownerDocument;
    if (!ownerDocument) return;

    const isEditableTarget = (value: EventTarget | null) => {
      if (value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement) return true;
      if (value instanceof HTMLElement && value.isContentEditable) return true;
      if (value instanceof Element && value.closest("input, textarea, [contenteditable='true']")) return true;
      return false;
    };

    const handleCopy = (event: ClipboardEvent) => {
      // In compat mode, let the compat-mode handlers in workspace-page.js handle clipboard
      if (window.__workspaceClipboardMode === "compat") return;
      if (editor.getEditingShapeId() !== null) return;
      if (isEditableTarget(event.target) || isEditableTarget(ownerDocument.activeElement)) return;

      const exported = createClipboardSelectionExport();
      if (!exported || !event.clipboardData) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      event.clipboardData.setData("text/plain", exported.text);
      event.clipboardData.setData("text/html", exported.html);
      try {
        event.clipboardData.setData(WORKSPACE_CLIPBOARD_MIME, exported.json);
      } catch {}
    };

    const handleCut = (event: ClipboardEvent) => {
      // In compat mode, let the compat-mode handlers in workspace-page.js handle clipboard
      if (window.__workspaceClipboardMode === "compat") return;
      const exported = createClipboardSelectionExport();
      if (!exported || !event.clipboardData) return;
      if (editor.getEditingShapeId() !== null) return;
      if (isEditableTarget(event.target) || isEditableTarget(ownerDocument.activeElement)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      event.clipboardData.setData("text/plain", exported.text);
      event.clipboardData.setData("text/html", exported.html);
      try {
        event.clipboardData.setData(WORKSPACE_CLIPBOARD_MIME, exported.json);
      } catch {}

      editor.deleteShapes(editor.getSelectedShapeIds());
      publishWorkspaceState(editor, boardRef.current, true);
      dispatchSelectionChange(editor);
    };

    const handlePaste = (event: ClipboardEvent) => {
      // In compat mode, let the compat-mode handlers in workspace-page.js handle clipboard
      if (window.__workspaceClipboardMode === "compat") return;
      if (editor.getEditingShapeId() !== null) return;
      if (isEditableTarget(event.target) || isEditableTarget(ownerDocument.activeElement)) return;
      if (!event.clipboardData) return;

      const files = Array.from(event.clipboardData.files || []).filter(Boolean);
      if (files.length > 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.dispatchEvent(
          new CustomEvent("workspace-app:file-paste", {
            detail: {
              files,
            },
          }),
        );
        return;
      }

      const internalPayload =
        parseWorkspaceClipboardPayload(event.clipboardData.getData(WORKSPACE_CLIPBOARD_MIME)) ||
        parseWorkspaceClipboardPayloadFromHtml(event.clipboardData.getData("text/html"));
      if (internalPayload) {
        event.preventDefault();
        event.stopImmediatePropagation();
        clipboardRef.current = {
          nodes: cloneValue(internalPayload.nodes),
          edges: cloneValue(internalPayload.edges),
        };
        pasteWorkspaceClipboardPayload(internalPayload);
        return;
      }

      const pastedText =
        normalizeClipboardText(event.clipboardData.getData("text/plain")) ||
        normalizeClipboardText(
          new DOMParser().parseFromString(event.clipboardData.getData("text/html") || "", "text/html").body.textContent || "",
        );

      if (!pastedText) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      pasteExternalTextContent(pastedText);
    };

    ownerDocument.addEventListener("copy", handleCopy, true);
    ownerDocument.addEventListener("cut", handleCut, true);
    ownerDocument.addEventListener("paste", handlePaste, true);

    return () => {
      ownerDocument.removeEventListener("copy", handleCopy, true);
      ownerDocument.removeEventListener("cut", handleCut, true);
      ownerDocument.removeEventListener("paste", handlePaste, true);
    };
  }, [ready]);

  useEffect(() => {
    const initialBoard = window.__workspaceBoardState ? cloneValue(window.__workspaceBoardState) : null;
    if (initialBoard) {
      setBoard(initialBoard);
      boardRef.current = initialBoard;
    }

    window.__workspaceAppBridge = {
      setBoardPayload(nextBoard) {
        const normalized = cloneValue(nextBoard);
        boardRef.current = normalized;
        setBoard(normalized);
      },
      selectNodeIds(nodeIds) {
        if (!editorRef.current) return;
        editorRef.current.focus();
        editorRef.current.setSelectedShapes(nodeIds.map((nodeId) => shapeIdForNode(nodeId)));
        publishWorkspaceState(editorRef.current, boardRef.current, true);
        dispatchSelectionChange(editorRef.current);
      },
      addNode(type, point = { x: 180, y: 180 }) {
        if (!editorRef.current || !boardRef.current) return null;

        const editor = editorRef.current;
        const liveBoard = buildBoardFromEditor(editor, boardRef.current);
        const nextNode = createWorkspaceNode(type, liveBoard, point, getSelectedNodeIds(editorRef.current));
        const nextShape = nodeToCardShapePartial(nextNode);

        editor.createShapes([nextShape]);
        editor.setSelectedShapes([nextShape.id]);
        if (type === "group") {
          editor.sendToBack([nextShape.id]);
        }
        if (type === "text") {
          editor.focus();
          requestAnimationFrame(() => {
            if (!editorRef.current) return;
            editorRef.current.setSelectedShapes([nextShape.id]);
            editorRef.current.updateShapes([
              {
                id: nextShape.id,
                type: "zm-card",
                meta: {
                  isEditingText: true,
                },
              },
            ]);
            publishWorkspaceState(editorRef.current, boardRef.current, true);
            dispatchSelectionChange(editorRef.current);
            requestAnimationFrame(() => {
              const field = document.querySelector(
                `.workspace-canvas-app .canvas-textarea[data-text-node="${nextNode.id}"]`,
              );
              if (!(field instanceof HTMLTextAreaElement)) return;
              field.focus({ preventScroll: true });
              if (field.value === TEXT_NODE_PLACEHOLDER) {
                field.setSelectionRange(0, field.value.length);
              }
            });
          });
        }
        if (type === "link" || type === "group") {
          requestAnimationFrame(() => {
            const selector =
              type === "link"
                ? `.workspace-canvas-app [data-workspace-node-id="${nextNode.id}"] [data-link-field="title"]`
                : `.workspace-canvas-app [data-workspace-node-id="${nextNode.id}"] [data-group-field="label"]`;
            const field = document.querySelector(selector);
            if (!(field instanceof HTMLInputElement)) return;
            field.focus({ preventScroll: true });
            field.select();
          });
        }
        publishWorkspaceState(editor, boardRef.current, true);
        dispatchSelectionChange(editor);
        return nextNode.id;
      },
      beginEdgeDrag(fromNodeId, fromSide, clientPoint) {
        const editor = editorRef.current;
        const boardState = boardRef.current;
        if (!editor || !boardState) return;

        clearEdgeDraftListeners();

        const liveBoard = buildBoardFromEditor(editor, boardState);
        const fromNode = liveBoard.nodes.find((node) => node.id === fromNodeId);
        if (!fromNode) return;

        const start = edgeAnchor(fromNode, fromSide);
        const screenPoint = editor.screenToPage(clientPoint);
        const edgeId = `draft:${createWorkspaceEdgeId()}`;
        const arrowId = createDraftArrowId();

        editor.createShapes([
          createArrowShapePartial({
            id: arrowId,
            edgeId,
            fromNodeId,
            fromSide,
            start,
            end: { x: screenPoint.x, y: screenPoint.y },
            isDraft: true,
          }),
        ]);
        editor.createBinding({
          id: bindingIdForEdge(edgeId, "start"),
          type: "arrow",
          fromId: arrowId,
          toId: shapeIdForNode(fromNodeId),
          props: {
            terminal: "start",
            normalizedAnchor: edgeSideToNormalizedAnchor(fromSide),
            isExact: false,
            isPrecise: true,
            snap: "none",
          },
        });

        edgeDraftRef.current = {
          arrowId,
          fromNodeId,
          fromSide,
          edgeId,
        };
        publishWorkspaceState(editor, boardRef.current, true);

        const handlePointerMove = (event: PointerEvent) => {
          updateEdgeDraftAtClientPoint({
            x: event.clientX,
            y: event.clientY,
          });
        };

        const handlePointerUp = (event: PointerEvent) => {
          finishEdgeDraft({
            x: event.clientX,
            y: event.clientY,
          });
          clearEdgeDraftListeners();
        };

        const handlePointerCancel = () => {
          cancelEdgeDraft();
          clearEdgeDraftListeners();
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp, { once: true });
        window.addEventListener("pointercancel", handlePointerCancel, { once: true });
        removeEdgeDraftListenersRef.current = () => {
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerup", handlePointerUp);
          window.removeEventListener("pointercancel", handlePointerCancel);
        };
      },
      async copySelectionToClipboard() {
        return copySelectionToClipboard();
      },
      async cutSelectionToClipboard() {
        return cutSelectionToClipboard();
      },
      async pasteFromClipboard() {
        return pasteFromClipboard();
      },
      copySelection() {
        createClipboardSelectionExport();
      },
      pasteSelection() {
        pasteClipboardSelection();
      },
      setTool(toolId) {
        if (!editorRef.current) return;
        editorRef.current.setCurrentTool(toolId || "select");
        publishWorkspaceState(editorRef.current, boardRef.current, true);
      },
      undo() {
        if (!editorRef.current) return;
        editorRef.current.undo();
        publishWorkspaceState(editorRef.current, boardRef.current, true);
        dispatchSelectionChange(editorRef.current);
      },
      redo() {
        if (!editorRef.current) return;
        editorRef.current.redo();
        publishWorkspaceState(editorRef.current, boardRef.current, true);
        dispatchSelectionChange(editorRef.current);
      },
      resetView() {
        if (!editorRef.current) return;
        const targetCamera = boardRef.current?.defaultCamera || boardRef.current?.camera || { x: 96, y: 80, z: 1 };
        editorRef.current.setCamera(targetCamera, { immediate: true });
        publishWorkspaceState(editorRef.current, boardRef.current, true);
        dispatchSelectionChange(editorRef.current);
      },
    };

    return () => {
      window.__workspaceAppBridge = null;
    };
  }, []);

  useEffect(() => {
    boardRef.current = board ? cloneValue(board) : null;
    if (!editorRef.current || !board) {
      publishWorkspaceState(editorRef.current, board, ready);
      return;
    }

    isApplyingExternalBoardRef.current = true;
    syncBoardToEditor(editorRef.current, board);
    publishWorkspaceState(editorRef.current, board, ready);
    isApplyingExternalBoardRef.current = false;
  }, [board, ready]);

  return (
    <div className="workspace-tldraw-root">
      <Tldraw
        autoFocus
        cameraOptions={{
          wheelBehavior: "pan",
        }}
        hideUi
        shapeUtils={[ZmCardShapeUtil]}
        onMount={(editor) => {
          editorRef.current = editor;

          editor.store.listen(
            () => {
              if (isApplyingExternalBoardRef.current || !boardRef.current) {
                publishWorkspaceState(editor, boardRef.current, true);
                return;
              }

              const previousBoard = boardRef.current;
              const nextBoard = buildBoardFromEditor(editor, previousBoard);
              const cameraChanged =
                previousBoard.camera?.x !== nextBoard.camera?.x ||
                previousBoard.camera?.y !== nextBoard.camera?.y ||
                previousBoard.camera?.z !== nextBoard.camera?.z;
              boardRef.current = nextBoard;
              publishWorkspaceState(editor, nextBoard, true);
              dispatchSelectionChange(editor);
              window.dispatchEvent(
                new CustomEvent("workspace-app:board-change", {
                  detail: {
                    board: cloneValue(nextBoard),
                    cameraChanged,
                  },
                }),
              );
            },
            { scope: "all" },
          );

          window.__workspaceApp = {
            engine: "tldraw",
            ready: true,
            status: "ready",
          };
          setReady(true);

          if (boardRef.current) {
            isApplyingExternalBoardRef.current = true;
            syncBoardToEditor(editor, boardRef.current);
            publishWorkspaceState(editor, boardRef.current, true);
            isApplyingExternalBoardRef.current = false;
          }

          return () => {
            editorRef.current = null;
            window.__workspaceApp = {
              engine: "tldraw",
              ready: false,
              status: "idle",
            };
          };
        }}
      />
    </div>
  );
}
