import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronsRight,
  Settings2,
  BookOpen,
  FileUp,
  Check,
  ChevronRight,
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
} from "lucide-react";
import type { Data, Topic, Tree } from "./domain";
import { Empty } from "./components";
import {
  evidence,
  nextSkill,
  skillLabels,
  skillState,
  treeBlockers,
  treeProgress,
} from "./progression";
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
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [collapsedTrees, setCollapsedTrees] = useState<Set<string>>(
    () => new Set(),
  );
  const [routeOnly, setRouteOnly] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
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
  const childTrees = data.trees.filter((t) => t.parentTreeId === tree?.id);
  const activeChildId =
    recommendation.next?.treeId ??
    childTrees.find((t) => !treeProgress(data, t.id).complete)?.id;
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
    <>
      <header className="tree-page-hero">
        <div className="page-title-wrap">
          <span className="page-title-mark" aria-hidden="true" />
          <div className="page-title-float">
            <h1>{project?.title ?? "技能树"}</h1>
          </div>
        </div>
      </header>
      <div
        className={`constellation-workspace mobile-${mobileView}`}
      >
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
        {tree && (
          <div className="mobile-tree-tools">
            <div className="mobile-segment" role="tablist" aria-label="技能树视图">
              <button
                type="button"
                role="tab"
                aria-selected={mobileView === "list"}
                className={mobileView === "list" ? "active" : ""}
                onClick={() => setMobileView("list")}
              >
                <List size={14} />
                列表
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileView === "map"}
                className={mobileView === "map" ? "active" : ""}
                onClick={() => setMobileView("map")}
              >
                <Network size={14} />
                画布
              </button>
            </div>
            {recommendation.next && (
              <button
                className="mobile-continue"
                onClick={() => actions.learn(recommendation.next!.id)}
              >
                <Play size={13} />
                继续学习
              </button>
            )}
            <div className="mobile-stage-list">
              {childTrees.length
                ? childTrees.map((child, index) => {
                    const progress = treeProgress(data, child.id);
                    const complete = progress.complete;
                    const blocked = treeBlockers(data, child.id).length > 0;
                    const active = child.id === activeChildId;
                    const percentage = progress.total
                      ? Math.round((progress.completed / progress.total) * 100)
                      : 0;
                    return (
                      <div
                        className={`mobile-stage-row ${complete ? "done" : ""} ${active ? "active" : ""}`}
                        key={child.id}
                      >
                        <span className="mobile-stage-index">
                          {complete ? (
                            <Check size={13} />
                          ) : blocked ? (
                            <LockKeyhole size={12} />
                          ) : (
                            String(index + 1).padStart(2, "0")
                          )}
                        </span>
                        <button
                          className="mobile-stage-card"
                          onClick={() => setTreeId(child.id)}
                        >
                          <span className="mobile-stage-head">
                            <strong>{child.title}</strong>
                            <small>
                              {complete
                                ? "已完成"
                                : blocked
                                  ? "未解锁"
                                  : "进行中"}
                            </small>
                          </span>
                          <span className="mobile-stage-progress">
                            <i style={{ width: `${percentage}%` }} />
                          </span>
                          <span className="mobile-stage-meta">
                            <span>
                              {progress.completed} / {progress.total} 知识点
                            </span>
                            <span>{percentage}%</span>
                          </span>
                          {active && recommendation.next && (
                            <span className="mobile-stage-next">
                              下一站：{recommendation.next.title}
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })
                : nodes.map((node, index) => {
                    const state = skillState(data, node);
                    const complete =
                      state === "verified" ||
                      state === "consolidated" ||
                      state === "learned";
                    const active = selected?.id === node.id;
                    return (
                      <div
                        className={`mobile-stage-row ${complete ? "done" : ""} ${active ? "active" : ""}`}
                        key={node.id}
                      >
                        <span className="mobile-stage-index">
                          {complete ? (
                            <Check size={13} />
                          ) : state === "locked" ? (
                            <LockKeyhole size={12} />
                          ) : (
                            String(index + 1).padStart(2, "0")
                          )}
                        </span>
                        <button
                          className="mobile-stage-card"
                          onClick={() => actions.learn(node.id)}
                        >
                          <span className="mobile-stage-head">
                            <strong>{node.title}</strong>
                            <small>{skillLabels[state]}</small>
                          </span>
                          <span className="mobile-stage-meta">
                            <span>{node.quiz.length} 道题</span>
                            <span>开始学习</span>
                          </span>
                        </button>
                      </div>
                    );
                  })}
            </div>
          </div>
        )}
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
      <section
        className={`command-center ${panelCollapsed ? "is-collapsed" : ""}`}
        aria-label="节点详情"
      >
        <SkillInspector
          key={selected?.id ?? "none"}
          data={data}
          node={selected}
          actions={actions}
          onLearn={actions.learn}
          onOpenTree={setTreeId}
        />
        <button
          className="inspector-collapse"
          aria-label="收起节点详情"
          title="收起节点详情"
          onClick={() => setPanelCollapsed(true)}
        >
          <ChevronsRight size={16} />
        </button>
      </section>
      <button
        className={`inspector-reopen ${panelCollapsed ? "is-visible" : ""}`}
        aria-label="展开节点详情"
        title="展开节点详情"
        onClick={() => setPanelCollapsed(false)}
      >
        <ChevronLeft size={17} />
      </button>
    </div>
    {selected && (
      <button
        className="tree-continue"
        onClick={() => actions.learn(selected.id)}
      >
        继续学习 <ArrowRight size={15} />
      </button>
    )}
    </>
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
  if (!node)
    return (
      <aside className="skill-inspector">
        <div className="inspector-empty">
          <Crosshair size={30} />
          <h3>选择一个知识点</h3>
          <p>查看前置路线、学习任务和学习记录。</p>
        </div>
      </aside>
    );
  const progress = evidence(data, node.id),
    state = skillState(data, node);
  const parent = data.nodes.find((n) => n.id === node.parentId);
  const blockers = treeBlockers(data, node.treeId);
  const siblings = data.nodes.filter((n) => n.treeId === node.treeId);
  const mastery = Math.round((progress.rank / 3) * 100);
  return (
    <aside className="skill-inspector">
      <button
        className="inspector-edit icon-button"
        aria-label="编辑知识点"
        onClick={() => actions.topic(node.treeId, node)}
      >
        <Pencil size={15} />
      </button>
      <div className="inspector-summary">
        <div className="inspector-title-row">
          <h2>{node.title}</h2>
          <span className={`state-pill ${state}`}>
            {state === "locked" ? (
              <LockKeyhole size={11} />
            ) : progress.completed ? (
              <ShieldCheck size={12} />
            ) : (
              <Sparkles size={12} />
            )}
            {skillLabels[state]}
          </span>
        </div>
      </div>
      <div className="inspector-topics">
        <span className="inspector-section-label">知识点</span>
        {siblings.map((item) => {
          const itemState = skillState(data, item);
          const done = evidence(data, item.id).completed;
          return (
            <button
              key={item.id}
              className={`${item.id === node.id ? "active" : ""} ${done ? "done" : ""}`}
              onClick={() => actions.select(item.id)}
            >
              <span className="topic-state">
                {done ? (
                  <Check size={11} />
                ) : itemState === "locked" ? (
                  <LockKeyhole size={10} />
                ) : null}
              </span>
              <span>{item.title}</span>
              {item.id === node.id && <ArrowRight size={12} />}
            </button>
          );
        })}
      </div>
      <div className="inspector-mastery">
        <div className="inspector-mastery-head">
          <span>节点掌握度</span>
          <b>
            {progress.rank} / 3
          </b>
        </div>
        <div className="inspector-mastery-track">
          <i style={{ width: `${(progress.rank / 3) * 100}%` }} />
        </div>
      </div>
      <div className="inspector-progress">
        <div>
          <span>学习进度</span>
          <small>{mastery}% · {progress.rank} / 3</small>
        </div>
        <div
          className="inspector-ring inspector-ring-animated"
          aria-label={`学习进度 ${mastery}%`}
        >
          <svg viewBox="0 0 72 72" aria-hidden="true">
            <circle className="track" cx="36" cy="36" r="30" />
            <circle
              className="value"
              cx="36"
              cy="36"
              r="30"
              pathLength="100"
              strokeDasharray={`${mastery} 100`}
            />
          </svg>
          <b>{mastery}%</b>
        </div>
      </div>
      <div className="inspector-bottom">
        <div className="inspector-actions">
          {state === "locked" && (parent || blockers.length) ? (
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
          ) : (
            <button className="button primary" onClick={() => onLearn(node.id)}>
              <Play size={14} fill="currentColor" />
              {progress.rank ? "继续学习" : "开始学习"}
              <ArrowRight size={14} />
            </button>
          )}
          <button className="button" onClick={() => actions.study(node.id)}>
            <Plus size={14} />
            补记学习记录
          </button>
        </div>
      </div>
    </aside>

  );
}
