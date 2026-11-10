import { useEffect, useMemo, useState, type RefObject } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useReactFlow,
  useViewport,
  type EdgeProps,
  type NodeProps,
} from "@xyflow/react";
import {
  Check,
  Crosshair,
  Expand,
  LockKeyhole,
  Minus,
  Play,
  Plus,
  Route,
  Scan,
  Trophy,
} from "lucide-react";
import { nextSkill, skillLabels } from "./progression";
import { CardMeteors } from "./CardMeteors";
import { buildSkillGraph, type SkillNode } from "./skill-graph";
import type { Data, Tree } from "./domain";
import { skillIcon } from "./skill-icons";
import { useTreeCamera, type SkillFocusRequest } from "./useTreeCamera";
import { useTreeTransition } from "./useTreeTransition";
export type { SkillFocusRequest } from "./useTreeCamera";
import "@xyflow/react/dist/style.css";
import "./skill-tree.css";
import "./star-map.css";

const nodeTypes = { skill: SkillNodeView };
const edgeTypes = { circuit: CircuitEdge };
const noRecommendedIds: string[] = [];

function SkillNodeView({ data }: NodeProps<SkillNode>) {
  const Icon = skillIcon(data.title);
  if (data.treeId) {
    const [rawIndex, ...titleParts] = data.title.split(" · ");
    const hasIndex = /^\d+$/.test(rawIndex);
    const displayTitle = hasIndex ? titleParts.join(" · ") : data.title;
    const percentage = data.total
      ? Math.round(((data.completed ?? 0) / data.total) * 100)
      : 0;
    const isDone =
      data.state === "verified" || data.state === "learned";
    const isLocked = data.state === "locked";
    const isLearning = data.state === "learning";
    const ringLength = 351.86;
    return (
      <div
        className={`skill-node subtree-node star-subtree ${data.state}${data.current ? " is-current" : ""}${data.dim ? " is-dim" : ""}`}
      >
        <svg className="star-progress" viewBox="0 0 128 128" aria-hidden="true">
          <circle className="track" cx="64" cy="64" r="56" />
          <circle
            className="value"
            cx="64"
            cy="64"
            r="56"
            strokeDasharray={ringLength}
            strokeDashoffset={
              isLocked ? ringLength : ringLength * (1 - percentage / 100)
            }
          />
        </svg>
        <span className={`star-status ${data.state}`}>
          {isLocked ? (
            <LockKeyhole size={11} />
          ) : isDone ? (
            <Check size={12} />
          ) : isLearning || data.current ? (
            <Play size={10} fill="currentColor" />
          ) : (
            <span className="star-hollow" />
          )}
        </span>
        <strong title={data.title}>{displayTitle}</strong>
        {data.current && (
          <span className="star-count">
            {data.completed ?? 0} / {data.total ?? 0}
          </span>
        )}
        <Handle
          type="target"
          position={Position.Left}
          id="target-left"
          className="edge-handle"
        />
        <Handle
          type="target"
          position={Position.Right}
          id="target-right"
          className="edge-handle"
        />
        <Handle
          type="target"
          position={Position.Top}
          id="target-top"
          className="edge-handle"
        />
        <Handle
          type="target"
          position={Position.Bottom}
          id="target-bottom"
          className="edge-handle"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="source-right"
          className="edge-handle"
        />
        <Handle
          type="source"
          position={Position.Left}
          id="source-left"
          className="edge-handle"
        />
        <Handle
          type="source"
          position={Position.Top}
          id="source-top"
          className="edge-handle"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="source-bottom"
          className="edge-handle"
        />
      </div>
    );
  }
  return (
    <div
      className={`skill-node star-topic ${data.state} ${data.active ? "is-selected" : ""} ${data.dim ? "is-dim" : ""}`}
    >
      <CardMeteors count={3} />
      <Handle type="target" position={Position.Left} />
      <div className="skill-emblem">
        <div className="skill-orbit" />
        <div className="skill-hex">
          <Icon size={27} strokeWidth={1.5} />
        </div>
        {data.state === "locked" ? (
          <span className="skill-badge">
            <LockKeyhole size={10} />
          </span>
        ) : data.rank >= 2 || data.state === "learned" ? (
          <span className="skill-badge">
            <Check size={12} />
          </span>
        ) : (
          data.due && <span className="skill-due" title="有待复习题目" />
        )}
      </div>
      <strong title={data.title}>{data.title}</strong>
      <div className="skill-rank" aria-label={`成长阶段 ${data.rank} / 3`}>
        {[1, 2, 3].map((n) => (
          <i key={n} className={data.rank >= n ? "earned" : ""} />
        ))}
      </div>
      <span className="skill-state">
        {data.state === "learned"
          ? `已学${data.score !== null ? ` · 自测 ${data.score}%` : ""}`
          : data.score !== null
            ? `自测 ${data.score}%`
            : skillLabels[data.state]}
      </span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
function CircuitEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    ...props,
    curvature: 0.26,
  });
  return (
    <>
      <BaseEdge
        path={path}
        style={props.style}
        interactionWidth={0}
        label={props.label}
        labelStyle={props.labelStyle}
        labelX={labelX}
        labelY={labelY}
      />
      {props.data?.active === true && (
        <path d={path} className="route-energy" fill="none" />
      )}
    </>
  );
}
export function SkillTree(props: {
  data: Data;
  tree: Tree;
  onSelect: (id: string) => void;
  compact?: boolean;
  selected?: string;
  routeOnly?: boolean;
  recommendedIds?: string[];
  focusRequest?: SkillFocusRequest;
  onFocusHandled?: (request: SkillFocusRequest) => void;
  onOpenTree?: (id: string) => void;
}) {
  const transition = useTreeTransition(props);
  return (
    <ReactFlowProvider>
      <MapView
        {...transition.props}
        container={transition.container}
        switching={transition.switching}
      />
    </ReactFlowProvider>
  );
}
function MapView({
  data,
  tree,
  onSelect,
  compact = false,
  selected,
  routeOnly = false,
  recommendedIds = noRecommendedIds,
  focusRequest,
  onFocusHandled,
  onOpenTree,
  container,
  switching,
}: {
  data: Data;
  tree: Tree;
  onSelect: (id: string) => void;
  compact?: boolean;
  selected?: string;
  routeOnly?: boolean;
  recommendedIds?: string[];
  focusRequest?: SkillFocusRequest;
  onFocusHandled?: (request: SkillFocusRequest) => void;
  onOpenTree?: (id: string) => void;
  container: RefObject<HTMLDivElement | null>;
  switching: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const flow = useReactFlow<SkillNode>();
  const { zoom } = useViewport();
  const effective = selected ?? nextSkill(data, tree.id)?.id;
  const graph = useMemo(
    () =>
      buildSkillGraph(
        data,
        tree,
        effective,
        routeOnly,
        compact,
        recommendedIds,
      ),
    [data, tree, effective, routeOnly, compact, recommendedIds],
  );
  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const visibleEdges = useMemo(() => {
    if (!hoveredId) return graph.edges;
    const source = `topic:${hoveredId}`;
    return graph.edges.map((edge) => {
      if (edge.source !== source && edge.target !== source) return edge;
      return {
        ...edge,
        data: { ...edge.data, active: true },
        style: {
          ...edge.style,
          stroke: "var(--primary)",
          strokeWidth: 2.5,
          strokeDasharray: undefined,
          opacity: 1,
        },
      };
    });
  }, [graph.edges, hoveredId]);
  const { controlCamera, fit, centerOnNode } = useTreeCamera({
    treeId: tree.id,
    compact,
    nodes: graph.nodes,
    focusRequest,
    onFocusHandled,
    reduced,
  });
  function changeZoom(direction: "in" | "out") {
    controlCamera();
    if (direction === "in") void flow.zoomIn({ duration: reduced ? 0 : 160 });
    else void flow.zoomOut({ duration: reduced ? 0 : 160 });
  }
  const focus = () =>
    centerOnNode(`topic:${effective ?? ""}`, compact ? 0.72 : 0.9);
  useEffect(() => {
    if (!expanded) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [expanded]);
  return (
    <div
      ref={container}
      inert={switching}
      aria-busy={switching}
      className={`skill-map ${compact ? "is-compact" : ""} ${expanded ? "is-expanded" : ""}`}
      onPointerDownCapture={(event) => {
        if ((event.target as HTMLElement).closest(".react-flow__minimap"))
          controlCamera();
      }}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest("input,textarea,select"))
          return;
        if (event.key === "Escape") setExpanded(false);
        if (event.key === "Enter" || event.key === " ") {
          const id = (event.target as HTMLElement)
            .closest(".react-flow__node")
            ?.getAttribute("data-id");
          if (id) {
            event.preventDefault();
            const node = flow.getNode(id);
            if (node?.data.treeId) onOpenTree?.(node.data.treeId);
            else if (node?.data.topicId) onSelect(node.data.topicId);
          }
        }
        if (event.key.toLowerCase() === "f") {
          event.preventDefault();
          fit();
        }
        if (event.key === "+") changeZoom("in");
        if (event.key === "-") changeZoom("out");
      }}
    >
      <svg className="skill-edge-defs" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="skill-edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8fb8d8" />
            <stop offset="50%" stopColor="#2f6399" />
            <stop offset="100%" stopColor="#4f88b8" />
          </linearGradient>
        </defs>
      </svg>
      <ReactFlow<SkillNode>
        nodes={graph.nodes}
        edges={visibleEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) =>
          node.data.treeId
            ? onOpenTree?.(node.data.treeId)
            : node.data.topicId && onSelect(node.data.topicId)
        }
        onNodeMouseEnter={(_, node) =>
          setHoveredId(node.data.topicId ?? null)
        }
        onNodeMouseLeave={() => setHoveredId(null)}
        onNodeDoubleClick={(_, node) => centerOnNode(node.id, 1.15)}
        nodesDraggable={false}
        deleteKeyCode={null}
        nodesConnectable={false}
        edgesFocusable={false}
        nodesFocusable={true}
        elementsSelectable={false}
        selectNodesOnDrag={false}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={false}
        minZoom={0.1}
        maxZoom={1.6}
        preventScrolling={!compact}
        onMoveStart={(event) => {
          if (event) controlCamera();
        }}
        colorMode="light"
        ariaLabelConfig={{
          "node.a11yDescription.default":
            "按 Enter 或空格查看节点任务；双击聚焦。",
          "node.a11yDescription.keyboardDisabled": "点击查看节点任务。",
          "edge.a11yDescription.default": "知识点之间的前置关系。",
        }}
        aria-label={`${tree.title}，可拖拽和缩放的技能地图`}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="var(--map-grid)"
          gap={24}
          size={1}
        />
        {!compact && (
          <Panel position="top-left" className="map-caption">
            <span className="map-live" />
            <span>SKILL CONSTELLATION</span>
            <small>{graph.nodes.length} NODES</small>
          </Panel>
        )}
        {!compact && (
          <Panel position="top-right">
            <button
              className="map-button"
              aria-label={expanded ? "退出全屏地图" : "展开全屏地图"}
              onClick={() => setExpanded((v) => !v)}
            >
              <Expand size={16} />
            </button>
          </Panel>
        )}
        {!compact && (
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => {
              const state = (n as SkillNode).data.state;
              return state === "verified" ||
                state === "consolidated" ||
                state === "learned"
                ? "var(--status-complete)"
                : state === "learning"
                  ? "var(--status-learning)"
                  : state === "locked"
                    ? "var(--slate-8)"
                    : "var(--blue-5)";
            }}
            nodeStrokeWidth={0}
            nodeBorderRadius={4}
            maskColor="var(--map-mask)"
            ariaLabel="技能树导航小地图"
          />
        )}
        <Panel position="bottom-left" className="map-bottom">
          <div className="map-controls">
            <button onClick={() => changeZoom("out")} aria-label="缩小地图">
              <Minus size={16} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => changeZoom("in")} aria-label="放大地图">
              <Plus size={16} />
            </button>
            <i />
            <button
              onClick={fit}
              aria-label="恢复默认居中视图"
              title="恢复默认居中视图 · F"
            >
              <Scan size={17} />
            </button>
            <button
              onClick={focus}
              aria-label="定位当前节点"
              title="定位当前节点"
            >
              <Crosshair size={17} />
            </button>
          </div>
          {!compact && (
            <span className="map-hint">
              悬停节点查看关联路径 · 拖动探索 · 滚轮缩放
            </span>
          )}
        </Panel>
        {!compact && (
          <Panel position="top-center" className="map-legend">
            <span>
              <i className="verified" />
              已完成
            </span>
            <span>
              <i className="learning" />
              学习中
            </span>
            <span>
              <i className="available" />
              可开始
            </span>
            <span>
              <LockKeyhole size={10} />
              未开始
            </span>
          </Panel>
        )}
        {!graph.nodes.length && (
          <Panel position="top-center" className="empty-map">
            <Trophy size={34} />
            <h3>暂无知识点</h3>
            <p>添加第一个知识点。</p>
          </Panel>
        )}
        {routeOnly && !compact && (
          <Panel position="bottom-center" className="route-mode">
            <Route size={13} />
            正在高亮前置路线
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
