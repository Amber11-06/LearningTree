import { describe, expect, it } from "vitest";
import { blankData, daysAgo, emptyCard, type Data } from "./domain";
import { learningOverview } from "./overview-data";

const now = new Date(2026, 10, 7, 14);
function fixture() {
  const data = blankData();
  data.settings.dailyMinutes = 60;
  data.trees = [
    {
      id: "tree",
      title: "前端",
      description: "",
      color: "blue",
      createdAt: now.toISOString(),
      parentTreeId: null,
      prerequisiteTreeIds: [],
    },
  ];
  data.nodes = ["a", "b", "c"].map((id) => ({
    id,
    treeId: "tree",
    parentId: id === "c" ? "b" : null,
    title: id,
    note: "",
    content: "",
    quiz: [],
    question: "问题",
    answer: "答案",
    resource: "",
    card: emptyCard(now),
    createdAt: now.toISOString(),
  }));
  return data;
}
function session(
  nodeId: string,
  minutes: number,
  at = now,
): Data["sessions"][number] {
  return {
    id: `${nodeId}-${minutes}-${at.toISOString()}`,
    nodeId,
    minutes,
    at: at.toISOString(),
    confidence: 3,
    correct: null,
    total: null,
    note: "",
  };
}

describe("learning overview", () => {
  it("shows honest empty states and only recommends unlocked topics", () => {
    const empty = learningOverview(blankData(), now);
    expect(empty.progress).toBe(0);
    expect(empty.average).toBeNull();
    expect(empty.difference).toBeNull();
    expect(empty.pending).toEqual([]);
    const overview = learningOverview(fixture(), now);
    expect(overview.pending.map((task) => [task.node.id, task.kind])).toEqual([
      ["a", "learn"],
      ["b", "learn"],
    ]);
  });
  it("deduplicates today's topics across study, reviews and marks without inventing time", () => {
    const data = fixture();
    data.sessions = [
      session("a", 20),
      session("a", 25),
      session("b", 90, daysAgo(1, now)),
    ];
    data.reviews = [
      {
        id: "review",
        nodeId: "a",
        at: now.toISOString(),
        due: now.toISOString(),
        rating: 3,
        response: "",
      },
    ];
    data.nodes[1].learnedAt = now.toISOString();
    const overview = learningOverview(data, now);
    expect(
      overview.completed.map((item) => [item.node.id, item.minutes]),
    ).toEqual([
      ["a", 45],
      ["b", 0],
    ]);
    expect(overview.minutes).toBe(45);
    expect(overview.progress).toBe(75);
    expect(overview.remaining).toBe(15);
    expect(overview.pending.map((task) => task.node.id)).toEqual(["c"]);
    expect(overview.reviews).toBe(1);
  });
  it("caps progress at completion and does not round an unfinished goal to 100%", () => {
    const data = fixture();
    data.settings.dailyMinutes = 480;
    data.sessions = [session("a", 479)];
    expect(learningOverview(data, now).progress).toBe(99);
    data.sessions = [session("a", 600)];
    const overview = learningOverview(data, now);
    expect(overview.progress).toBe(100);
    expect(overview.minutes).toBe(600);
    expect(overview.remaining).toBe(0);
  });
  it("compares the preceding six days and counts review-only days in continuity", () => {
    const data = fixture();
    data.sessions = [
      session("a", 30),
      session("a", 60, daysAgo(2, now)),
      session("a", 60, daysAgo(7, now)),
    ];
    data.reviews = [
      {
        id: "review",
        nodeId: "b",
        at: daysAgo(1, now).toISOString(),
        due: now.toISOString(),
        rating: 3,
        response: "",
      },
    ];
    const overview = learningOverview(data, now);
    expect(overview.average).toBe(17);
    expect(overview.difference).toBe(33);
    expect(overview.streak).toBe(3);
    expect(overview.week[5].active).toBe(true);
  });
  it("prioritizes due reviews and never duplicates a recommendation", () => {
    const data = fixture();
    data.sessions = [session("b", 10, daysAgo(1, now))];
    const overview = learningOverview(data, now);
    expect(overview.pending.map((task) => [task.node.id, task.kind])).toEqual([
      ["b", "review"],
      ["a", "learn"],
    ]);
  });
});
