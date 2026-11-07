import {
  dayKey,
  daysAgo,
  dueTopics,
  weeklyActivity,
  type Data,
} from "./domain";
import { skillState } from "./progression";

export function learningOverview(data: Data, now = new Date()) {
  const todayKey = dayKey(now);
  const sessions = data.sessions.filter((s) => dayKey(s.at) === todayKey);
  const reviews = data.reviews.filter((r) => dayKey(r.at) === todayKey);
  const learned = data.nodes.filter(
    (node) => node.learnedAt && dayKey(node.learnedAt) === todayKey,
  );
  const studiedIds = new Set([
    ...sessions.map((s) => s.nodeId),
    ...reviews.map((r) => r.nodeId),
    ...learned.map((node) => node.id),
  ]);
  const completed = data.nodes
    .filter((node) => studiedIds.has(node.id))
    .map((node) => ({
      node,
      minutes: sessions
        .filter((s) => s.nodeId === node.id)
        .reduce((sum, s) => sum + s.minutes, 0),
      label: sessions.some((s) => s.nodeId === node.id)
        ? "已学习"
        : reviews.some((r) => r.nodeId === node.id)
          ? "已复习"
          : "已标记已学",
    }));
  const states = new Map(
    data.nodes.map((node) => [node.id, skillState(data, node)]),
  );
  const previouslyStudied = new Set(data.sessions.map((s) => s.nodeId));
  const reviewTasks = dueTopics(data, now)
    .filter(
      (node) =>
        !studiedIds.has(node.id) &&
        states.get(node.id) !== "locked" &&
        (node.card.reps > 0 ||
          node.learnedAt ||
          previouslyStudied.has(node.id)),
    )
    .map((node) => ({ node, kind: "review" as const }));
  const reviewIds = new Set(reviewTasks.map(({ node }) => node.id));
  const learningTasks = data.nodes
    .filter(
      (node) =>
        !studiedIds.has(node.id) &&
        !reviewIds.has(node.id) &&
        ["available", "learning"].includes(states.get(node.id)!),
    )
    .sort(
      (a, b) =>
        Number(states.get(b.id) === "learning") -
        Number(states.get(a.id) === "learning"),
    )
    .map((node) => ({ node, kind: "learn" as const }));
  const pending = [...reviewTasks, ...learningTasks].slice(0, 5);
  const minutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
  const progress = Math.min(
    minutes >= data.settings.dailyMinutes ? 100 : 99,
    Math.round((minutes / data.settings.dailyMinutes) * 100),
  );
  const week = weeklyActivity(data, now).map((day) => ({
    ...day,
    active:
      day.minutes > 0 ||
      day.reviews > 0 ||
      data.nodes.some(
        (node) => node.learnedAt && dayKey(node.learnedAt) === dayKey(day.date),
      ),
  }));
  const start = dayKey(daysAgo(6, now));
  const hasHistory = data.sessions.some(
    (s) => dayKey(s.at) >= start && dayKey(s.at) < todayKey,
  );
  const average = hasHistory
    ? Math.round(
        week
          .slice(0, 6)
          .reduce(
            (sum, day) =>
              sum +
              Math.min(100, (day.minutes / data.settings.dailyMinutes) * 100),
            0,
          ) / 6,
      )
    : null;
  let streak = 0;
  for (
    let index = week[6].active ? 6 : 5;
    index >= 0 && week[index].active;
    index--
  )
    streak++;
  return {
    completed,
    pending,
    minutes,
    progress,
    average,
    difference: average === null ? null : progress - average,
    remaining: Math.max(0, data.settings.dailyMinutes - minutes),
    sessions: sessions.length,
    reviews: reviews.length,
    week,
    streak,
  };
}
