import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  Clock3,
  FileUp,
  Flame,
  Leaf,
  Network,
  Plus,
  RotateCcw,
  Sprout,
  Target,
  Trash2,
} from "lucide-react";
import {
  dueTopics,
  feedback,
  hydrateCard,
  nodeScore,
  scheduler,
  topicStatus,
  weeklyActivity,
  type Data,
  type Topic,
  type Tree,
  type Session,
} from "./domain";
import { dateText, dueText, Empty, Status, TreeGraph } from "./components";
import { type Grade } from "ts-fsrs";

export type Page =
  "home" | "trees" | "reviews" | "feedback" | "journal" | "settings" | "learn";
export interface Actions {
  navigate: (page: Page) => void;
  study: (id?: string) => void;
  learn: (id: string) => void;
  saveNote: (id: string, note: string) => Promise<boolean>;
  recordQuiz: (session: Session) => Promise<boolean>;
  tree: (tree?: Tree, parentTreeId?: string) => void;
  topic: (treeId: string, topic?: Topic, parentId?: string) => void;
  select: (id: string) => void;
  markLearned: (id: string, note?: string) => Promise<boolean>;
  deleteTree: (id: string) => void;
  review: (id: string, rating: Grade, response: string) => Promise<boolean>;
  deleteSession: (id: string) => void;
  export: () => Promise<void>;
  import: (file: File) => void;
  importCourse: (file: File) => Promise<void>;
  courseTemplate: () => Promise<void>;
  migrateLegacy: () => void;
  reset: () => void;
  demo: () => Promise<void>;
  settings: (settings: Data["settings"]) => Promise<boolean>;
}
type Props = { data: Data; actions: Actions };
export function Home({
  data,
  actions,
  treeId,
  setTreeId,
}: Props & { treeId: string; setTreeId: (id: string) => void }) {
  const week = weeklyActivity(data),
    today = week[6],
    due = dueTopics(data),
    signals = feedback(data);
  const tree = data.trees.find((t) => t.id === treeId) ?? data.trees[0];
  const strong = data.nodes.filter(
    (n) => topicStatus(data, n.id) === "strong",
  ).length;
  const totalMinutes = week.reduce((sum, day) => sum + day.minutes, 0);
  const studiedDays = week.filter((d) => d.minutes > 0 || d.reviews > 0).length;
  const recent = [...data.sessions]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3);
  return (
    <div className="home-page">
      <section className="welcome">
        <div>
          <div className="eyebrow">
            <span />
            学习概览
          </div>
          <h1>今天的学习进度</h1>
          <p>查看当前进度、待复习节点和最近学习记录。</p>
          <button className="button primary" onClick={() => actions.study()}>
            <Plus size={17} />
            记录一次学习
          </button>
        </div>
      </section>
      <section className="stats-grid" aria-label="学习概览">
        <div className="stat">
          <span className="stat-icon green">
            <Sprout size={21} />
          </span>
          <div>
            <span>学习树</span>
            <strong>
              {data.trees.length}
              <small>棵</small>
            </strong>
          </div>
          <span className="stat-foot">
            {data.nodes.length} 个知识点
          </span>
        </div>
        <div className="stat">
          <span className="stat-icon blue">
            <Clock3 size={21} />
          </span>
          <div>
            <span>近 7 天学习</span>
            <strong>
              {totalMinutes}
              <small>分钟</small>
            </strong>
          </div>
          <span className="stat-foot">今天已学习 {today.minutes} 分钟</span>
        </div>
        <button
          className="stat stat-button"
          onClick={() => actions.navigate("reviews")}
        >
          <span className="stat-icon amber">
            <RotateCcw size={21} />
          </span>
          <div>
            <span>待复习</span>
            <strong>
              {due.length}
              <small>个</small>
            </strong>
          </div>
          <span className="stat-foot">
            进入复习 <ArrowUpRight size={14} />
          </span>
        </button>
        <div className="stat">
          <span className="stat-icon sage">
            <Target size={21} />
          </span>
          <div>
            <span>掌握知识点</span>
            <strong>
              {strong}
              <small>个知识点</small>
            </strong>
          </div>
          <span className="stat-foot">最近自测正确率 ≥ 80%</span>
        </div>
      </section>
      <div className="dashboard-grid">
        <section className="panel tree-panel">
          <div className="panel-heading">
            <div>
              <h2>
                <Network size={18} />
                学习树
              </h2>
              <p>
                {data.trees.length} 条路线 · {data.nodes.length} 个知识点
              </p>
            </div>
            <button
              className="text-button"
              onClick={() => actions.navigate("trees")}
            >
              管理学习树
              <ArrowUpRight size={15} />
            </button>
          </div>
          {tree ? (
            <>
              <div className="tree-selector">
                <select
                  aria-label="选择展示的学习树"
                  value={tree.id}
                  onChange={(e) => setTreeId(e.target.value)}
                >
                  {data.trees.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
                <span>
                  {data.nodes.filter((n) => n.treeId === tree.id).length}{" "}
                  个知识点
                </span>
              </div>
              <TreeGraph
                data={data}
                tree={tree}
                onSelect={actions.select}
                onOpenTree={(id) => {
                  setTreeId(id);
                  actions.navigate("trees");
                }}
                compact
              />
              <div className="tree-bottom">
                <span>
                  <Leaf size={15} />
                  点击知识点查看详情
                </span>
                <button
                  className="text-button"
                  onClick={() => actions.navigate("trees")}
                >
                  展开完整学习树
                  <ArrowRight size={15} />
                </button>
              </div>
            </>
          ) : (
            <Empty
              title="暂无学习树"
              action="创建学习树"
              onAction={() => actions.tree()}
            >
              创建第一棵学习树。
            </Empty>
          )}
        </section>
        <aside className="dashboard-aside">
          <div className="week-card">
            <span className="mini-label">
              <Flame size={15} />
              近 7 天记录
            </span>
            <div className="week-days">
              {week.map((day) => (
                <div key={day.date.toISOString()}>
                  <span>
                    {
                      ["日", "一", "二", "三", "四", "五", "六"][
                        day.date.getDay()
                      ]
                    }
                  </span>
                  <i className={day.minutes || day.reviews ? "done" : ""}>
                    {day.minutes || day.reviews ? <Check size={15} /> : <span />}
                  </i>
                </div>
              ))}
            </div>
            <p>
              最近 7 天，有 <strong>{studiedDays} 天</strong> 有学习记录
            </p>
          </div>
          <section className="next-step">
            <div className="mini-label">
              <Leaf size={17} />
              下一步
            </div>
            <h2>{signals[0].title}</h2>
            <p>{signals[0].detail}</p>
            <button onClick={() => actSignal(signals[0], actions)}>
              {signals[0].action}
              <ArrowUpRight size={18} />
            </button>
            <div className="leaf-art" aria-hidden="true">
              <svg viewBox="0 0 120 90">
                <path d="M51 90Q52 40 91 10M56 66C20 77 14 48 20 32C47 32 61 43 56 66M66 43C61 15 81 5 107 8C111 28 94 46 66 43" />
              </svg>
            </div>
          </section>
          <section className="panel daily-goal">
            <div className="row-between">
              <h3>今日目标</h3>
              <span>
                {Math.min(
                  100,
                  Math.round(
                    (today.minutes / data.settings.dailyMinutes) * 100,
                  ),
                )}
                %
              </span>
            </div>
            <p>
              <strong>{today.minutes}</strong> / {data.settings.dailyMinutes}{" "}
              分钟
            </p>
            <div className="progress-track">
              <i
                style={{
                  width: `${Math.min(100, (today.minutes / data.settings.dailyMinutes) * 100)}%`,
                }}
              />
            </div>
            <span>
              {today.minutes >= data.settings.dailyMinutes
                ? "今日目标已完成"
                : `还差 ${data.settings.dailyMinutes - today.minutes} 分钟`}
            </span>
          </section>
        </aside>
      </div>
      <section className="panel recent-panel">
        <div className="panel-heading">
          <div>
            <h2>
              <BookOpen size={18} />
              最近记录
            </h2>
          </div>
          <button
            className="text-button"
            onClick={() => actions.navigate("journal")}
          >
            全部记录
            <ArrowUpRight size={15} />
          </button>
        </div>
        {recent.length ? (
          recent.map((s) => (
            <button
              className="recent-row"
              key={s.id}
              onClick={() => actions.select(s.nodeId)}
            >
              <span className="recent-leaf">
                <Leaf size={17} />
              </span>
              <div>
                <strong>
                  {data.nodes.find((n) => n.id === s.nodeId)?.title}
                </strong>
                <p>{s.note || "无笔记"}</p>
              </div>
              <span className="recent-score">
                {s.total
                  ? `自测 ${Math.round(((s.correct ?? 0) / s.total) * 100)}%`
                  : "学习记录"}
              </span>
              <span className="muted">{s.minutes} 分钟</span>
              <time>{dateText(s.at)}</time>
              <ChevronRight size={16} />
            </button>
          ))
        ) : (
          <Empty title="暂无学习记录">
            完成一次学习后，记录会显示在这里。
          </Empty>
        )}
      </section>
    </div>
  );
}
function actSignal(
  signal: ReturnType<typeof feedback>[number],
  actions: Actions,
) {
  if (signal.kind === "review") actions.navigate("reviews");
  else if (signal.kind === "create") actions.tree();
  else actions.study(signal.nodeId);
}
export { Trees } from "./SkillWorkspace";
export function Reviews({ data, actions }: Props) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const due = dueTopics(data);
  const current = due.find((n) => n.id === chosen) ?? due[0];
  const future = data.nodes
    .filter((n) => n.question && n.answer && new Date(n.card.due) > new Date())
    .sort((a, b) => a.card.due.localeCompare(b.card.due));
  return (
    <>
      <PageHeading
        eyebrow="复习"
        title="复习挑战"
        description="按到期时间复习；先回忆，再自评。"
      >
        <span className="pill">
          <RotateCcw size={15} />
          {due.length} 个待复习 · 本轮已完成 {done} 个
        </span>
      </PageHeading>
      <div className="review-layout">
        <section className="panel review-queue">
          <h2>待复习</h2>
          {due.map((n) => (
            <button
              className={current?.id === n.id ? "active" : ""}
              key={n.id}
              onClick={() => setChosen(n.id)}
            >
              <span className="queue-dot" />
              <span>
                <strong>{n.title}</strong>
                <small>
                  {data.trees.find((t) => t.id === n.treeId)?.title} ·{" "}
                  {n.card.reps ? "到期复习" : "初次回忆"}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          {!due.length && <p className="muted">当前没有到期的回忆题。</p>}
          {future.length > 0 && (
            <>
              <h3 className="upcoming-title">接下来</h3>
              {future.slice(0, 5).map((n) => (
                <div className="upcoming" key={n.id}>
                  <span>{n.title}</span>
                  <small>{dueText(n.card.due)}</small>
                </div>
              ))}
            </>
          )}
        </section>
        {current ? (
          <ReviewCard
            key={current.id}
            node={current}
            onRate={async (rating, response) => {
              if (await actions.review(current.id, rating, response)) {
                setDone((n) => n + 1);
                setChosen(null);
              }
            }}
          />
        ) : (
          <section className="panel">
            <Empty
              title={done ? "本轮复习完成" : "暂无到期复习"}
              action={data.nodes.length ? "查看学习树" : "创建学习树"}
              onAction={() =>
                data.nodes.length ? actions.navigate("trees") : actions.tree()
              }
            >
              {done
                ? `已复习 ${done} 个知识点，新的复习时间已安排。`
                : "为知识点填写回忆题和答案后，到期时会出现在这里。"}
            </Empty>
          </section>
        )}
      </div>
      <p className="page-foot">
        复习时间由 FSRS 依据历史自评安排，目标记忆保持率为
        90%。自评不计入自测正确率。
      </p>
    </>
  );
}
function ReviewCard({
  node,
  onRate,
}: {
  node: Topic;
  onRate: (rating: Grade, response: string) => Promise<void>;
}) {
  const [revealed, setRevealed] = useState(false),
    [response, setResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const preview = scheduler.repeat(hydrateCard(node.card), new Date());
  return (
    <section className="panel review-card">
      <span className="eyebrow">
        <span />
        主动回忆
      </span>
      <h2>{node.title}</h2>
      <div className="recall-question">{node.question}</div>
      <label>
        先写下你的回答 <small>也可以在心里回答</small>
        <textarea
          rows={4}
          maxLength={4000}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="先不翻笔记，试着用自己的话说清楚…"
          disabled={revealed}
        />
      </label>
      {!revealed ? (
        <button
          className="button primary reveal-button"
          onClick={() => setRevealed(true)}
        >
          我想好了，查看参考答案
          <ArrowRight size={16} />
        </button>
      ) : (
        <>
          <div className="answer">
            <span className="mini-label">参考答案</span>
            <p className="preserve">{node.answer}</p>
          </div>
          <h3>自评</h3>
          <p className="muted">按实际表现选择，下次复习时间会随之调整。</p>
          <div className="ratings">
            {([1, 2, 3, 4] as Grade[]).map((rating, i) => (
              <button
                key={rating}
                className={`rating rating-${rating}`}
                disabled={saving}
                onClick={async () => {
                  if (saving) return;
                  setSaving(true);
                  try {
                    await onRate(rating, response);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <strong>
                  {["没想起来", "有些吃力", "基本记得", "轻松记得"][i]}
                </strong>
                <span>{dueText(preview[rating].card.due)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
export function Feedback({ data, actions }: Props) {
  const week = weeklyActivity(data),
    max = Math.max(data.settings.dailyMinutes, ...week.map((x) => x.minutes));
  const signals = feedback(data);
  const scored = [...data.sessions]
    .filter((s) => s.total !== null)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-12);
  const studied = data.nodes.filter((n) =>
    data.sessions.some((s) => s.nodeId === n.id),
  );
  return (
    <>
      <PageHeading
        eyebrow="学习反馈"
        title="学习反馈"
        description="基于最近最多 5 次自测与学习记录。"
      />
      <div className="feedback-signals">
        {signals.map((s) => (
          <section className="panel signal" key={s.title}>
            <span className="signal-icon">
              <Leaf size={20} />
            </span>
            <h3>{s.title}</h3>
            <p>{s.detail}</p>
            <button
              className="text-button"
              onClick={() => actSignal(s, actions)}
            >
              {s.action}
              <ArrowUpRight size={16} />
            </button>
          </section>
        ))}
      </div>
      <div className="charts-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>自测趋势</h2>
              <p>最近 {scored.length} 次自测的正确率</p>
            </div>
            <ChartNoAxesCombined size={18} />
          </div>
          {scored.length ? (
            <>
              <svg
                viewBox="0 0 540 215"
                className="score-chart"
                role="img"
                aria-label={`自测正确率趋势：${scored.map((s) => `${dateText(s.at)} ${Math.round(((s.correct ?? 0) / s.total!) * 100)}%`).join("，")}`}
              >
                <defs>
                  <linearGradient
                    id="chart-gradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--primary)"
                      stopOpacity=".12"
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--primary)"
                      stopOpacity="0"
                    />
                  </linearGradient>
                </defs>
                {[0, 50, 100].map((v) => (
                  <g key={v}>
                    <line
                      x1="40"
                      y1={175 - v * 1.4}
                      x2="515"
                      y2={175 - v * 1.4}
                      stroke="var(--border)"
                      strokeDasharray="4 5"
                    />
                    <text x="5" y={180 - v * 1.4}>
                      {v}%
                    </text>
                  </g>
                ))}
                {scored.length > 1 && (
                  <>
                    <path
                      d={`M40 175 ${scored.map((s, i) => `L${40 + (i * 475) / (scored.length - 1)} ${175 - ((s.correct ?? 0) / s.total!) * 140}`).join(" ")} L515 175 Z`}
                      fill="url(#chart-gradient)"
                    />
                    <polyline
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth="2.5"
                      points={scored
                        .map(
                          (s, i) =>
                            `${40 + (i * 475) / (scored.length - 1)},${175 - ((s.correct ?? 0) / s.total!) * 140}`,
                        )
                        .join(" ")}
                    />
                  </>
                )}
                {scored.map((s, i) => (
                  <circle
                    key={s.id}
                    cx={
                      scored.length === 1
                        ? 275
                        : 40 + (i * 475) / (scored.length - 1)
                    }
                    cy={175 - ((s.correct ?? 0) / s.total!) * 140}
                    r="4.5"
                    fill="var(--primary)"
                    stroke="var(--card)"
                    strokeWidth="2"
                  >
                    <title>
                      {data.nodes.find((n) => n.id === s.nodeId)?.title} ·{" "}
                      {dateText(s.at)} ·{" "}
                      {Math.round(((s.correct ?? 0) / s.total!) * 100)}%
                    </title>
                  </circle>
                ))}
                <text x="40" y="205">
                  {dateText(scored[0].at)}
                </text>
                <text x="515" y="205" textAnchor="end">
                  {dateText(scored[scored.length - 1].at)}
                </text>
              </svg>
              <p className="chart-note">
                各次自测的题目和难度可能不同，趋势仅供反思。
              </p>
            </>
          ) : (
            <Empty title="还没有自测数据">
              记录学习时勾选自测结果，看看理解如何变化。
            </Empty>
          )}
        </section>
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>近 7 天学习时长</h2>
              <p>单位：分钟</p>
            </div>
            <Clock3 size={18} />
          </div>
          <div className="bar-chart">
            {week.map((d) => (
              <div className="bar-column" key={d.date.toISOString()}>
                <strong>{d.minutes}</strong>
                <div>
                  <i
                    style={{
                      height: `${Math.max(2, (d.minutes / max) * 100)}%`,
                    }}
                    className={
                      d.minutes >= data.settings.dailyMinutes ? "met" : ""
                    }
                  />
                </div>
                <span>
                  {d.date.getMonth() + 1}/{d.date.getDate()}
                </span>
              </div>
            ))}
          </div>
          <p className="chart-note">
            绿色表示达到每日 {data.settings.dailyMinutes} 分钟目标。
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>知识点反馈</h2>
            <p>
              各知识点最近最多 5 次自测，按题数加权；无自测时不推断掌握程度。
            </p>
          </div>
        </div>
        {studied.length ? (
          <div className="feedback-table">
            <div className="table-head">
              <span>知识点</span>
              <span>近期自测</span>
              <span>学习次数</span>
              <span>状态</span>
            </div>
            {studied
              .sort(
                (a, b) =>
                  (nodeScore(data, a.id) ?? 101) -
                  (nodeScore(data, b.id) ?? 101),
              )
              .map((n) => (
                <button key={n.id} onClick={() => actions.select(n.id)}>
                  <strong>{n.title}</strong>
                  <span>
                    {nodeScore(data, n.id) === null
                      ? "数据不足"
                      : `${nodeScore(data, n.id)}%`}
                  </span>
                  <span>
                    {data.sessions.filter((s) => s.nodeId === n.id).length} 次
                  </span>
                  <Status data={data} node={n} />
                </button>
              ))}
          </div>
        ) : (
          <Empty
            title="暂无学习记录"
            action="记录学习"
            onAction={() => actions.study()}
          >
            完成一次学习或测验后，记录会显示在这里。
          </Empty>
        )}
      </section>
    </>
  );
}
export function Journal({ data, actions }: Props) {
  const [filter, setFilter] = useState("all");
  const sessions = data.sessions.map((s) => ({ ...s, kind: "study" as const }));
  const reviews = data.reviews.map((r) => ({ ...r, kind: "review" as const }));
  const records = [...sessions, ...reviews]
    .filter((r) => filter === "all" || r.kind === filter)
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <>
      <PageHeading
        eyebrow="学习记录"
        title="学习日志"
        description="按时间查看学习与复习记录。"
      >
        <button className="button primary" onClick={() => actions.study()}>
          <Plus size={17} />
          记录学习
        </button>
      </PageHeading>
      <div className="journal-toolbar">
        <div className="segmented">
          {[
            ["all", "全部"],
            ["study", "学习记录"],
            ["review", "回忆记录"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="muted">共 {records.length} 条记录</span>
      </div>
      <section className="panel journal-list">
        {records.length ? (
          records.map((r) => (
            <article className="journal-entry" key={r.id}>
              <div className={`journal-symbol ${r.kind}`}>
                {r.kind === "study" ? (
                  <BookOpen size={20} />
                ) : (
                  <RotateCcw size={20} />
                )}
              </div>
              <div className="journal-content">
                <div className="row-between">
                  <button
                    className="text-button journal-title"
                    onClick={() => actions.select(r.nodeId)}
                  >
                    {data.nodes.find((n) => n.id === r.nodeId)?.title}
                  </button>
                  <time>{dateText(r.at, true)}</time>
                </div>
                <div className="journal-tags">
                  {r.kind === "study" ? (
                    <>
                      <span>{r.minutes} 分钟</span>
                      <span>主观信心 {r.confidence}/5</span>
                      <span>
                        {r.total
                          ? `自测 ${r.correct}/${r.total}`
                          : r.quizAnswers?.some(
                                (answer) => answer.grading === "self",
                              )
                            ? "标准自评"
                            : "未记录自测"}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>主动回忆</span>
                      <span>
                        {
                          ["", "没想起来", "有些吃力", "基本记得", "轻松记得"][
                            r.rating
                          ]
                        }
                      </span>
                      <span>下次：{dateText(r.due, true)}</span>
                    </>
                  )}
                </div>
                <p className="preserve">
                  {r.kind === "study"
                    ? r.note || "这次没有留下文字记录。"
                    : r.response || "这次进行了口头或心中回忆。"}
                </p>
              </div>
              {r.kind === "study" && (
                <button
                  className="icon-button"
                  aria-label="删除学习记录"
                  onClick={() => actions.deleteSession(r.id)}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </article>
          ))
        ) : (
          <Empty
            title="暂无学习记录"
            action="记录第一次学习"
            onAction={() => actions.study()}
          >
            学习记录会按时间显示在这里。
          </Empty>
        )}
      </section>
    </>
  );
}
export function Settings({ data, actions }: Props) {
  const [name, setName] = useState(data.settings.name),
    [minutes, setMinutes] = useState(String(data.settings.dailyMinutes));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="设置"
        title="偏好与数据"
        description="学习记录保存在本机 PostgreSQL；课程包管理内容，完整备份包含全部进度。"
      />
      <div className="settings-layout">
        <section className="panel settings-panel">
          <h2>学习偏好</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (saving) return;
              setSaving(true);
              try {
                setSaved(
                  await actions.settings({
                    name: name.trim(),
                    dailyMinutes: Number(minutes),
                  }),
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <fieldset disabled={saving}>
              <label>
                怎么称呼你
                <input
                  required
                  maxLength={30}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <label>
                每日目标（分钟）
                <input
                  type="number"
                  required
                  min={5}
                  max={480}
                  value={minutes}
                  onChange={(e) => {
                    setMinutes(e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <p className="muted">范围 5–480 分钟。</p>
              <button className="button primary" disabled={!name.trim()}>
                {saved ? (
                  <>
                    <Check size={16} />
                    已保存
                  </>
                ) : (
                  "保存偏好"
                )}
              </button>
            </fieldset>
          </form>
        </section>
        <section className="panel settings-panel">
          <h2>数据管理</h2>
          <p>
            包含 {data.trees.length} 棵学习树、{data.nodes.length} 个知识点、
            {data.sessions.length} 条学习记录和 {data.reviews.length}{" "}
            条复习记录。
          </p>
          <button className="button full-width" onClick={actions.export}>
            <ArrowDownToLine size={17} />
            导出完整备份
          </button>
          <label className="button full-width import-button">
            <FileUp size={17} />
            从备份恢复
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) actions.import(file);
                e.target.value = "";
              }}
            />
          </label>
          <p className="caption">
            支持本应用导出的完整 JSON 备份，最大 32
            MB。恢复会替换数据库中的整个学习空间。
          </p>
          <button
            className="text-button demo-link"
            onClick={actions.migrateLegacy}
          >
            迁移此浏览器的旧版数据
            <ArrowUpRight size={14} />
          </button>
          <div className="settings-divider" />
          <h3>{data.demo ? "清空示例空间" : "清空学习数据"}</h3>
          <p>
            {data.demo
              ? "当前是示例空间。清空示例后，就能建立属于你的学习树。"
              : "清空数据库中的学习内容与进度。建议先导出完整备份。"}
          </p>
          <button className="button danger" onClick={actions.reset}>
            {data.demo ? "清空示例空间" : "清空全部学习数据"}
          </button>
          {!data.trees.length && (
            <button className="text-button demo-link" onClick={actions.demo}>
              载入内置前端课程
              <ArrowUpRight size={14} />
            </button>
          )}
        </section>
      </div>
      <section className="panel settings-panel course-settings">
        <h2>导入学习内容</h2>
        <p>
          课程包包含学习树、讲义、回忆题和测验题。按相同 ID
          更新内容时保留笔记、答题历史和学习进度；未包含的节点不会被删除。
        </p>
        <div className="course-import-actions">
          <label className="button import-button">
            <FileUp size={16} />
            导入课程包
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void actions.importCourse(file);
                e.target.value = "";
              }}
            />
          </label>
          <button className="button" onClick={actions.courseTemplate}>
            <ArrowDownToLine size={16} />
            下载内置课程包
          </button>
          <button className="button" onClick={actions.demo}>
            <BookOpen size={16} />
            重新导入内置课程
          </button>
        </div>
        <p className="caption">
          课程包格式为 learning-tree-course，单文件最大 32
          MB，不包含个人笔记或测验成绩。
        </p>
      </section>
      <section className="panel method-note">
        <Leaf size={22} />
        <div>
          <h3>数据说明</h3>
          <p>
            反馈由实际学习记录和明确规则生成；自测正确率、主观信心和复习自评分开记录。复习采用
            FSRS 算法安排时间。课程和学习数据通过本机 FastAPI 写入
            PostgreSQL，账号与数据按登录用户隔离，不调用 AI。请定期导出完整备份。
          </p>
        </div>
      </section>
    </>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="page-heading">
      <div>
        <div className="eyebrow">
          <span />
          {eyebrow}
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}
