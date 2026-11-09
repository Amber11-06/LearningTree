import { describe, expect, it } from "vitest";
import {
  blankData,
  emptyCard,
  parseData,
  markTopicLearned,
  removeTree,
  type Data,
} from "./domain";
import { demoData } from "./demo";
import { lessons } from "./lessons";
import {
  evidence,
  newlyUnlocked,
  skillState,
  treeBlockers,
  treeProgress,
} from "./progression";
import { recommendedRoute } from "./recommended-routes";
import { gradeQuiz } from "./quiz";
import { buildSkillGraph } from "./skill-graph";
import { mergeCoursePackage, parseCoursePackage } from "./course-package";

const now = new Date("2026-10-22T10:00:00Z");
function fixture() {
  const data = blankData();
  for (const id of ["root", "child", "prerequisite"]) {
    data.trees.push({
      id,
      title: id,
      description: "",
      color: "blue",
      createdAt: now.toISOString(),
      parentTreeId: id === "child" ? "root" : null,
      prerequisiteTreeIds: [],
    });
    data.nodes.push({
      id: `${id}-topic`,
      treeId: id,
      parentId: null,
      title: id,
      note: "",
      content: "",
      quiz: [],
      question: "",
      answer: "",
      resource: "",
      card: emptyCard(now),
      createdAt: now.toISOString(),
    });
  }
  return data;
}
function verify(data: Data, nodeId: string) {
  data.sessions.push({
    id: `pass-${nodeId}`,
    nodeId,
    at: now.toISOString(),
    minutes: 5,
    confidence: 3,
    correct: 5,
    total: 5,
    note: "",
  });
}

describe("nested trees and prerequisite contracts", () => {
  it("migrates legacy trees and roundtrips tree relationships without losing evidence", () => {
    const legacy = JSON.parse(JSON.stringify(demoData(now)));
    for (const tree of legacy.trees) {
      delete tree.parentTreeId;
      delete tree.prerequisiteTreeIds;
    }
    const restored = parseData(legacy);
    expect(
      restored.trees.every(
        (t) => t.parentTreeId === null && !t.prerequisiteTreeIds.length,
      ),
    ).toBe(true);
    expect(restored.sessions).toEqual(legacy.sessions);
    const nested = fixture();
    nested.trees[1].prerequisiteTreeIds = ["prerequisite"];
    expect(parseData(JSON.parse(JSON.stringify(nested)))).toEqual(
      parseData(nested),
    );
  });
  it("rejects missing references, repeated prerequisites and self-dependencies", () => {
    for (const change of [
      (d: Data) => {
        d.trees[0].parentTreeId = "missing";
      },
      (d: Data) => {
        d.trees[0].prerequisiteTreeIds = ["missing"];
      },
      (d: Data) => {
        d.trees[0].prerequisiteTreeIds = ["prerequisite", "prerequisite"];
      },
      (d: Data) => {
        d.trees[0].prerequisiteTreeIds = ["root"];
      },
    ]) {
      const data = fixture();
      change(data);
      expect(() => parseData(data)).toThrow();
    }
  });
  it("rejects hierarchy cycles and cycles mixing dependencies with containment", () => {
    const hierarchy = fixture();
    hierarchy.trees[0].parentTreeId = "child";
    expect(() => parseData(hierarchy)).toThrow("循环");
    const mixed = fixture();
    mixed.trees[1].prerequisiteTreeIds = ["root"];
    expect(() => parseData(mixed)).toThrow("循环");
    const inherited = fixture();
    inherited.trees[0].prerequisiteTreeIds = ["child"];
    expect(() => parseData(inherited)).toThrow("循环");
    const indirect = fixture();
    indirect.trees[1].prerequisiteTreeIds = ["prerequisite"];
    indirect.trees[2].prerequisiteTreeIds = ["root"];
    expect(() => parseData(indirect)).toThrow("循环");
  });
  it("preserves children and their records while cleaning references when a tree is deleted", () => {
    const data = fixture();
    data.trees[2].prerequisiteTreeIds = ["root"];
    verify(data, "child-topic");
    verify(data, "root-topic");
    const next = parseData(removeTree(data, "root"));
    expect(next.trees.find((t) => t.id === "child")?.parentTreeId).toBeNull();
    expect(
      next.trees.find((t) => t.id === "prerequisite")?.prerequisiteTreeIds,
    ).toEqual([]);
    expect(next.nodes.map((n) => n.id)).toEqual([
      "child-topic",
      "prerequisite-topic",
    ]);
    expect(next.sessions.map((s) => s.nodeId)).toEqual(["child-topic"]);
  });
  it("requires actual evidence in all descendants and prerequisites for tree completion", () => {
    const data = fixture();
    data.trees[1].prerequisiteTreeIds = ["prerequisite"];
    verify(data, "root-topic");
    verify(data, "child-topic");
    expect(treeProgress(data, "root")).toEqual({
      total: 2,
      verified: 2,
      completed: 2,
      complete: false,
    });
    verify(data, "prerequisite-topic");
    expect(treeProgress(data, "root").complete).toBe(true);
    data.nodes = data.nodes.filter((n) => n.treeId !== "child");
    expect(treeProgress(data, "root").complete).toBe(false);
  });
});

