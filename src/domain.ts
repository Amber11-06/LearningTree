import { z } from "zod";
import { createEmptyCard, fsrs, type Card, type Grade } from "ts-fsrs";

const id = z.string().min(1).max(100);
const date = z.iso.datetime();
const text = (max: number) => z.string().trim().max(max);
const pointsSchema = z.number().int().min(1).max(1000);
export const selfScoreSchema = z.number().min(0).max(1000).multipleOf(0.01);
const cardSchema = z.object({
  due: date,
  stability: z.number().min(0).max(1e8),
  difficulty: z.number().min(0).max(10),
  elapsed_days: z.number().min(0).max(1e8),
  scheduled_days: z.number().min(0).max(36500),
  learning_steps: z.number().int().min(0).max(1000),
  reps: z.number().int().min(0).max(1e8),
  lapses: z.number().int().min(0).max(1e8),
  state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  last_review: date.optional(),
});
export const treeSchema = z.object({
  id,
  title: text(60).min(1),
  description: text(300),
  color: z.enum(["green", "blue", "amber"]),
  createdAt: date,
  parentTreeId: id.nullable().default(null),
  prerequisiteTreeIds: z.array(id).max(99).default([]),
});
const quizQuestionSchema = z
  .object({
    id,
    type: z
      .enum([
        "single",
        "multiple",
        "boolean",
        "fill",
        "order",
        "short_answer",
        "code_reading",
        "code_fix",
        "project",
      ])
      .optional(),
    prompt: text(2000).min(1, "请填写测验题目"),
    points: pointsSchema.optional(),
    options: z.array(text(1000).min(1, "测验选项不能为空")).max(6).default([]),
    correctIndex: z.number().int().min(0).default(0),
    correctIndices: z.array(z.number().int().min(0)).max(6).optional(),
    correctOrder: z.array(z.number().int().min(0)).max(6).optional(),
    acceptedAnswers: z.array(text(2000).min(1)).max(20).optional(),
    caseSensitive: z.boolean().optional(),
    normalizeWhitespace: z.boolean().optional(),
    code: text(12000).optional(),
    language: text(30).optional(),
    referenceAnswer: text(12000).optional(),
    rubric: z.array(text(500).min(1)).min(2).max(8).optional(),
    difficulty: z.enum(["basic", "applied", "advanced"]).optional(),
    explanation: text(4000),
  })
  .superRefine((q, ctx) => {
    const type = q.type ?? "single";
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      ["single", "boolean", "multiple", "order"].includes(type) &&
      q.options.length < 2
    )
      fail("选择或排序题至少需要两个选项");
    if (
      ["single", "boolean"].includes(type) &&
      q.correctIndex >= q.options.length
    )
      fail("测验的正确答案必须对应一个现有选项");
    if (type === "boolean" && q.options.length !== 2)
      fail("判断题必须有正确、错误两个选项");
    if (type === "multiple") {
      const values = q.correctIndices ?? [];
      if (
        !values.length ||
        new Set(values).size !== values.length ||
        values.some((i) => i >= q.options.length)
      )
        fail("多选题需要不重复且有效的正确选项索引");
    }
    if (type === "order") {
      const values = q.correctOrder ?? [];
      if (
        values.length !== q.options.length ||
        new Set(values).size !== values.length ||
        values.some((i) => i >= q.options.length)
      )
        fail("排序答案必须包含每个选项且不重复");
    }
    if (["fill", "code_reading"].includes(type) && !q.acceptedAnswers?.length)
      fail("填空和代码阅读题需要至少一个可接受答案");
    if (
      ["short_answer", "code_fix", "project"].includes(type) &&
      (!q.referenceAnswer?.trim() || !q.rubric?.length)
    )
      fail("简答、改错和实战题需要参考答案与评分标准");
    if (["code_reading", "code_fix"].includes(type) && !q.code?.trim())
      fail("代码题需要提供代码片段");
  })
  .refine(
    (q) => new Set(q.options).size === q.options.length,
    "同一道测验题的选项不能重复",
  );
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
const quizAnswerSchema = z.object({
  questionId: id.optional(),
  questionNumber: z.number().int().min(1).max(30).optional(),
  points: pointsSchema.optional(),
  selfScore: selfScoreSchema.optional(),
  type: z.string().max(30).optional(),
  grading: z.enum(["automatic", "self"]).optional(),
  question: text(2000).min(1),
  selected: text(12000).min(1),
  correct: text(12000).min(1),
  responseKey: text(12000).optional(),
  answerKey: text(12000).optional(),
  code: text(12000).optional(),
  rubricResults: z
    .array(z.object({ criterion: text(500), met: z.boolean() }))
    .max(8)
    .optional(),
  explanation: text(4000),
  isCorrect: z.boolean(),
});
export const nodeSchema = z.object({
  id,
  treeId: id,
  parentId: id.nullable(),
  title: text(80).min(1),
  note: text(4000),
  learnedAt: date.optional(),
  content: text(30000).default(""),
  quiz: z.array(quizQuestionSchema).max(30).default([]),
  question: text(2000),
  answer: text(4000),
  resource: text(1000).refine(
    (v) => !v || /^https?:\/\//i.test(v),
    "链接须以 https:// 或 http:// 开头",
  ),
  card: cardSchema,
  createdAt: date,
});
export const sessionSchema = z
  .object({
    id,
    nodeId: id,
    at: date,
    minutes: z.number().int().min(1).max(720),
    confidence: z.number().int().min(1).max(5),
    correct: z.number().int().min(0).max(1000).nullable(),
    total: z.number().int().min(1).max(1000).nullable(),
    note: text(4000),
    quizAnswers: z.array(quizAnswerSchema).max(30).optional(),
  })
  .refine(
    (s) =>
      (s.correct === null && s.total === null) ||
      (s.correct !== null && s.total !== null && s.correct <= s.total),
    "正确题数不能超过总题数，且两者须同时填写",
  )
  .refine((s) => {
    if (!s.quizAnswers) return true;
    const automatic = s.quizAnswers.filter((a) => a.grading !== "self");
    return (
      s.total === (automatic.length || null) &&
      s.correct ===
        (automatic.length
          ? automatic.filter((a) => a.isCorrect).length
          : null) &&
      s.quizAnswers.every((a) =>
        a.grading === "self"
          ? !!a.rubricResults?.length &&
            (a.selfScore === undefined || a.selfScore <= (a.points ?? 1)) &&
            a.isCorrect ===
              (a.selfScore === undefined
                ? a.rubricResults.every((r) => r.met)
                : a.selfScore === (a.points ?? 1))
          : a.selfScore === undefined &&
            a.isCorrect ===
              ((a.responseKey ?? a.selected) === (a.answerKey ?? a.correct)),
      )
    );
  }, "测验成绩必须与逐题作答一致");
