import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ChevronDown,
  Settings2,
  BookOpen,
  FileUp,
  Check,
  ChevronRight,
  Clock3,
  Crosshair,
  GitBranch,
  Layers3,
  List,
  LockKeyhole,
  Network,
  Pencil,
  Play,
  Plus,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";
import type { Data, Topic, Tree } from "./domain";
import { dateText, dueText, Empty } from "./components";
import {
  evidence,
  nextSkill,
  routeTo,
  skillLabels,
  skillState,
  treeBlockers,
  treeProgress,
} from "./progression";
import { skillIcon } from "./skill-icons";
import { SkillTree, type SkillFocusRequest } from "./SkillTree";
import { recommendedRoute } from "./recommended-routes";
import { ProjectTreeNavigation } from "./ProjectTreeNavigation";
import type { Actions } from "./pages";

export function Trees({
  data,
  actions,
  treeId,
  setTreeId,
  selectedId,
}: {
  data: Data;
  actions: Actions;
  treeId: string;
  setTreeId: (id: string) => void;
  selectedId: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsedTrees, setCollapsedTrees] = useState<Set<string>>(
    () => new Set(),
  );
  const [routeOnly, setRouteOnly] = useState(false);
  const [showRecommendedRoute, setShowRecommendedRoute] = useState(false);
  const [focusRequest, setFocusRequest] = useState<SkillFocusRequest>();
  const focusSequence = useRef(0);
  const handleFocus = useCallback((handled: SkillFocusRequest) => {
    setFocusRequest((current) =>
      current?.treeId === handled.treeId &&
      current.nodeId === handled.nodeId &&
      current.sequence === handled.sequence
        ? undefined
        : current,
    );
  }, []);
  const navigationRef = useRef<HTMLDivElement>(null);
  const tree = data.trees.find((t) => t.id === treeId) ?? data.trees[0];
  const nodes = data.nodes.filter((n) => n.treeId === tree?.id);
  const recommendation = recommendedRoute(data, tree?.id ?? "");
  const parentTree = data.trees.find((t) => t.id === tree?.parentTreeId);
  const treePath: Tree[] = [];
  let pathTree: Tree | undefined = tree;
  while (pathTree && !treePath.some((item) => item.id === pathTree!.id)) {
    treePath.unshift(pathTree);
    pathTree = data.trees.find((item) => item.id === pathTree!.parentTreeId);
  }
  const project = treePath[0];
  function toggleBranch(id: string) {
    setCollapsedTrees((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function openProjectNavigation() {
    if (!menuOpen) {
      setCollapsedTrees((previous) => {
        const next = new Set(previous);
        treePath.slice(0, -1).forEach((item) => next.delete(item.id));
        return next;
      });
    }
    setMenuOpen((value) => !value);
  }
  function focusNode(node: Topic) {
    setShowRecommendedRoute(false);
    actions.select(node.id);
    setFocusRequest({
      treeId: node.treeId,
      nodeId: node.id,
      sequence: ++focusSequence.current,
    });
  }
  const selected =
    nodes.find((n) => n.id === selectedId) ??
    (tree ? nextSkill(data, tree.id) : undefined) ??
    recommendation.next ??
    recommendation.nodes[0];
  const projectProgress = tree
    ? treeProgress(data, tree.id)
    : { total: 0, verified: 0, completed: 0, complete: false };
  useEffect(() => {
    setRouteOnly(false);
    setMenuOpen(false);
    setShowRecommendedRoute(false);
    setFocusRequest((request) =>
      request?.treeId === treeId ? request : undefined,
    );
  }, [treeId]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        navigationRef.current &&
        !navigationRef.current.contains(event.target as globalThis.Node)
      )
        setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <div className="constellation-workspace">
      <section className="constellation-stage" aria-label="项目技能地图">
        <div className="project-navigation" ref={navigationRef}>
          <button
            className="project-switcher"
            aria-label="项目导航"
            aria-expanded={menuOpen}
            aria-controls="project-menu"
            onClick={openProjectNavigation}
          >
            <span className="project-logo">
              <Network size={20} />
            </span>
            <span>
              <small title={project?.title}>
                {parentTree ? `学习项目 · ${project?.title}` : "学习项目"}
              </small>
              <strong>{tree?.title ?? "选择学习项目"}</strong>
            </span>
            <ChevronDown size={16} />
          </button>
          {menuOpen && (
            <div className="project-menu" id="project-menu">
              <div className="project-menu-title">我的学习项目</div>
              <ProjectTreeNavigation
                data={data}
                selectedId={tree?.id}
                collapsedIds={collapsedTrees}
                onToggle={toggleBranch}
                onSelect={(id) => {
                  setTreeId(id);
                  setMenuOpen(false);
                }}
              />
              <div className="project-menu-divider" />
              <button
                onClick={() => {
                  setMenuOpen(false);
                  actions.tree();
                }}
              >
                <Plus size={16} />
                <span>新建学习项目</span>
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  actions.navigate("settings");
                }}
              >
                <FileUp size={16} />
                <span>导入课程包</span>
              </button>
              <div className="project-menu-divider" />
              {[
                { page: "home" as const, title: "学习概览", icon: Layers3 },
                { page: "reviews" as const, title: "复习挑战", icon: BookOpen },
                { page: "feedback" as const, title: "学习反馈", icon: Target },
                { page: "journal" as const, title: "学习日志", icon: List },
                {
                  page: "settings" as const,
                  title: "偏好与数据",
                  icon: Settings2,
                },
              ].map((item) => (
                <button
                  key={item.page}
                  onClick={() => actions.navigate(item.page)}
                >
                  <item.icon size={16} />
                  <span>{item.title}</span>
                  <ChevronRight size={13} />
                </button>
              ))}
              {tree && (
                <>
                  <div className="project-menu-divider" />
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      actions.tree(tree);
                    }}
                  >
                    <Pencil size={15} />
                    <span>
                      {parentTree ? "编辑当前学习树" : "编辑当前项目"}
                    </span>
                  </button>
                  <button
                    className="menu-danger"
                    onClick={() => {
                      setMenuOpen(false);
                      actions.deleteTree(tree.id);
                    }}
                  >
                    <Trash2 size={15} />
                    <span>
                      {parentTree ? "删除当前学习树" : "删除当前项目"}
                    </span>
                  </button>
                </>
              )}
            </div>
          )}
          {tree && (
            <div className="project-caption">
              <span>
                {projectProgress.completed} / {projectProgress.total} 已完成
              </span>
              <span className="caption-divider" />
              <span>
                {data.demo
                  ? "示例项目"
                  : parentTree
                    ? "项目内学习树"
                    : "个人学习项目"}
              </span>
            </div>
          )}
          {parentTree && (
            <button
              className="parent-tree-link"
              onClick={() => setTreeId(parentTree.id)}
            >
              <ArrowDownRight size={13} />
              返回上级 · {parentTree.title}
            </button>
          )}
          {tree && (
            <div className="recommendation-controls">
              <button
                className="recommend-node-button"
                disabled={!recommendation.next}
                onClick={() =>
                  recommendation.next && focusNode(recommendation.next)
                }
                aria-label={
                  recommendation.next
                    ? `推荐节点：${recommendation.next.title}`
                    : recommendation.blocked
                      ? "推荐路线等待补充节点"
                      : "推荐路线已完成"
                }
              >
                <Crosshair size={16} />
                <span>
                  <small>推荐节点</small>
                  <strong>
                    {recommendation.next?.title ??
                      (recommendation.blocked
                        ? recommendation.blocked.id === tree.id
                          ? "此树暂无节点"
                          : "前置树暂无节点"
                        : "路线已完成")}
                  </strong>
                </span>
                <ArrowRight size={15} />
              </button>
              <button
                className={`recommended-route-toggle ${showRecommendedRoute ? "active" : ""}`}
                onClick={() => setShowRecommendedRoute((value) => !value)}
                aria-expanded={showRecommendedRoute}
                aria-controls="recommended-route-panel"
              >
                <Route size={14} />
                推荐路线
                <ChevronDown size={13} />
              </button>
              {showRecommendedRoute && (
                <section
                  className="recommended-route-panel"
                  id="recommended-route-panel"
                  aria-label="推荐学习路线"
                >
                  <header>
                    <strong>{recommendation.title}</strong>
                    <span>
                      {recommendation.completed} / {recommendation.nodes.length}{" "}
                      已完成
                    </span>
                  </header>
                  <p>
                    按前置关系推进；完成或标记为已学后推荐下一站。点击节点可定位查看。
                  </p>
                  {recommendation.blocked && (
                    <div className="route-empty-notice">
                      「{recommendation.blocked.title}」尚无知识点，请先补充。
                      <button
                        onClick={() => setTreeId(recommendation.blocked!.id)}
                      >
                        进入学习树
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  )}
                  <ol>
                    {recommendation.nodes.map((node, index) => {
                      const completed = evidence(data, node.id).completed;
                      return (
                        <li key={node.id}>
                          <button
                            className={`${completed ? "is-complete" : ""} ${recommendation.next?.id === node.id ? "is-next" : ""}`}
                            onClick={() => focusNode(node)}
                            aria-label={`定位路线节点：${node.title}`}
                          >
                            <span className="route-step-index">
                              {completed ? <Check size={12} /> : index + 1}
                            </span>
                            <span>
                              {node.title}
                              {node.treeId !== tree.id && (
                                <small>
                                  {
                                    data.trees.find((t) => t.id === node.treeId)
                                      ?.title
                                  }
                                </small>
                              )}
                            </span>
                            {recommendation.next?.id === node.id && (
                              <span className="route-next-label">下一站</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}
            </div>
          )}
        </div>
        {tree ? (
          <>
            <div className="map-quick-actions">
              <button
                className={`map-quick-button ${routeOnly ? "active" : ""}`}
                aria-label="只看当前路线"
                aria-pressed={routeOnly}
                onClick={() => setRouteOnly((v) => !v)}
              >
                <Route size={16} />
                <span>当前路线</span>
              </button>
              <button
                className="map-quick-button"
                onClick={() => actions.tree(undefined, tree.id)}
                aria-label="添加子树"
                title="添加子树"
              >
                <GitBranch size={16} />
                <span>添加子树</span>
              </button>
              <button
                className="map-quick-button"
                onClick={() => actions.topic(tree.id)}
                aria-label="添加节点"
                title="添加节点"
              >
                <Plus size={16} />
                <span>添加节点</span>
              </button>
            </div>
            <SkillTree
              data={data}
              tree={tree}
              selected={selected?.id}
              onSelect={actions.select}
              routeOnly={routeOnly}
              recommendedIds={
                showRecommendedRoute
                  ? recommendation.nodes.map((n) => n.id)
                  : undefined
              }
              focusRequest={focusRequest}
              onFocusHandled={handleFocus}
              onOpenTree={setTreeId}
            />
          </>
        ) : (
          <div className="new-project-map">
            <Empty
              title="导入你的第一个学习项目"
              action="导入课程包"
              onAction={() => actions.navigate("settings")}
            >
              从课程包载入学习树、讲义和题目，再开始自己的学习。
            </Empty>
          </div>
        )}
      </section>
      <section className="command-center" aria-label="任务指挥台">
        <SkillInspector
          key={selected?.id ?? "none"}
          data={data}
          node={selected}
          actions={actions}
          onLearn={actions.learn}
          onOpenTree={setTreeId}
        />
      </section>
    </div>
  );
}
function SkillInspector({
  data,
  node,
  actions,
  onLearn,
  onOpenTree,
}: {
  data: Data;
  node: Topic | undefined;
  actions: Actions;
  onLearn: (id: string) => void;
  onOpenTree: (id: string) => void;
}) {
  const [tab, setTab] = useState("mission");
  const [marking, setMarking] = useState(false);
  if (!node)
    return (
      <aside className="skill-inspector">
        <div className="inspector-empty">
          <Crosshair size={30} />
          <h3>选择一个知识点</h3>
          <p>在地图中查看它的前置路线、学习任务和成长证据。</p>
        </div>
      </aside>
    );
  const progress = evidence(data, node.id),
    state = skillState(data, node),
    Icon = skillIcon(node.title),
    path = routeTo(data, node.id);
  const parent = data.nodes.find((n) => n.id === node.parentId);
  const blockers = treeBlockers(data, node.treeId);
  const sessions = data.sessions
    .filter((s) => s.nodeId === node.id)
    .sort((a, b) => b.at.localeCompare(a.at));
  const reviews = data.reviews
    .filter((r) => r.nodeId === node.id)
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <aside className="skill-inspector">
      <div className="inspector-top">
        <span className="command-title">
          <Crosshair size={13} />
          任务指挥台
        </span>
        <button
          className="icon-button"
          aria-label="编辑知识点"
          onClick={() => actions.topic(node.treeId, node)}
        >
          <Pencil size={15} />
        </button>
      </div>
      <div className={`inspector-emblem ${state}`}>
        <Icon size={30} strokeWidth={1.5} />
        {progress.completed && (
          <span>
            <Check size={11} />
          </span>
        )}
      </div>
      <div className={`state-pill ${state}`}>
        {state === "locked" ? (
          <LockKeyhole size={11} />
        ) : progress.completed ? (
          <ShieldCheck size={12} />
        ) : (
          <Sparkles size={12} />
        )}{" "}
        {skillLabels[state]}
      </div>
      <h2>{node.title}</h2>
      <div className="rank-milestones">
        {[
          { label: "探索", icon: BookOpen },
          { label: "验证", icon: ShieldCheck },
          { label: "巩固", icon: Trophy },
        ].map((m, i) => (
          <Fragment key={m.label}>
            {i > 0 && (
              <ArrowRight
                size={14}
                strokeWidth={1.5}
                aria-hidden="true"
                className={`milestone-arrow ${
                  progress.rank >= i + 1 ? "earned" : ""
                }`}
              />
            )}
            <div className={progress.rank >= i + 1 ? "earned" : ""}>
              <span>
                {progress.rank >= i + 1 ? (
                  <Check size={12} />
                ) : (
                  <m.icon size={12} />
                )}
              </span>
              <small>{m.label}</small>
            </div>
          </Fragment>
        ))}
      </div>
      <div className="inspector-tabs">
        {[
          ["mission", "学习任务"],
          ["notes", "笔记"],
          ["history", "历程"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
            {key === "history" && (
              <small>{sessions.length + reviews.length}</small>
            )}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {tab === "mission" ? (
          <>
            <div className="mission-title highlight">
              <Target size={14} />
              <h3>当前学习任务</h3>
            </div>
            <p className="challenge-copy">
              {node.question ||
                `用自己的话解释「${node.title}」，然后完成一次自测。`}
            </p>
            {progress.markedLearned && (
              <p className="criteria-note">
                已标记为已学，已计入进度。你仍可继续阅读或测验。
              </p>
            )}
            <p className="requirements-title">解锁要求</p>
            <div className="requirements">
              <div className={progress.questions >= 5 ? "met" : ""}>
                <span>
                  {progress.questions >= 5 ? <Check size={12} /> : <span />}
                </span>
                <p>近期完成至少 5 道计分题</p>
                <b>{Math.min(progress.questions, 5)}/5</b>
              </div>
              <div className={progress.verified ? "met" : ""}>
                <span>
                  {progress.verified ? <Check size={12} /> : <span />}
                </span>
                <p>近期加权正确率达到 80%</p>
                <b>{progress.score === null ? "—" : `${progress.score}%`}</b>
              </div>
            </div>
            <div className="verification-meter">
              <i style={{ width: `${progress.score ?? 0}%` }} />
              <span style={{ left: "80%" }} />
            </div>
            <p className="criteria-note">
              取最近 5 次有成绩的自测；标准自评不计入正确率。
            </p>
            {!!blockers.length && (
              <div className="prerequisite">
                <span>
                  <GitBranch size={13} />
                  前置学习树
                </span>
                <div className="route-crumbs">
                  {blockers.map((tree) => (
                    <button key={tree.id} onClick={() => onOpenTree(tree.id)}>
                      <LockKeyhole size={11} />
                      {tree.title}
                      <ChevronRight size={11} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {parent && (
              <div className="prerequisite">
                <span>
                  <GitBranch size={13} />
                  前置路线
                </span>
                <div className="route-crumbs">
                  {path.slice(0, -1).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => actions.select(p.id)}
                      className={evidence(data, p.id).completed ? "passed" : ""}
                    >
                      {evidence(data, p.id).completed ? (
                        <Check size={11} />
                      ) : (
                        <LockKeyhole size={10} />
                      )}{" "}
                      {p.title}
                      <ChevronRight size={11} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {progress.verified && node.question && node.answer && (
              <button
                className="recall-callout"
                onClick={() => actions.navigate("reviews")}
              >
                <RotateIcon />
                <span>
                  下一次主动回忆<strong>{dueText(node.card.due)}</strong>
                </span>
                <ArrowRight size={14} />
              </button>
            )}
            <div className="inspector-metrics">
              <div>
                <strong>
                  {progress.minutes}
                  <small> 分钟</small>
                </strong>
                <span>累计学习</span>
              </div>
              <div>
                <strong>
                  {sessions.length}
                  <small> 次</small>
                </strong>
                <span>学习记录</span>
              </div>
            </div>
          </>
        ) : tab === "notes" ? (
          <>
            <div className="mission-title">
              <BookOpen size={14} />
              <h3>我的理解</h3>
            </div>
            <p className="note-content">
              {node.note || "记下一个解释、一处困惑，或者你自己的例子。"}
            </p>
            {node.resource && (
              <a
                href={node.resource}
                target="_blank"
                rel="noreferrer"
                className="resource-link"
              >
                打开学习资料
                <ArrowDownRight size={14} />
              </a>
            )}
            <button
              className="button small"
              onClick={() => actions.topic(node.treeId, node)}
            >
              <Pencil size={13} />
              编辑笔记和回忆题
            </button>
          </>
        ) : (
          <div className="node-timeline">
            {[
              ...(node.learnedAt
                ? [
                    {
                      id: `learned-${node.id}`,
                      at: node.learnedAt,
                      title: "标记为已学",
                      detail: "跳过本节点学习，推进学习进度。",
                    },
                  ]
                : []),
              ...sessions.map((s) => ({
                id: s.id,
                at: s.at,
                title: `学习 ${s.minutes} 分钟`,
                detail: s.total
                  ? `自测 ${s.correct}/${s.total} · ${s.note}`
                  : s.note,
              })),
              ...reviews.map((r) => ({
                id: r.id,
                at: r.at,
                title: "完成主动回忆",
                detail: ["", "没想起来", "有些吃力", "基本记得", "轻松记得"][
                  r.rating
                ],
              })),
            ]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((r) => (
                <article key={r.id}>
                  <i />
                  <time>{dateText(r.at, true)}</time>
                  <strong>{r.title}</strong>
                  <p>{r.detail}</p>
                </article>
              ))}
            {!sessions.length && !reviews.length && !node.learnedAt && (
              <p className="empty-history">
                完成第一次探索，这里就会留下你的进步。
              </p>
            )}
          </div>
        )}
      </div>
      <div className="inspector-actions">
        {state === "locked" && (parent || blockers.length) ? (
          <>
            <button
              className="button primary"
              onClick={() =>
                blockers[0]
                  ? onOpenTree(blockers[0].id)
                  : parent && actions.select(parent.id)
              }
            >
              <LockKeyhole size={14} />
              {blockers.length ? "前往前置学习树" : "前往前置节点"}
            </button>
            <button className="text-button" onClick={() => onLearn(node.id)}>
              我想提前探索此节点
              <ArrowRight size={12} />
            </button>
          </>
        ) : (
          <>
            <button className="button primary" onClick={() => onLearn(node.id)}>
              <Play size={14} fill="currentColor" />
              开始学习
              <ArrowRight size={14} />
            </button>
            <button className="button" onClick={() => actions.study(node.id)}>
              <Plus size={14} />
              补记学习记录
            </button>
          </>
        )}
        <button
          className="button"
          disabled={marking || progress.completed}
          onClick={async () => {
            if (marking) return;
            setMarking(true);
            try {
              await actions.markLearned(node.id);
            } finally {
              setMarking(false);
            }
          }}
        >
          <Check size={14} />
          {marking
            ? "正在保存…"
            : progress.markedLearned
              ? "已标记为已学"
              : progress.completed
                ? "已完成"
                : "标记为已学"}
        </button>
      </div>
    </aside>
  );
}
function RotateIcon() {
  return <Clock3 size={17} />;
}
