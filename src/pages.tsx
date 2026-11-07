import { useEffect, useState } from "react";
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
  Leaf,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  dueTopics,
  hydrateCard,
  nodeScore,
  scheduler,
  weeklyActivity,
  type Data,
  type Topic,
  type Tree,
  type Session,
} from "./domain";
import { dateText, dueText, Empty, Status } from "./components";
import { type Grade } from "ts-fsrs";

export type Page =
  "home" | "trees" | "reviews" | "feedback" | "journal" | "settings" | "learn";
export interface Actions {
  navigate: (page: Page) => void;
  study: (id?: string) => void;
  learn: (id: string) => void;
  startReview: (id: string) => void;
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
export { Home } from "./LearningOverview";
export { Trees } from "./SkillWorkspace";
export function Reviews({
  data,
  actions,
  initialNodeId,
}: Props & { initialNodeId?: string | null }) {
  const [chosen, setChosen] = useState<string | null>(initialNodeId ?? null);
  const [done, setDone] = useState(0);
  const [revealSignal, setRevealSignal] = useState(0);
  const due = dueTopics(data);
  const current = due.find((n) => n.id === chosen) ?? due[0];
  const currentIndex = current ? due.findIndex((n) => n.id === current.id) : -1;
  const currentTree = current
    ? data.trees.find((tree) => tree.id === current.treeId)
    : undefined;
  useEffect(() => {
    setRevealSignal(0);
  }, [current?.id]);
  const future = data.nodes
    .filter((n) => n.question && n.answer && new Date(n.card.due) > new Date())
    .sort((a, b) => a.card.due.localeCompare(b.card.due));
  return (
    <>
      <PageHeading title="复习挑战" />
      <div className="review-layout">
        <section className="panel review-queue">
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
            revealSignal={revealSignal}
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
            />
          </section>
        )}
        {current && (
          <aside className="panel review-context">
            <span className="context-label">QUESTION CONTEXT</span>
            <h3>{current.title}</h3>
            <div className="context-orbit">
              <span className="context-core">
                <RotateCcw size={19} />
              </span>
            </div>
            <div className="context-meta">
              <div>
                <span>所属路线</span>
                <b>{currentTree?.title ?? "学习树"}</b>
              </div>
              <div>
                <span>队列位置</span>
                <b>
                  {currentIndex + 1} / {due.length}
                </b>
              </div>
            </div>
            <div className="context-actions">
              <button onClick={() => setRevealSignal((value) => value + 1)}>
                查看参考答案
              </button>
              <button
                className="ghost"
                onClick={() => {
                  const next = due[(currentIndex + 1) % due.length];
                  if (next) setChosen(next.id);
                }}
              >
                稍后再复习
              </button>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
function ReviewCard({
  node,
  revealSignal = 0,
  onRate,
}: {
  node: Topic;
  revealSignal?: number;
  onRate: (rating: Grade, response: string) => Promise<void>;
}) {
  const [revealed, setRevealed] = useState(false),
    [response, setResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const preview = scheduler.repeat(hydrateCard(node.card), new Date());
  useEffect(() => {
    if (revealSignal) setRevealed(true);
  }, [revealSignal]);
  return (
    <section className="panel review-card">
      <h2>{node.title}</h2>
      <div className="recall-question">{node.question}</div>
      <label>
        <textarea
          aria-label="复习回答"
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
  const scored = [...data.sessions]
    .filter((s) => s.total !== null)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-12);
  const studied = data.nodes.filter((n) =>
    data.sessions.some((s) => s.nodeId === n.id),
  );
  return (
    <>
      <PageHeading title="学习反馈" />
      <div className="charts-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <h2>自测趋势</h2>
            <div className="chart-head-actions">
              <ChartNoAxesCombined size={18} />
              <button className="chart-action" onClick={() => actions.study()}>
                记录自测
              </button>
            </div>
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
            </>
          ) : (
            <Empty title="还没有自测数据" />
          )}
        </section>
        <section className="panel chart-panel">
          <div className="panel-heading">
            <h2>近 7 天学习时长</h2>
            <div className="chart-head-actions">
              <Clock3 size={18} />
              <button className="chart-action" onClick={() => actions.study()}>
                记录学习
              </button>
            </div>
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
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>知识点反馈</h2>
          <button
            className="chart-action"
            onClick={() => actions.navigate("trees")}
          >
            查看全部
          </button>
        </div>
        {studied.length ? (
          <div className="kf-grid">
            {[...studied]
              .sort(
                (a, b) =>
                  (nodeScore(data, a.id) ?? 101) -
                  (nodeScore(data, b.id) ?? 101),
              )
              .map((n) => {
                const score = nodeScore(data, n.id);
                return (
                  <button
                    className="kf-card"
                    key={n.id}
                    onClick={() => actions.select(n.id)}
                  >
                    <i className="kf-dot" />
                    <div>
                      <strong>{n.title}</strong>
                      <small>
                        {score === null ? "数据不足" : `自测 ${score}%`} ·{" "}
                        {data.sessions.filter((s) => s.nodeId === n.id).length}{" "}
                        次学习
                      </small>
                    </div>
                    <Status data={data} node={n} />
                  </button>
                );
              })}
          </div>
        ) : (
          <Empty
            title="暂无学习记录"
            action="记录学习"
            onAction={() => actions.study()}
          />
        )}
      </section>
    </>
  );
}
export function Journal({ data, actions }: Props) {
  const [filter, setFilter] = useState("all");
  const week = weeklyActivity(data);
  const sessions = data.sessions.map((s) => ({ ...s, kind: "study" as const }));
  const reviews = data.reviews.map((r) => ({ ...r, kind: "review" as const }));
  const records = [...sessions, ...reviews]
    .filter((r) => filter === "all" || r.kind === filter)
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <>
      <PageHeading title="学习日志" />
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
          <>
            <div className="journal-empty">
            <div className="journal-orbit" aria-hidden="true">
              <div className="journal-orbit-core">
                <span>
                  <BookOpen size={30} />
                </span>
              </div>
              <span className="journal-orbit-tag one">今天学到的</span>
              <span className="journal-orbit-tag two">一次回忆</span>
              <span className="journal-orbit-tag three">一个小问题</span>
            </div>
            <div className="journal-copy">
              <h2>
                还没有<em>学习记录</em>
              </h2>
              <div className="journal-actions">
                <button onClick={() => actions.study()}>
                  记录第一次学习 →
                </button>
                <button
                  className="ghost"
                  onClick={() => actions.navigate("trees")}
                >
                  查看学习树
                </button>
              </div>
            </div>
          </div>
          <div className="journal-week">
            {week.map((day, index) => (
              <div
                className={index === week.length - 1 ? "today" : ""}
                key={day.date.toISOString()}
              >
                周{["一", "二", "三", "四", "五", "六", "日"][index]}
                <strong>{day.minutes ? `${day.minutes}m` : "—"}</strong>
              </div>
            ))}
          </div>
          </>
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
      <PageHeading title="偏好与数据" />
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
            PostgreSQL，账号与数据按登录用户隔离，不调用
            AI。请定期导出完整备份。
          </p>
        </div>
      </section>
    </>
  );
}
function PageHeading({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="page-heading">
      <div className="page-title-wrap">
        <span className="page-title-mark" aria-hidden="true" />
        <div className="page-title-float">
          <h1>{title}</h1>
        </div>
      </div>
      {children}
    </section>
  );
}
