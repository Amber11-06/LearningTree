import { type Data, type Topic } from "./domain";

export type SkillState =
  "locked" | "available" | "learning" | "learned" | "verified" | "consolidated";
export const skillLabels: Record<SkillState, string> = {
  locked: "前置未完成",
  available: "可开始",
  learning: "学习中",
  learned: "已标记已学",
  verified: "已验证",
  consolidated: "已巩固",
};
export function evidence(data: Data, nodeId: string) {
  const sessions = data.sessions
    .filter((s) => s.nodeId === nodeId)
    .sort((a, b) => b.at.localeCompare(a.at));
  const tests = sessions.filter((s) => s.total !== null).slice(0, 5);
  const questions = tests.reduce((sum, s) => sum + (s.total ?? 0), 0);
  const correct = tests.reduce((sum, s) => sum + (s.correct ?? 0), 0);
  const score = questions
    ? Math.round((correct / questions) * 1000) / 10
    : null;
  const verified = questions >= 5 && correct / questions >= 0.8;
  const markedLearned = !!data.nodes.find((n) => n.id === nodeId)?.learnedAt;
  const recall =
    verified &&
    data.reviews.some(
      (r) => r.nodeId === nodeId && r.rating >= 3 && r.at >= tests[0].at,
    );
  return {
    score,
    questions,
    sessions: sessions.length,
    minutes: sessions.reduce((sum, s) => sum + s.minutes, 0),
    verified,
    markedLearned,
    completed: verified || markedLearned,
    rank: recall
      ? 3
      : verified
        ? 2
        : sessions.length || data.reviews.some((r) => r.nodeId === nodeId)
          ? 1
          : 0,
  };
}
export function skillState(data: Data, node: Topic): SkillState {
  const progress = evidence(data, node.id);
  if (progress.rank === 3) return "consolidated";
  if (progress.rank === 2) return "verified";
  if (progress.markedLearned) return "learned";
  if (treeBlockers(data, node.treeId).length) return "locked";
  if (progress.rank === 1) return "learning";
  return !node.parentId || evidence(data, node.parentId).completed
    ? "available"
    : "locked";
}
export function routeTo(data: Data, id: string) {
  const path: Topic[] = [],
    seen = new Set<string>();
  let node = data.nodes.find((n) => n.id === id);
  while (node && !seen.has(node.id)) {
    path.unshift(node);
    seen.add(node.id);
    node = data.nodes.find((n) => n.id === node!.parentId);
  }
  return path;
}
export function nextSkill(data: Data, treeId: string) {
  const nodes = data.nodes.filter((n) => n.treeId === treeId);
  return (
    nodes.find((n) => skillState(data, n) === "learning") ??
    nodes.find((n) => skillState(data, n) === "available") ??
    nodes[0]
  );
}
export function newlyUnlocked(before: Data, after: Data) {
  return after.nodes.filter((node) => {
    const previous = before.nodes.find((n) => n.id === node.id);
    return (
      previous &&
      skillState(before, previous) === "locked" &&
      skillState(after, node) === "available"
    );
  });
}

export function treeProgress(data: Data, treeId: string) {
  return calculateTreeProgress(data, treeId, new Set<string>(), new Map());
}
function calculateTreeProgress(
  data: Data,
  treeId: string,
  visiting: Set<string>,
  cache: Map<
    string,
    { total: number; verified: number; completed: number; complete: boolean }
  >,
): { total: number; verified: number; completed: number; complete: boolean } {
  const cached = cache.get(treeId);
  if (cached) return cached;
  if (visiting.has(treeId))
    return { total: 0, verified: 0, completed: 0, complete: false };
  const branch = new Set(visiting).add(treeId);
  const ids = new Set([treeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const tree of data.trees)
      if (
        tree.parentTreeId &&
        ids.has(tree.parentTreeId) &&
        !ids.has(tree.id)
      ) {
        ids.add(tree.id);
        changed = true;
      }
  }
  const nodes = data.nodes.filter((n) => ids.has(n.treeId));
  const verified = nodes.filter((n) => evidence(data, n.id).verified).length;
  const completed = nodes.filter((n) => evidence(data, n.id).completed).length;
  // An empty leaf tree has no learning evidence and cannot unlock dependants.
  const leaves = data.trees.filter(
    (t) =>
      ids.has(t.id) && !data.trees.some((child) => child.parentTreeId === t.id),
  );
  const hasEmptyLeaf = leaves.some(
    (t) => !data.nodes.some((n) => n.treeId === t.id),
  );
  const prerequisites = new Set(
    [...ids].flatMap((id) => treePrerequisites(data, id).map((t) => t.id)),
  );
  const prerequisitesComplete = [...prerequisites].every(
    (id) => calculateTreeProgress(data, id, branch, cache).complete,
  );
  const result = {
    total: nodes.length,
    verified,
    completed,
    complete:
      nodes.length > 0 &&
      completed === nodes.length &&
      !hasEmptyLeaf &&
      prerequisitesComplete,
  };
  cache.set(treeId, result);
  return result;
}

export function treePrerequisites(data: Data, treeId: string) {
  const prerequisites = new Set<string>();
  const seen = new Set<string>();
  let tree = data.trees.find((t) => t.id === treeId);
  while (tree && !seen.has(tree.id)) {
    seen.add(tree.id);
    tree.prerequisiteTreeIds.forEach((id) => prerequisites.add(id));
    tree = data.trees.find((t) => t.id === tree!.parentTreeId);
  }
  return data.trees.filter((t) => prerequisites.has(t.id));
}
export function treeBlockers(data: Data, treeId: string) {
  return treePrerequisites(data, treeId).filter(
    (t) => !treeProgress(data, t.id).complete,
  );
}