const reviewSchema = z.object({
  id,
  nodeId: id,
  at: date,
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  due: date,
  response: text(4000),
});
export const dataSchema = z
  .object({
    version: z.literal(1),
    demo: z.boolean(),
    settings: z.object({
      name: text(30).min(1),
      dailyMinutes: z.number().int().min(5).max(480),
    }),
    trees: z.array(treeSchema).max(100),
    nodes: z.array(nodeSchema).max(1000),
    sessions: z.array(sessionSchema).max(20000),
    reviews: z.array(reviewSchema).max(20000),
  })
  .superRefine((data, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    for (const items of [data.trees, data.nodes, data.sessions, data.reviews])
      if (new Set(items.map((x) => x.id)).size !== items.length)
        fail("数据中包含重复 ID");
    const trees = new Set(data.trees.map((t) => t.id));
    const treeMap = new Map(data.trees.map((t) => [t.id, t]));
    for (const tree of data.trees) {
      if (tree.parentTreeId && !trees.has(tree.parentTreeId))
        fail("上级学习树不存在");
      if (
        new Set(tree.prerequisiteTreeIds).size !==
        tree.prerequisiteTreeIds.length
      )
        fail("前置学习树不能重复");
      for (const prerequisite of tree.prerequisiteTreeIds)
        if (!trees.has(prerequisite)) fail("前置学习树不存在");
      const ancestors = new Set([tree.id]);
      let parent = tree.parentTreeId;
      while (parent) {
        if (ancestors.has(parent)) {
          fail("学习树的子级关系不能包含循环");
          break;
        }
        ancestors.add(parent);
        if (ancestors.size > 30) {
          fail("学习树最多支持 30 层嵌套");
          break;
        }
        parent = treeMap.get(parent)?.parentTreeId ?? null;
      }
    }
    // Completing a tree requires its children and its explicit prerequisites.
    // Check the combined graph so a child cannot depend on its own ancestor.
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visitTree = (treeId: string): boolean => {
      if (visiting.has(treeId)) return false;
      if (visited.has(treeId)) return true;
      visiting.add(treeId);
      const dependencies = [
        ...(treeMap.get(treeId)?.prerequisiteTreeIds ?? []),
        ...data.trees.filter((t) => t.parentTreeId === treeId).map((t) => t.id),
      ];
      const ancestors = new Set<string>();
      let parent = treeMap.get(treeId)?.parentTreeId;
      while (parent && !ancestors.has(parent)) {
        ancestors.add(parent);
        dependencies.push(...(treeMap.get(parent)?.prerequisiteTreeIds ?? []));
        parent = treeMap.get(parent)?.parentTreeId;
      }
      for (const dependency of dependencies)
        if (!visitTree(dependency)) return false;
      visiting.delete(treeId);
      visited.add(treeId);
      return true;
    };
    if (data.trees.some((tree) => !visitTree(tree.id)))
      fail("学习树的依赖与子级关系不能形成循环");
    const nodes = new Map(data.nodes.map((n) => [n.id, n]));
    for (const node of data.nodes) {
      if (new Set(node.quiz.map((q) => q.id)).size !== node.quiz.length)
        fail("测验题目 ID 不能重复");
      if (!trees.has(node.treeId)) fail("知识点所属学习树不存在");
      const seen = new Set([node.id]);
      let parent = node.parentId;
      while (parent) {
        const ancestor = nodes.get(parent);
        if (!ancestor || ancestor.treeId !== node.treeId) {
          fail("知识点的上级不存在或属于另一棵树");
          break;
        }
        if (seen.has(parent)) {
          fail("知识树不能包含循环");
          break;
        }
        seen.add(parent);
        if (seen.size > 30) {
          fail("知识树最多支持 30 层");
          break;
        }
        parent = ancestor.parentId;
      }
    }
    for (const item of [...data.sessions, ...data.reviews])
      if (!nodes.has(item.nodeId)) fail("学习记录对应的知识点不存在");
  });