describe("recommended learning routes", () => {
  it("uses the curated order, respects parents, and advances after verification", () => {
    const data = demoData(now);
    const route = recommendedRoute(data, "web");
    expect(route.next?.id).toBe("css");
    expect(route.nodes.findIndex((n) => n.id === "css")).toBeLessThan(
      route.nodes.findIndex((n) => n.id === "box-model"),
    );
    data.sessions = data.sessions.filter((s) => s.nodeId !== "css");
    verify(data, "css");
    expect(recommendedRoute(data, "web").next?.id).toBe("box-model");
  });
  it("recommends prerequisite trees before gated local topics, including inherited prerequisites", () => {
    const data = fixture();
    data.trees[0].prerequisiteTreeIds = ["prerequisite"];
    expect(recommendedRoute(data, "root").next?.id).toBe("prerequisite-topic");
    expect(recommendedRoute(data, "child").next?.id).toBe("prerequisite-topic");
    expect(skillState(data, data.nodes[1])).toBe("locked");
    verify(data, "prerequisite-topic");
    expect(treeBlockers(data, "child")).toEqual([]);
    expect(recommendedRoute(data, "child").next?.id).toBe("child-topic");
  });
  it("includes nested topics once and never fabricates completion for an empty prerequisite", () => {
    const data = fixture();
    data.trees[0].prerequisiteTreeIds = ["prerequisite"];
    expect(recommendedRoute(data, "root").nodes.map((n) => n.id)).toEqual([
      "prerequisite-topic",
      "root-topic",
      "child-topic",
    ]);
    data.nodes = data.nodes.filter((n) => n.treeId !== "prerequisite");
    const route = recommendedRoute(data, "root");
    expect(route.next).toBeUndefined();
    expect(route.blocked?.id).toBe("prerequisite");
  });
  it("orders custom trees by actual prerequisites and tolerates removed curated nodes", () => {
    const data = fixture();
    data.nodes[1].treeId = "root";
    data.nodes[1].parentId = "root-topic";
    data.nodes.reverse();
    expect(recommendedRoute(data, "root").nodes.map((n) => n.id)).toEqual([
      "root-topic",
      "child-topic",
    ]);
    const demo = demoData(now);
    demo.nodes = demo.nodes.filter((n) => n.id !== "deploy");
    expect(
      recommendedRoute(demo, "web").nodes.some((n) => n.id === "deploy"),
    ).toBe(false);
  });
  it("offers no further node after every route topic is verified", () => {
    const data = fixture();
    verify(data, "root-topic");
    verify(data, "child-topic");
    expect(recommendedRoute(data, "root").next).toBeUndefined();
    expect(recommendedRoute(data, "root").blocked).toBeUndefined();
  });
});

