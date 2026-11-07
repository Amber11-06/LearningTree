import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Minus,
  Plus,
  Quote,
  RotateCcw,
  Target,
  Trophy,
} from "lucide-react";
import { type Data } from "./domain";
import { type Actions } from "./pages";
import { learningOverview } from "./overview-data";

function BookIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 220 140"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="113" cy="124" rx="91" ry="9" fill="#abc1de" opacity=".18" />
      <path d="m19 102 82 20 99-21-80-19z" fill="#b6c9e3" />
      <path
        d="m23 96 78 18 94-20v9l-94 20-78-19z"
        fill="#ecf2fa"
        stroke="#b8cae1"
        strokeWidth="2"
      />
      <path
        d="m27 92 47-64c20-6 41-2 53 12 16-6 41-1 64 13l-26 62c-25-12-47-16-64-7-21-13-47-18-74-16Z"
        fill="#f9fbfe"
        stroke="#aec3de"
        strokeWidth="2.5"
      />
      <path
        d="m127 40-26 68M31 95l70 20 69 4 25-64"
        stroke="#b7cae3"
        strokeWidth="2"
      />
      <g stroke="#cedaeb" strokeWidth="2.5" strokeLinecap="round">
        <path d="M78 41c13-3 25 0 34 5M71 52c13-3 25 0 34 5M64 63c13-3 25 0 34 5M57 74c13-3 25 0 34 5M139 52c12 0 24 5 34 11M134 64c12 0 24 5 34 11M129 76c12 0 24 5 34 11M124 88c12 0 24 5 34 11" />
      </g>
      <path d="m132 84 44-66 8 5-44 66-12 9z" fill="#a8b8cb" />
      <path d="m176 18 4-6c2-3 10 2 8 5l-4 6M132 84l8 5-12 9z" fill="#d6dde7" />
      <path d="m179 24-37 55" stroke="#f1f5fb" strokeWidth="2" />
    </svg>
  );
}

function MountainIllustration() {
  return (
    <svg
      className="overview-mountains"
      viewBox="0 0 420 150"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <path
        d="M0 120 85 92 145 113 226 60 298 95 365 39 420 84V150H0Z"
        fill="#ebf0f8"
      />
      <path d="m62 150 131-68 72 36 91-102 64 95v39z" fill="#dae5f4" />
      <path
        d="m212 150 144-134-26 73 27-13-27 50 33-12 57 36z"
        fill="#c6d6eb"
      />
      <path d="m356 16 11 57-17-11-20 27z" fill="#f9fbfe" />
      <path
        d="m356 16 33 116-26-18-33 12 27-50-7-14z"
        fill="#b8cbe3"
        opacity=".55"
      />
      <path d="M356 17V1" stroke="#9eb1c9" strokeWidth="2" />
      <path d="m357 1 17 4-17 6z" fill="#d5b575" />
    </svg>
  );
}

