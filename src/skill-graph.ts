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
    ranksep: 65,
    nodesep: 35,
    marginx: 80,
    marginy: 70,
  });
  topics.forEach((n) =>
    graph.setNode(`topic:${n.id}`, { width: 170, height: 150 }),
  );
  relatedTrees.forEach((t) =>
    graph.setNode(`tree:${t.id}`, { width: 210, height: 190 }),
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
      position: { x: p.x - 85, y: p.y - 75 },
      width: 170,
      height: 150,
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
  relatedTrees.forEach((t) => {
    const p = graph.node(`tree:${t.id}`),
      progress = treeProgress(data, t.id);
    nodes.push({
      id: `tree:${t.id}`,
      type: "skill",
      position: { x: p.x - 105, y: p.y - 95 },
      width: 210,
      height: 190,
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
      style: {
        stroke: "var(--primary)",
        strokeWidth: 2,
        strokeDasharray: "6 5",
      },
    });
  }
  return { nodes, edges };
}