describe("marking a topic as learned", () => {
  it("advances recommendations and unlocks direct children without inventing test evidence", () => {
    const before = demoData(now);
    const after = markTopicLearned(before, "css", now);
    const progress = evidence(after, "css");
    expect(progress.completed).toBe(true);
    expect(progress.markedLearned).toBe(true);
    expect(progress.verified).toBe(false);
    expect(progress.score).toBe(evidence(before, "css").score);
    expect(after.sessions).toBe(before.sessions);
    expect(after.reviews).toBe(before.reviews);
    expect(
      skillState(
        after,
        after.nodes.find((n) => n.id === "css")!,
      ),
    ).toBe("learned");
    expect(recommendedRoute(after, "web").next?.id).toBe("box-model");
    expect(
      newlyUnlocked(before, after)
        .map((n) => n.id)
        .sort(),
    ).toEqual(["box-model", "grid", "responsive"]);
    expect(parseData(JSON.parse(JSON.stringify(after)))).toEqual(after);
  });
  it("advances subtree completion and cross-tree dependencies using explicit learned marks", () => {
    let data = fixture();
    data.trees[0].prerequisiteTreeIds = ["prerequisite"];
    data = markTopicLearned(data, "prerequisite-topic", now);
    expect(treeBlockers(data, "root")).toEqual([]);
    expect(recommendedRoute(data, "root").next?.id).toBe("root-topic");
    data = markTopicLearned(data, "root-topic", now);
    data = markTopicLearned(data, "child-topic", now);
    expect(treeProgress(data, "root")).toEqual({
      total: 2,
      verified: 0,
      completed: 2,
      complete: true,
    });
    expect(recommendedRoute(data, "root").next).toBeUndefined();
    expect(data.sessions).toEqual([]);
  });
  it("is idempotent, preserves cards and does not silently mark ancestors or descendants", () => {
    const before = demoData(now);
    const after = markTopicLearned(before, "grid", now);
    expect(
      markTopicLearned(after, "grid", new Date(now.getTime() + 60000)),
    ).toBe(after);
    expect(after.nodes.find((n) => n.id === "grid")?.card).toBe(
      before.nodes.find((n) => n.id === "grid")?.card,
    );
    expect(evidence(after, "css").completed).toBe(false);
    expect(evidence(after, "box-model").completed).toBe(false);
    expect(recommendedRoute(after, "web").next?.id).toBe("css");
    expect(() => markTopicLearned(after, "missing", now)).toThrow("不存在");
  });
  it("keeps the learner mark on course updates and never imports marks from authored packages", () => {
    const before = fixture();
    before.nodes[0].note = "保留我的笔记";
    const data = markTopicLearned(before, "root-topic", now);
    const pack = parseCoursePackage({
      format: "learning-tree-course",
      version: 1,
      name: "更新课程",
      trees: before.trees,
      nodes: before.nodes.map((n) => ({
        ...n,
        title: `更新 ${n.title}`,
        learnedAt: now.toISOString(),
      })),
    });
    expect(pack.nodes.every((n) => !("learnedAt" in n))).toBe(true);
    const after = mergeCoursePackage(data, pack, now);
    expect(after.nodes[0].learnedAt).toBe(now.toISOString());
    expect(after.nodes[0].note).toBe("保留我的笔记");
    expect(after.nodes[1].learnedAt).toBeUndefined();
    expect(after.nodes[0].title).toBe("更新 root");
  });
});

describe("publisher-provided built-in assessments", () => {
  it("provides every built-in node with a lesson and five independently gradable questions", () => {
    const data = demoData(now);
    expect(data.nodes).toHaveLength(22);
    for (const node of data.nodes) {
      expect(node.content.length, node.title).toBeGreaterThan(150);
      expect(node.quiz, node.title).toHaveLength(5);
      const session = gradeQuiz(
        node.id,
        node.quiz,
        node.quiz.map((q) => q.correctIndex),
        5,
        3,
        now,
      );
      expect(session.correct, node.title).toBe(5);
      expect(session.quizAnswers?.every((a) => a.explanation.length > 0)).toBe(
        true,
      );
      expect(lessons[node.id].quiz).toEqual(node.quiz);
      const result = parseData({
        ...data,
        sessions: [
          ...data.sessions.filter((s) => s.nodeId !== node.id),
          session,
        ],
      });
      expect(evidence(result, node.id).verified).toBe(true);
    }
  });
});

describe("nested-tree map contract", () => {
  it("renders larger tree nodes and real dependency edges without dangling endpoints", () => {
    const data = fixture();
    data.trees[1].prerequisiteTreeIds = ["prerequisite"];
    const graph = buildSkillGraph(
      data,
      data.trees[0],
      "root-topic",
      false,
      false,
    );
    const child = graph.nodes.find((n) => n.data.treeId === "child")!;
    const prerequisite = graph.nodes.find(
      (n) => n.data.treeId === "prerequisite",
    )!;
    expect(child.width).toBe(132);
    expect(child.height).toBe(132);
    expect(child.data.external).toBe(false);
    expect(prerequisite.data.external).toBe(true);
    const dependency = graph.edges.find(
      (edge) => edge.source === prerequisite.id && edge.target === child.id,
    );
    expect(dependency).toBeDefined();
    expect(dependency?.label).toBeUndefined();
    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(
      graph.edges.every((e) => ids.has(e.source) && ids.has(e.target)),
    ).toBe(true);
    expect(
      graph.nodes.every(
        (n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y),
      ),
    ).toBe(true);
  });
  it("keeps tree and topic identities distinct and shows inherited prerequisite links", () => {
    const data = fixture();
    data.trees[0].prerequisiteTreeIds = ["prerequisite"];
    data.nodes[0].id = "child";
    const graph = buildSkillGraph(data, data.trees[0], "child", false, false);
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(graph.nodes.length);
    expect(graph.nodes.some((n) => n.id === "topic:child")).toBe(true);
    expect(graph.nodes.some((n) => n.id === "tree:child")).toBe(true);
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        source: "tree:prerequisite",
        target: "topic:child",
      }),
    );
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        source: "tree:prerequisite",
        target: "tree:child",
      }),
    );
  });
});