export function Home({ data, actions }: { data: Data; actions: Actions }) {
  const now = new Date();
  const overview = learningOverview(data, now);
  const {
    completed,
    pending,
    minutes,
    progress,
    average,
    difference,
    remaining,
  } = overview;
  const next = pending[0];
  const momentum =
    progress >= 100 ? "今日目标达成" : minutes > 0 ? "稳中求进" : "从现在开始";
  const openTask = (task: (typeof pending)[number]) => {
    if (task.kind === "review") actions.startReview(task.node.id);
    else actions.learn(task.node.id);
  };
  const continueLearning = () => {
    if (next) openTask(next);
    else if (data.nodes.length) actions.navigate("trees");
    else actions.tree();
  };
  const treeBadge = (treeId: string) => {
    const tree = data.trees.find((item) => item.id === treeId);
    return (
      <span
        className={`overview-subject ${tree?.color ?? "blue"}`}
        title={tree?.title}
      >
        {tree?.title ?? "知识点"}
      </span>
    );
  };
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日（周${["日", "一", "二", "三", "四", "五", "六"][now.getDay()]}）`;
  const TrendIcon =
    difference === null || difference === 0
      ? Minus
      : difference > 0
        ? ArrowUpRight
        : ArrowDownRight;

  return (
    <div className="learning-overview">
      <div className="overview-main">
        <section className="overview-heading">
          <div className="overview-title">
            <h1>学习概览</h1>
          </div>
          <div className="overview-heading-books" aria-hidden="true">
            <i />
            <i />
            <i />
            <span />
          </div>
          <div className="overview-date">
            <CalendarDays size={21} />
            <time dateTime={now.toLocaleDateString("sv-SE")}>
              今天 · {dateLabel}
            </time>
            <span>今日学习总结</span>
            <button
              className="overview-record"
              onClick={() => actions.study()}
              aria-label="记录一次学习"
              title="记录一次学习"
            >
              <Plus size={15} />
              <span>记录学习</span>
            </button>
          </div>
        </section>

        <section className="overview-hero" aria-label="今日学习进度">
          <div className="overview-hero-number">
            <h2>
              今日学习进度{" "}
              <span
                title="按今日已记录的学习分钟数 / 每日学习目标计算，最高显示 100%。"
                tabIndex={0}
              >
                <CircleHelp size={18} />
                <span className="overview-help-text">
                  今日学习时长 ÷ 每日时长目标，最高显示 100%
                </span>
              </span>
            </h2>
            <strong>
              {progress}
              <small>%</small>
            </strong>
          </div>
          <div className="overview-hero-detail">
            <h3>
              <CheckCircle2 size={23} />
              已学习 {completed.length} 个知识点
            </h3>
            <p>
              {minutes} / {data.settings.dailyMinutes} 分钟
              <span>每日时长目标</span>
            </p>
            <span className="overview-hero-message">
              {progress >= 100
                ? "目标已达成，为今天的坚持点赞！"
                : minutes
                  ? "稳中求进，保持节奏！"
                  : "每一步积累，都在靠近目标"}
            </span>
          </div>
          <div
            className="overview-ring"
            role="img"
            aria-label={`每日时长目标完成 ${progress}%`}
          >
            <svg viewBox="0 0 160 160" aria-hidden="true">
              <circle className="overview-ring-track" cx="80" cy="80" r="65" />
              <circle
                className="overview-ring-value"
                cx="80"
                cy="80"
                r="65"
                pathLength="100"
                strokeDasharray={`${progress} 100`}
                transform="rotate(-90 80 80)"
              />
            </svg>
            <div>
              <strong>{progress}%</strong>
              <span>
                {minutes} / {data.settings.dailyMinutes} 分钟
              </span>
            </div>
          </div>
          <BookIllustration className="overview-hero-book" />
        </section>

        <section
          className="overview-card overview-breakdown"
          aria-label="今日学习进度拆解"
        >
          <div className="overview-card-heading">
            <h2>
              <ChartNoAxesColumnIncreasing size={20} />
              今日学习进度拆解
            </h2>
            <span>
              {remaining
                ? `距离今日目标还差 ${remaining} 分钟`
                : "今日时长目标已完成"}
            </span>
          </div>
          <div className="overview-segment-row">
            <div
              className="overview-segments"
              role="progressbar"
              aria-label="每日学习时长目标"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i}>
                  <i
                    style={{
                      width: `${Math.max(0, Math.min(100, progress * 10 - i * 100))}%`,
                    }}
                  />
                </span>
              ))}
            </div>
            <ArrowRight size={15} />
            <strong>{progress}%</strong>
          </div>
        </section>

        <div className="overview-task-columns">
          <section className="overview-card overview-tasks">
            <div className="overview-card-heading">
              <h2>
                <CheckCircle2 className="overview-success-icon" size={22} />
                今日已学 <small>（{completed.length} 项）</small>
              </h2>
              <span className="overview-pill success">
                已学习 {completed.length} 项
              </span>
            </div>
            {completed.length ? (
              <div className="overview-task-list">
                {completed.map(({ node, minutes: duration, label }) => (
                  <button
                    className="overview-task-row completed"
                    key={node.id}
                    onClick={() => actions.select(node.id)}
                    title={`查看 ${node.title}`}
                  >
                    <span className="overview-task-check">
                      <Check size={12} />
                    </span>
                    {treeBadge(node.treeId)}
                    <strong>{node.title}</strong>
                    <span className="overview-task-duration">
                      {duration ? `${duration} 分钟` : label}
                    </span>
                    <Check className="overview-row-done" size={17} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="overview-empty">
                <span className="overview-empty-icon">
                  <BookOpen size={28} />
                </span>
                <h3>今天的成长，从第一步开始</h3>
                <p>学习、复习或标记已学后，足迹会出现在这里。</p>
                <button
                  className="overview-inline-link"
                  onClick={() =>
                    data.nodes.length ? actions.study() : actions.tree()
                  }
                >
                  <Plus size={15} />
                  {data.nodes.length ? "记录一次学习" : "创建学习树"}
                </button>
              </div>
            )}
            {completed.length > 0 && (
              <button
                className="overview-list-footer"
                onClick={() => actions.navigate("journal")}
              >
                查看全部学习记录 <ArrowRight size={14} />
              </button>
            )}
          </section>
          <section className="overview-card overview-tasks overview-pending">
            <div className="overview-card-heading">
              <h2>
                <Clock3 size={22} />
                今日待学 / 待挑战
              </h2>
              <span className="overview-pill">推荐 {pending.length} 项</span>
            </div>
            {pending.length ? (
              <div className="overview-task-list">
                {pending.map((task) => (
                  <button
                    className="overview-task-row"
                    key={task.node.id}
                    onClick={() => openTask(task)}
                    title={`${task.kind === "review" ? "前往复习" : "开始学习"}：${task.node.title}`}
                  >
                    <span className="overview-task-open" />
                    {treeBadge(task.node.treeId)}
                    <strong>{task.node.title}</strong>
                    <span className="overview-task-duration">
                      {task.kind === "review" ? "待复习" : "待学习"}
                    </span>
                    <ArrowRight className="overview-row-arrow" size={15} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="overview-empty compact">
                <h3>
                  {data.nodes.length ? "当前推荐已学完" : "还没有学习路线"}
                </h3>
                <p>
                  {data.nodes.length
                    ? "可以回到技能树，继续探索新的知识点。"
                    : "创建学习树，开启你的第一段学习旅程。"}
                </p>
              </div>
            )}
            <div className="overview-pending-note">
              <p>
                {remaining ? (
                  <>
                    再学一点，
                    <br />
                    让今天的积累更进一步。
                  </>
                ) : (
                  <>
                    每一份坚持，
                    <br />
                    都会成为明天的底气。
                  </>
                )}
              </p>
              <BookIllustration />
            </div>
          </section>
        </div>

        <section className="overview-continue">
          <Target size={35} />
          <div className="overview-continue-label">
            <h2>继续学习 · 下一步挑战</h2>
          </div>
          {next && (
            <div className="overview-next-task">
              <span>下一项</span>
              {treeBadge(next.node.treeId)}
              <strong title={next.node.title}>{next.node.title}</strong>
              {next.kind === "review" ? (
                <RotateCcw size={16} />
              ) : (
                <BookOpen size={16} />
              )}
            </div>
          )}
          <button className="overview-primary" onClick={continueLearning}>
            {next
              ? next.kind === "review"
                ? "开始复习"
                : "继续学习"
              : data.nodes.length
                ? "查看技能树"
                : "创建学习树"}
            <ArrowRight size={17} />
          </button>
        </section>
      </div>

      <aside className="overview-aside" aria-label="今日学习数据">
        <section className="overview-card overview-comparison">
          <div className="overview-card-heading">
            <h2>
              <ChartNoAxesColumnIncreasing size={22} />
              学习进度对比
            </h2>
          </div>
          <div className="overview-comparison-values">
            <div>
              <span>今日</span>
              <strong>
                {progress}
                <small>%</small>
              </strong>
            </div>
            <span className="overview-versus">VS</span>
            <div>
              <span>近期平均</span>
              <strong>
                {average === null ? (
                  "—"
                ) : (
                  <>
                    {average}
                    <small>%</small>
                  </>
                )}
              </strong>
            </div>
            <div
              className={`overview-change ${difference !== null && difference > 0 ? "positive" : ""}`}
            >
              <span>
                <TrendIcon size={16} />
                {difference === null
                  ? "待积累"
                  : difference > 0
                    ? "提升"
                    : difference < 0
                      ? "差距"
                      : "持平"}
              </span>
              <strong>
                {difference === null
                  ? "—"
                  : `${difference > 0 ? "+" : ""}${difference}`}
                <small>{difference !== null && "百分点"}</small>
              </strong>
            </div>
          </div>
          <span className="overview-pill blue">{momentum}</span>
          <p>
            {average === null
              ? "记录你的学习时长，逐步建立属于自己的学习节奏。"
              : difference! > 0
                ? `今日目标达成率较近期平均提升 ${difference} 个百分点，继续保持！`
                : progress >= 100
                  ? "今天的时长目标已达成，让每一次坚持都有收获。"
                  : "按自己的节奏稳步推进，每一段专注都算数。"}
          </p>
        </section>

        <section className="overview-card overview-highlights">
          <div className="overview-card-heading">
            <h2>
              <Trophy size={22} />
              今日学习亮点
            </h2>
          </div>
          <ul>
            <li>
              <Check size={15} />
              <span>
                {completed.length ? (
                  <>
                    已学习 <b>{completed.length}</b> 个知识点，继续积累新收获
                  </>
                ) : (
                  "新的一天，准备收获新的知识"
                )}
              </span>
            </li>
            <li>
              <Check size={15} />
              <span>
                今日学习时长 <b>{minutes}</b> 分钟，目标达成{" "}
                <em>{progress}%</em>
              </span>
            </li>
            <li>
              <Check size={15} />
              <span>
                {overview.reviews ? (
                  <>
                    完成 <b>{overview.reviews}</b> 次复习，让记忆更牢固
                  </>
                ) : remaining ? (
                  <>
                    再专注 <b>{remaining}</b> 分钟，完成今日时长目标
                  </>
                ) : (
                  "今日时长目标已达成，为你的坚持点赞"
                )}
              </span>
            </li>
          </ul>
        </section>

        <section className="overview-card overview-continuity">
          <div className="overview-card-heading">
            <h2>
              <CalendarDays size={22} />
              学习连续性 <small>（近 7 天）</small>
            </h2>
          </div>
          <div className="overview-continuity-values">
            <div>
              <span>
                <Check size={17} />
                连续学习
              </span>
              <strong>
                {overview.streak}
                <small> 天</small>
              </strong>
            </div>
            <div>
              <span>
                <Clock3 size={17} />
                今日时长
              </span>
              <strong>
                {minutes}
                <small> 分钟</small>
              </strong>
            </div>
          </div>
        </section>

        <section className="overview-card overview-quote">
          <Quote size={27} fill="currentColor" />
          <p>
            {progress >= 100 ? (
              <>
                今天的努力，已经悄悄生根。
                <br />
                带着这份收获，走向更好的明天。
              </>
            ) : minutes ? (
              <>
                已经走出的每一步，都算数。
                <br />
                再坚持一下，完成今天的小目标。
              </>
            ) : (
              <>
                不必一口气走得很远，
                <br />
                每天向前一步，就离目标更近一点。
              </>
            )}
          </p>
          <MountainIllustration />
        </section>
      </aside>
    </div>
  );
}
