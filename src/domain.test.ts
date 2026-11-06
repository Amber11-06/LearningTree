import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import {
  blankData,
  dayKey,
  descendantIds,
  dueTopics,
  emptyCard,
  feedback,
  nodeScore,
  parseData,
  removeTopics,
  reviewTopic,
  type Data,
} from "./domain";
import { demoData } from "./demo";

const now = new Date("2026-10-22T10:00:00.000Z");
function fixture(): Data {
  const data = blankData();
  data.trees.push({
    id: "tree",
    parentTreeId: null,
    prerequisiteTreeIds: [],
    title: "测试",
    description: "",
    color: "green",
    createdAt: now.toISOString(),
  });
  data.nodes.push({
    id: "a",
    treeId: "tree",
    parentId: null,
    title: "知识点",
    note: "",
    content: "",
    quiz: [],
    question: "为什么？",
    answer: "因为…",
    resource: "",
    card: emptyCard(now),
    createdAt: now.toISOString(),
  });
  return data;
}
describe("backup integrity", () => {
  it("roundtrips a full example without losing scheduling or evidence", () => {
    const data = demoData(now);
    expect(parseData(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
  it("rejects cycles, broken ownership and orphan evidence", () => {
    const cycle = fixture();
    cycle.nodes[0].parentId = "a";
    expect(() => parseData(cycle)).toThrow("循环");
    const orphan = fixture();
    orphan.nodes[0].treeId = "missing";
    expect(() => parseData(orphan)).toThrow("不存在");
    const cross = fixture();
    cross.trees.push({ ...cross.trees[0], id: "tree2" });
    cross.nodes.push({
      ...cross.nodes[0],
      id: "b",
      treeId: "tree2",
      parentId: "a",
    });
    expect(() => parseData(cross)).toThrow("另一棵树");
    const evidence = demoData(now);
    evidence.sessions[0].nodeId = "missing";
    expect(() => parseData(evidence)).toThrow("不存在");
  });
  it("rejects duplicate identities, impossible scores and executable resource URLs", () => {
    const duplicate = fixture();
    duplicate.nodes.push({ ...duplicate.nodes[0] });
    expect(() => parseData(duplicate)).toThrow("重复");
    const scores = demoData(now);
    scores.sessions[0].correct = 100;
    expect(() => parseData(scores)).toThrow("正确题数");
    const url = fixture();
    url.nodes[0].resource = "javascript:alert(1)";
    expect(() => parseData(url)).toThrow("https://");
  });
});
describe("learning feedback", () => {
  it("does not turn time spent or subjective confidence into a test score", () => {
    const data = fixture();
    data.sessions.push({
      id: "s",
      nodeId: "a",
      at: now.toISOString(),
      minutes: 180,
      confidence: 5,
      correct: null,
      total: null,
      note: "",
    });
    expect(nodeScore(data, "a")).toBeNull();
  });
  it("weights actual answers, and considers only the latest five tests", () => {
    const data = fixture();
    data.sessions = [0, 1, 2, 3, 4, 5].map((i) => ({
      id: `s${i}`,
      nodeId: "a",
      at: new Date(now.getTime() + i * 1000).toISOString(),
      minutes: 20,
      confidence: 4,
      correct: i === 0 ? 100 : i === 5 ? 0 : 1,
      total: i === 0 ? 100 : i === 5 ? 6 : 1,
      note: "",
    }));
    expect(nodeScore(data, "a")).toBe(40);
    expect(feedback(data, now).some((f) => f.title.includes("复习「知识点」"))).toBe(
      true,
    );
  });
  it("groups dates by local calendar rather than UTC", () => {
    const local = new Date(2026, 9, 22, 0, 1);
    expect(dayKey(local)).toBe("2026-10-22");
  });
  it("retires an old confidence mismatch after better evidence arrives", () => {
    const data = fixture();
    data.sessions = [
      {
        id: "before",
        nodeId: "a",
        at: new Date(now.getTime() - 60000).toISOString(),
        minutes: 20,
        confidence: 5,
        correct: 2,
        total: 10,
        note: "",
      },
      {
        id: "after",
        nodeId: "a",
        at: now.toISOString(),
        minutes: 20,
        confidence: 4,
        correct: 9,
        total: 10,
        note: "",
      },
    ];
    expect(feedback(data, now).some((f) => f.title.includes("觉得会了"))).toBe(
      false,
    );
  });
});
describe("review scheduling", () => {
  it("persists a real FSRS review and removes it from the due queue", () => {
    const data = fixture();
    expect(dueTopics(data, now)).toHaveLength(1);
    const next = reviewTopic(data, "a", Rating.Good, "我的回答", now);
    expect(next.reviews).toHaveLength(1);
    expect(next.reviews[0].response).toBe("我的回答");
    expect(next.nodes[0].card.reps).toBe(1);
    expect(new Date(next.nodes[0].card.due).getTime()).toBeGreaterThan(
      now.getTime(),
    );
    expect(
      dueTopics(parseData(JSON.parse(JSON.stringify(next))), now),
    ).toHaveLength(0);
    expect(() => reviewTopic(next, "a", Rating.Good, "", now)).toThrow(
      "尚未到",
    );
    expect(nodeScore(next, "a")).toBeNull();
  });
  it("only enables complete recall prompts", () => {
    const data = fixture();
    data.nodes[0].answer = " ";
    expect(dueTopics(data, now)).toHaveLength(0);
    expect(() => reviewTopic(data, "a", Rating.Good, "", now)).toThrow("填写");
  });
});
describe("cascade deletion", () => {
  it("removes descendants and evidence but preserves independent branches", () => {
    const data = fixture();
    data.nodes.push(
      { ...data.nodes[0], id: "b", parentId: "a" },
      { ...data.nodes[0], id: "c", parentId: "b" },
      { ...data.nodes[0], id: "d" },
    );
    const reviewed = reviewTopic(data, "b", Rating.Easy, "", now);
    const next = removeTopics(reviewed, descendantIds(reviewed, "a"));
    expect(next.nodes.map((n) => n.id)).toEqual(["d"]);
    expect(next.reviews).toHaveLength(0);
    expect(() => parseData(next)).not.toThrow();
  });
});