export type Data = z.infer<typeof dataSchema>;
export type Tree = Data["trees"][number];
export type Topic = Data["nodes"][number];
export type Session = Data["sessions"][number];
export type Review = Data["reviews"][number];
export function markTopicLearned(
  data: Data,
  nodeId: string,
  now = new Date(),
): Data {
  const node = data.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error("这个知识点已不存在");
  if (node.learnedAt) return data;
  return {
    ...data,
    nodes: data.nodes.map((n) =>
      n.id === nodeId ? { ...n, learnedAt: now.toISOString() } : n,
    ),
  };
}
export const scheduler = fsrs({
  request_retention: 0.9,
  enable_fuzz: false,
  maximum_interval: 365,
});
export const uid = () => crypto.randomUUID();
export const serializeCard = (card: Card): Topic["card"] => ({
  ...card,
  due: card.due.toISOString(),
  last_review: card.last_review?.toISOString(),
});
export const emptyCard = (now = new Date()) =>
  serializeCard(createEmptyCard(now));
export const hydrateCard = (card: Topic["card"]): Card => ({
  ...card,
  due: new Date(card.due),
  last_review: card.last_review ? new Date(card.last_review) : undefined,
});
export function blankData(): Data {
  return {
    version: 1,
    demo: false,
    settings: { name: "学习者", dailyMinutes: 30 },
    trees: [],
    nodes: [],
    sessions: [],
    reviews: [],
  };
}
export function parseData(input: unknown): Data {
  return dataSchema.parse(input);
}
export const dayKey = (input: Date | string) => {
  const d = new Date(input);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function daysAgo(days: number, now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}
export function nodeScore(data: Data, nodeId: string) {
  const sessions = data.sessions
    .filter((s) => s.nodeId === nodeId && s.total !== null)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);
  const total = sessions.reduce((sum, s) => sum + (s.total ?? 0), 0);
  return total
    ? Math.round(
        (sessions.reduce((sum, s) => sum + (s.correct ?? 0), 0) / total) * 100,
      )
    : null;
}
export function topicStatus(data: Data, nodeId: string) {
  const score = nodeScore(data, nodeId);
  if (score !== null)
    return score >= 80 ? "strong" : score >= 60 ? "growing" : "weak";
  return data.sessions.some((s) => s.nodeId === nodeId) ||
    data.reviews.some((r) => r.nodeId === nodeId)
    ? "growing"
    : "new";
}
export const statusLabels = {
  strong: "掌握良好",
  growing: "学习中",
  weak: "需巩固",
  new: "未开始",
};
export function dueTopics(data: Data, now = new Date()) {
  return data.nodes
    .filter(
      (n) =>
        n.question.trim() &&
        n.answer.trim() &&
        new Date(n.card.due).getTime() <= now.getTime(),
    )
    .sort((a, b) => a.card.due.localeCompare(b.card.due));
}
export function reviewTopic(
  data: Data,
  nodeId: string,
  rating: Grade,
  response = "",
  now = new Date(),
): Data {
  const node = data.nodes.find((n) => n.id === nodeId);
  if (!node || !node.question.trim() || !node.answer.trim())
    throw new Error("请先填写回忆题和参考答案");
  if (new Date(node.card.due).getTime() > now.getTime())
    throw new Error("这张卡片尚未到复习时间");
  const next = scheduler.next(hydrateCard(node.card), now, rating);
  return parseData({
    ...data,
    nodes: data.nodes.map((n) =>
      n.id === nodeId ? { ...n, card: serializeCard(next.card) } : n,
    ),
    reviews: [
      ...data.reviews,
      {
        id: uid(),
        nodeId,
        at: now.toISOString(),
        rating,
        due: next.card.due.toISOString(),
        response,
      },
    ],
  });
}
export function descendantIds(data: Data, nodeId: string) {
  const ids = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of data.nodes)
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        changed = true;
      }
  }
  return ids;
}
export function removeTopics(data: Data, ids: Set<string>): Data {
  return {
    ...data,
    nodes: data.nodes.filter((n) => !ids.has(n.id)),
    sessions: data.sessions.filter((s) => !ids.has(s.nodeId)),
    reviews: data.reviews.filter((r) => !ids.has(r.nodeId)),
  };
}
export function removeTree(data: Data, treeId: string): Data {
  const tree = data.trees.find((t) => t.id === treeId);
  const ids = new Set(
    data.nodes.filter((n) => n.treeId === treeId).map((n) => n.id),
  );
  return {
    ...removeTopics(data, ids),
    trees: data.trees
      .filter((t) => t.id !== treeId)
      .map((t) => ({
        ...t,
        parentTreeId:
          t.parentTreeId === treeId
            ? (tree?.parentTreeId ?? null)
            : t.parentTreeId,
        prerequisiteTreeIds: t.prerequisiteTreeIds.filter(
          (id) => id !== treeId,
        ),
      })),
  };
}
export function weeklyActivity(data: Data, now = new Date()) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = daysAgo(6 - i, now);
    const sessions = data.sessions.filter((s) => dayKey(s.at) === dayKey(date));
    return {
      date,
      minutes: sessions.reduce((sum, s) => sum + s.minutes, 0),
      reviews: data.reviews.filter((r) => dayKey(r.at) === dayKey(date)).length,
    };
  });
}
export function feedback(data: Data, now = new Date()) {
  const due = dueTopics(data, now);
  const scored = data.nodes
    .map((n) => ({ node: n, score: nodeScore(data, n.id) }))
    .filter((x): x is { node: Topic; score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score);
  const weak = scored.find((x) => x.score < 60);
  const logs = [...data.sessions].sort((a, b) => b.at.localeCompare(a.at));
  const latestTests = logs.filter(
    (s, i) =>
      s.total !== null &&
      !logs
        .slice(0, i)
        .some(
          (previous) => previous.nodeId === s.nodeId && previous.total !== null,
        ),
  );
  const overconfident = latestTests.find(
    (s) =>
      s.total &&
      s.correct !== null &&
      s.correct / s.total < 0.6 &&
      s.confidence >= 4,
  );
  const signals: {
    title: string;
    detail: string;
    action: string;
    nodeId?: string;
    kind: "review" | "study" | "create";
  }[] = [];
  if (due.length)
    signals.push({
      title: `${due.length} 个知识点待复习`,
      detail: "按到期顺序复习；先回忆，再自评。",
      action: "开始复习",
      kind: "review",
    });
  if (weak)
    signals.push({
      title: `复习「${weak.node.title}」`,
      detail: `最近最多 5 次自测的加权正确率为 ${weak.score}%。建议先回看错题，再做一次不同题目的自测。`,
      action: "记录学习",
      nodeId: weak.node.id,
      kind: "study",
    });
  if (overconfident)
    signals.push({
      title: `「${data.nodes.find((n) => n.id === overconfident.nodeId)?.title}」自测正确率低于 60%`,
      detail: "本次信心较高，但自测低于 60%。用一道新题检验理解。",
      action: "记录学习",
      nodeId: overconfident.nodeId,
      kind: "study",
    });
  if (!signals.length)
    signals.push(
      data.nodes.length
        ? {
            title: "暂无待复习或待巩固知识点",
            detail: "记录一次学习或自测后，这里会显示建议。",
            action: "记录学习",
            kind: "study",
            nodeId: data.nodes[0].id,
          }
        : {
            title: "暂无学习树",
            detail: "创建学习树并添加知识点。",
            action: "创建学习树",
            kind: "create",
          },
    );
  return signals.slice(0, 3);
}
