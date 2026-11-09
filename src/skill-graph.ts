import type { CSSProperties } from "react";
import type { Edge, Node } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { Data, Tree } from "./domain";
import {
  evidence,
  routeTo,
  skillLabels,
  skillState,
  treeBlockers,
  treeProgress,
  treePrerequisites,
  type SkillState,
} from "./progression";

export type SkillNode = Node<
  {
    title: string;
    state: SkillState;
    rank: number;
    score: number | null;
    active: boolean;
    current?: boolean;
    dim: boolean;
    due: boolean;
    topicId?: string;
    treeId?: string;
    total?: number;
    verified?: number;
    completed?: number;
    external?: boolean;
  },
  "skill"
>;
export function buildSkillGraph(
  data: Data,
  tree: Tree,
  selected: string | undefined,
  routeOnly: boolean,
  compact: boolean,
  recommendedIds: string[] = [],
) {
  const topics = data.nodes.filter((n) => n.treeId === tree.id);
  const children = data.trees.filter((t) => t.parentTreeId === tree.id);
  const inheritedDependencies = treePrerequisites(data, tree.id).map(
    (t) => t.id,
  );
  const dependencyIds = new Set([
    ...inheritedDependencies,
    ...children.flatMap((t) => t.prerequisiteTreeIds),
  ]);
  const relatedTrees = data.trees.filter(
    (t) =>
      t.id !== tree.id &&
      (t.parentTreeId === tree.id || dependencyIds.has(t.id)),
  );
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    ranksep: 58,
    nodesep: 28,
    marginx: 64,
    marginy: 56,
  });
  topics.forEach((n) =>
    graph.setNode(`topic:${n.id}`, { width: 196, height: 96 }),
  );
  relatedTrees.forEach((t) =>
    graph.setNode(`tree:${t.id}`, { width: 220, height: 116 }),
  );
  topics.forEach((n) => {
    if (n.parentId) graph.setEdge(`topic:${n.parentId}`, `topic:${n.id}`);
    else
      for (const id of dependencyIds)
        if (inheritedDependencies.includes(id))
          graph.setEdge(`tree:${id}`, `topic:${n.id}`);
  });
  relatedTrees.forEach((t) =>
    [
      ...t.prerequisiteTreeIds,
      ...(t.parentTreeId === tree.id ? inheritedDependencies : []),
    ].forEach((id) => {
      if (relatedTrees.some((other) => other.id === id))
        graph.setEdge(`tree:${id}`, `tree:${t.id}`);
    }),
  );
  dagre.layout(graph);
  const manualPositions = new Map<string, { x: number; y: number }>();
  if (!topics.length && children.length > 2) {
    const positions = [
      [30, 225],
      [225, 55],
      [430, 220],
      [680, 45],
      [860, 250],
      [715, 470],
      [420, 430],
      [145, 545],
    ];
    children.forEach((child, index) => {
      const [x, y] = positions[index] ?? [
        30 + (index % 3) * 245,
        120 + Math.floor(index / 3) * 180,
      ];
      manualPositions.set(child.id, { x, y });
    });
  }
  const route = new Set(
    recommendedIds.length
      ? recommendedIds
      : selected
        ? routeTo(data, selected).map((n) => n.id)
        : [],
  );
  const now = Date.now();
  const nodes: SkillNode[] = topics.map((n) => {
    const p = graph.node(`topic:${n.id}`),
      progress = evidence(data, n.id);
    return {
      id: `topic:${n.id}`,
      type: "skill",
      position: { x: p.x - 98, y: p.y - 48 },
      width: 196,
      height: 96,
      draggable: false,
      focusable: true,
      ariaLabel: `${n.title}，${skillLabels[skillState(data, n)]}`,
      data: {
        topicId: n.id,
        title: n.title,
        state: skillState(data, n),
        rank: progress.rank,
        score: progress.score,
        active: selected === n.id,
        dim: routeOnly && !route.has(n.id),
        due:
          !!n.question && !!n.answer && new Date(n.card.due).getTime() <= now,
      },
    };
  });
  const selectedTopic = selected
    ? data.nodes.find((node) => node.id === selected)
    : undefined;
  relatedTrees.forEach((t) => {
    const p = graph.node(`tree:${t.id}`),
      progress = treeProgress(data, t.id);
    nodes.push({
      id: `tree:${t.id}`,
      type: "skill",
      position: manualPositions.get(t.id) ?? {
        x: p.x - 66,
        y: p.y - 66,
      },
      width: 132,
      height: 132,
      draggable: false,
      focusable: true,
      ariaLabel: `${t.parentTreeId === tree.id ? "子学习树" : "前置学习树"}：${t.title}，${progress.completed} / ${progress.total} 已完成，点击进入`,
      data: {
        title: t.title,
        treeId: t.id,
        external: t.parentTreeId !== tree.id,
        total: progress.total,
        verified: progress.verified,
        completed: progress.completed,
        state: progress.complete
          ? progress.verified === progress.total
            ? "verified"
            : "learned"
          : treeBlockers(data, t.id).length
            ? "locked"
            : "available",
        rank: progress.complete ? 2 : 0,
        score: null,
        active: false,
        current: selectedTopic
          ? selectedTopic.treeId === t.id
          : t.id === tree.id,
        dim: false,
        due: false,
      },
    });
  });
  const edges: Edge[] = topics
    .filter((n) => n.parentId)
    .map((n) => {
      const active = route.has(n.id) && route.has(n.parentId!);
      const unlocked = skillState(data, n) !== "locked";
      return {
        id: `${n.parentId}:${n.id}`,
        source: `topic:${n.parentId!}`,
        target: `topic:${n.id}`,
        type: "circuit",
        data: { active: active && !compact },
        style: {
          stroke: active
            ? "var(--primary)"
            : unlocked
              ? "var(--edge-active)"
              : "var(--edge-muted)",
          strokeWidth: active ? 2.5 : 1.5,
          strokeDasharray: unlocked ? undefined : "4 6",
          opacity: routeOnly && !active ? 0.15 : 1,
        } as CSSProperties,
      };
    });
  for (const edge of graph.edges()) {
    if (!edge.v.startsWith("tree:") && !edge.w.startsWith("tree:")) continue;
    edges.push({
      id: `dependency:${edge.v}:${edge.w}`,
      source: edge.v,
      target: edge.w,
      type: "circuit",
      style: manualPositions.size
        ? {
            stroke: "var(--edge-muted)",
            strokeWidth: 1,
            strokeDasharray: "3 7",
            opacity: 0.4,
          }
        : {
            stroke: "var(--primary)",
            strokeWidth: 2,
            strokeDasharray: "6 5",
          },
    });
  }
  if (manualPositions.size && children.length > 1) {
    const sequenceEdges: Edge[] = children.slice(0, -1).map((child, index) => {
      const next = children[index + 1];
      const from = manualPositions.get(child.id)!;
      const to = manualPositions.get(next.id)!;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const forward = horizontal ? dx >= 0 : dy >= 0;
      const sourceHandle = horizontal
        ? forward
          ? "source-right"
          : "source-left"
        : forward
          ? "source-bottom"
          : "source-top";
      const targetHandle = horizontal
        ? forward
          ? "target-left"
          : "target-right"
        : forward
          ? "target-top"
          : "target-bottom";
      return {
        id: `sequence:${child.id}:${next.id}`,
        source: `tree:${child.id}`,
        target: `tree:${next.id}`,
        sourceHandle,
        targetHandle,
        type: "circuit",
        style: {
          stroke: "#4F6877",
          strokeWidth: 2,
          strokeDasharray: "8 6",
          strokeLinecap: "round",
          opacity: 0.9,
        } as CSSProperties,
      };
    });
    return { nodes, edges: sequenceEdges };
  }
  return { nodes, edges };
}
