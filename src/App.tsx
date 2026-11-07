import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  BookOpen,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileUp,
  Home as HomeIcon,
  Leaf,
  LogOut,
  Menu,
  Network,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sprout,
  X,
} from "lucide-react";
import {
  blankData,
  dayKey,
  dueTopics,
  removeTree,
  markTopicLearned,
  reviewTopic,
  type Data,
  type Tree,
  type Topic,
} from "./domain";
import {
  downloadJson,
  loadData,
  readBackup,
  saveData,
  STORAGE_KEY,
  BackendError,
  LegacyDataError,
  fetchWorkspace,
  readLegacyData,
  markLegacyMigrated,
  readCourseFile,
  exampleCourse,
  saveCoursePackage,
  type Workspace,
} from "./storage";
import { treeProgress } from "./progression";
import { Modal } from "./components";
import { SessionForm, TopicForm, TreeForm } from "./forms";
import { AuthScreen } from "./AuthScreen";
import { currentUser, logout, type AuthUser } from "./auth";
import {
  Feedback,
  Home,
  Journal,
  Reviews,
  Settings,
  Trees,
  type Actions,
  type Page,
} from "./pages";

const LearningRoom = lazy(() =>
  import("./LearningRoom").then((module) => ({
    default: module.LearningRoom,
  })),
);

type Dialog =
  | { kind: "tree"; tree?: Tree; parentTreeId?: string }
  | { kind: "topic"; treeId: string; topic?: Topic; parentId?: string }
  | { kind: "session"; nodeId?: string }
  | {
      kind: "confirm";
      title: string;
      description: string;
      label: string;
      run: () => Promise<boolean>;
    }
  | null;
const nav = [
  { id: "trees", title: "技能树", icon: Network },
  { id: "home", title: "学习概览", icon: HomeIcon },
  { id: "reviews", title: "复习挑战", icon: RotateCcw },
  { id: "feedback", title: "学习反馈", icon: ChartNoAxesCombined },
  { id: "journal", title: "学习日志", icon: BookOpen },
] as const;
function message(error: unknown) {
  if (error && typeof error === "object" && "issues" in error) {
    const issue = (error as { issues: { code: string; message: string }[] })
      .issues[0];
    return `数据校验失败：${issue && /[\u3400-\u9fff]/.test(issue.message) ? issue.message : "内容不完整或字段不正确，请检查填写内容或备份格式"}`;
  }
  return error instanceof Error ? error.message : "操作失败，请重试";
}
export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setChecking(true);
    currentUser()
      .then((value) => {
        if (!active) return;
        setUser(value);
        setConnectionError("");
      })
      .catch((error) => {
        if (active) setConnectionError(message(error));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  async function endSession() {
    try {
      await logout();
    } catch {
      /* The local session is cleared even when the API is unreachable. */
    }
    setUser(null);
  }

  if (checking)
    return (
      <div className="recovery" role="status">
        <Sprout size={38} />
        <h1>正在连接学习空间</h1>
        <p>正在确认本地账号与会话…</p>
      </div>
    );

  if (connectionError)
    return (
      <div className="recovery">
        <Sprout size={38} />
        <h1>无法连接后端</h1>
        <p role="alert">{connectionError}</p>
        <button
          className="button primary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          重新连接
        </button>
      </div>
    );

  if (!user) return <AuthScreen onAuthenticated={(value) => setUser(value)} />;

  return <WorkspaceApp user={user} onSessionEnd={endSession} />;
}
function WorkspaceApp({
  user,
  onSessionEnd,
}: {
  user: AuthUser;
  onSessionEnd: () => Promise<void>;
}) {
  const [data, setData] = useState<Data>(blankData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [legacyError, setLegacyError] = useState(false);
  const revision = useRef<number | null>(null);
  const savingRef = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const [page, setPage] = useState<Page>("trees");
  const [treeId, setTreeId] = useState(data.trees[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [search, setSearch] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [, setTick] = useState(0);
  useEffect(() => {
    const searchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".search-wrap input")?.focus();
      }
    };
    window.addEventListener("keydown", searchShortcut);
    return () => window.removeEventListener("keydown", searchShortcut);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  function acceptWorkspace(value: Workspace) {
    if (value.data === null) throw new Error("数据库工作区尚未初始化。");
    revision.current = value.revision;
    setData(value.data);
    setRemoteChanged(false);
    const incoming = value.data;
    setTreeId((current) =>
      incoming.trees.some((t) => t.id === current)
        ? current
        : (incoming.trees[0]?.id ?? ""),
    );
    setSelectedId((current) =>
      incoming.nodes.some((n) => n.id === current) ? current : null,
    );
  }
  useEffect(() => {
    let active = true;
    loadData()
      .then((value) => {
        if (active) acceptWorkspace(value);
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof BackendError && error.code === "unauthorized") {
          void onSessionEnd();
          return;
        }
        setLoadError(message(error));
        setLegacyError(error instanceof LegacyDataError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel(
        `learning-tree:postgres:${user.id}`,
      );
      channel.current.onmessage = (event) => {
        if (
          revision.current !== null &&
          typeof event.data?.revision === "number" &&
          event.data.revision !== revision.current
        )
          setRemoteChanged(true);
      };
    }
    const refreshNotice = () => {
      if (revision.current === null || savingRef.current) return;
      void fetchWorkspace()
        .then((value) => {
          if (value.revision !== revision.current) setRemoteChanged(true);
        })
        .catch((error) => {
          if (error instanceof BackendError && error.code === "unauthorized")
            void onSessionEnd();
        });
    };
    window.addEventListener("focus", refreshNotice);
    return () => {
      channel.current?.close();
      channel.current = null;
      window.removeEventListener("focus", refreshNotice);
    };
  }, [onSessionEnd, user.id]);
  async function reloadWorkspace(skipLegacy = false) {
    if (savingRef.current) return;
    setLoading(true);
    setLoadError("");
    setLegacyError(false);
    try {
      acceptWorkspace(await loadData(skipLegacy));
      setDialog(null);
    } catch (error) {
      if (error instanceof BackendError && error.code === "unauthorized") {
        void onSessionEnd();
        return;
      }
      setLoadError(message(error));
      setLegacyError(error instanceof LegacyDataError);
    } finally {
      setLoading(false);
    }
  }
  async function write(
    operation: (expectedRevision: number) => Promise<Workspace>,
    notification: string,
  ) {
    if (savingRef.current) return false;
    if (revision.current === null) {
      setToast({ text: "请先连接数据库。", error: true });
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    window.dispatchEvent(
      new CustomEvent("learningtree:saving", { detail: true }),
    );
    try {
      const value = await operation(revision.current);
      acceptWorkspace(value);
      window.dispatchEvent(new Event("learningtree:saved"));
      try {
        channel.current?.postMessage({ revision: value.revision });
      } catch {
        /* Saving is already complete. */
      }
      setToast({ text: notification, error: false });
      return true;
    } catch (error) {
      if (error instanceof BackendError && error.code === "unauthorized") {
        void onSessionEnd();
        return false;
      }
      if (error instanceof BackendError && error.code === "revision_conflict")
        setRemoteChanged(true);
      const text = message(error);
      setToast({ text, error: true });
      window.dispatchEvent(
        new CustomEvent("learningtree:error", { detail: text }),
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
      window.dispatchEvent(
        new CustomEvent("learningtree:saving", { detail: false }),
      );
    }
  }
  function commit(next: Data, notification = "已保存到数据库") {
    return write((expected) => saveData(next, expected), notification);
  }
  async function offerCourseImport(file?: File) {
    try {
      const pack = file ? await readCourseFile(file) : await exampleCourse();
      confirm(
        "导入学习课程？",
        `「${pack.name}」包含 ${pack.trees.length} 棵学习树、${pack.nodes.length} 个知识点和 ${pack.nodes.reduce((sum, n) => sum + n.quiz.length, 0)} 道测验题。同一 ID 的内容将被更新，笔记与学习历史保留；回忆题变更时重新安排复习。`,
        "导入课程",
        async () => {
          const ok = await write(
            (expected) => saveCoursePackage(pack, expected),
            "课程已导入，学习记录已保留",
          );
          if (ok) {
            setTreeId(pack.trees[0].id);
            setSelectedId(null);
            navigate("trees");
          }
          return ok;
        },
      );
    } catch (error) {
      setToast({ text: `无法导入课程：${message(error)}`, error: true });
    }
  }
  function navigate(next: Page) {
    setPage(next);
    setSearch("");
    setMobileMenu(false);
    window.scrollTo({ top: 0 });
  }
  function select(id: string) {
    const node = data.nodes.find((n) => n.id === id);
    if (node) {
      setTreeId(node.treeId);
      setSelectedId(id);
      if (page !== "trees") navigate("trees");
      else setSearch("");
    }
  }
  function confirm(
    title: string,
    description: string,
    label: string,
    run: () => Promise<boolean>,
  ) {
    setDialog({ kind: "confirm", title, description, label, run });
  }
  const actions: Actions = {
    navigate,
    select,
    learn: (id) => {
      const node = data.nodes.find((n) => n.id === id);
      if (node) {
        setSelectedId(id);
        setTreeId(node.treeId);
        navigate("learn");
      }
    },
    startReview: (id) => {
      setSelectedId(id);
      navigate("reviews");
    },
    saveNote: (id, note) =>
      commit(
        {
          ...data,
          nodes: data.nodes.map((n) => (n.id === id ? { ...n, note } : n)),
        },
        "笔记已保存",
      ),
    recordQuiz: (session) =>
      commit(
        {
          ...data,
          sessions: [
            ...data.sessions.filter((s) => s.id !== session.id),
            session,
          ],
        },
        "测验成绩已保存，技能树已更新",
      ),
    study: (id) => {
      if (!data.trees.length) {
        setDialog({ kind: "tree" });
        return;
      }
      if (!data.nodes.length) {
        setDialog({ kind: "topic", treeId: data.trees[0].id });
        return;
      }
      setDialog({ kind: "session", nodeId: id });
    },
    tree: (tree, parentTreeId) =>
      setDialog({ kind: "tree", tree, parentTreeId }),
    topic: (treeId, topic, parentId) =>
      setDialog({ kind: "topic", treeId, topic, parentId }),
    markLearned: async (id, note) => {
      const node = data.nodes.find((n) => n.id === id);
      if (!node) return false;
      const marked = markTopicLearned(data, id);
      const next =
        note === undefined || note === node.note
          ? marked
          : {
              ...marked,
              nodes: marked.nodes.map((n) =>
                n.id === id ? { ...n, note } : n,
              ),
            };
      if (next === data) return true;
      return commit(next, "已标记为已学，学习进度已更新");
    },
    deleteTree: (id) => {
      const ids = new Set(
        data.nodes.filter((n) => n.treeId === id).map((n) => n.id),
      );
      confirm(
        "删除整棵学习树？",
        `将删除「${data.trees.find((t) => t.id === id)?.title}」和 ${ids.size} 个知识点，以及对应的全部记录。子树会保留并移到上一级，其他树对它的前置依赖会解除。此操作无法撤销。`,
        "删除学习树",
        async () => {
          const next = removeTree(data, id);
          const ok = await commit(next, "学习树已删除");
          if (ok) {
            setTreeId(next.trees[0]?.id ?? "");
            setSelectedId(null);
          }
          return ok;
        },
      );
    },
    review: async (id, rating, response) => {
      try {
        return await commit(
          reviewTopic(data, id, rating, response),
          "回忆已记录，下次复习已安排",
        );
      } catch (error) {
        setToast({ text: message(error), error: true });
        return false;
      }
    },
    deleteSession: (id) =>
      confirm(
        "删除这条学习记录？",
        "该记录将从学习时长和自测统计中移除，反馈会重新计算。此操作无法撤销。",
        "删除记录",
        () =>
          commit(
            { ...data, sessions: data.sessions.filter((s) => s.id !== id) },
            "学习记录已删除，反馈已更新",
          ),
      ),
    export: async () => {
      try {
        const current = await fetchWorkspace();
        if (!current.data) throw new Error("数据库尚未初始化。");
        downloadJson(current.data, `LearningTree-${dayKey(new Date())}.json`);
        setToast({ text: "已导出数据库中的完整备份", error: false });
      } catch (error) {
        setToast({ text: message(error), error: true });
      }
    },
    importCourse: (file) => offerCourseImport(file),
    courseTemplate: async () => {
      try {
        downloadJson(await exampleCourse(), "learning-tree-course.json");
      } catch (error) {
        setToast({ text: message(error), error: true });
      }
    },
    migrateLegacy: () => {
      try {
        const legacy = readLegacyData();
        if (!legacy) {
          setToast({ text: "此浏览器没有旧版学习数据。", error: false });
          return;
        }
        confirm(
          "迁移旧浏览器数据？",
          `将用旧数据替换数据库工作区：${legacy.trees.length} 棵树、${legacy.sessions.length} 条学习记录。请先导出数据库备份；旧浏览器原文会保留。`,
          "迁移并替换",
          async () => {
            const ok = await commit(legacy, "旧浏览器数据已迁移到数据库");
            if (ok) {
              markLegacyMigrated();
              navigate("trees");
            }
            return ok;
          },
        );
      } catch (error) {
        setToast({ text: message(error), error: true });
      }
    },
    import: async (file) => {
      try {
        const incoming = await readBackup(file);
        confirm(
          "恢复这份备份？",
          `备份包含 ${incoming.trees.length} 棵学习树、${incoming.nodes.length} 个知识点、${incoming.sessions.length} 条学习记录、${incoming.reviews.length} 条复习记录。恢复将替换当前全部数据，建议先导出当前备份。`,
          "确认恢复",
          async () => {
            const ok = await commit(incoming, "备份已恢复");
            if (ok) {
              setTreeId(incoming.trees[0]?.id ?? "");
              setSelectedId(null);
              navigate("home");
            }
            return ok;
          },
        );
      } catch (error) {
        setToast({ text: `无法导入：${message(error)}`, error: true });
      }
    },
    reset: () =>
      confirm(
        data.demo ? "开始自己的学习空间？" : "清空全部学习数据？",
        data.demo
          ? "将移除当前空间中的全部示例和已添加记录，然后开始空白学习空间。需要保留当前内容，请先导出备份。"
          : "将永久删除数据库中的所有学习树、记录和复习计划。偏好保留。请先导出备份，此操作无法撤销。",
        data.demo ? "清空并开始" : "确认清空",
        async () => {
          const ok = await commit(
            { ...blankData(), settings: data.settings },
            "你的新学习空间已准备好",
          );
          if (ok) {
            setTreeId("");
            setSelectedId(null);
            navigate("home");
          }
          return ok;
        },
      ),
    demo: () => offerCourseImport(),
    settings: (settings) => commit({ ...data, settings }, "偏好已保存"),
  };
  if (loading)
    return (
      <div className="recovery" role="status">
        <Sprout size={38} />
        <h1>正在载入学习空间</h1>
        <p>从数据库读取你的课程与学习记录…</p>
      </div>
    );
  if (loadError)
    return (
      <div className="recovery">
        <Sprout size={38} />
        <h1>{legacyError ? "旧数据需要处理" : "暂时无法载入学习空间"}</h1>
        <p role="alert">{loadError}</p>
        <button
          className="button primary"
          onClick={() => void reloadWorkspace()}
        >
          重新连接
        </button>
        {legacyError && (
          <>
            <button
              className="button"
              onClick={() => {
                try {
                  downloadJson(
                    { raw: localStorage.getItem(STORAGE_KEY) },
                    "LearningTree-legacy-recovery.json",
                  );
                } catch {
                  setLoadError("浏览器不允许读取旧数据。");
                }
              }}
            >
              <ArrowDownToLine size={16} />
              下载旧数据原文
            </button>
            <button
              className="button"
              onClick={() => void reloadWorkspace(true)}
            >
              保留旧数据，跳过本次迁移
            </button>
          </>
        )}
      </div>
    );
  const result = search.trim()
    ? data.nodes
        .filter((n) =>
          `${n.title} ${n.note} ${n.question}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
        )
        .slice(0, 8)
    : [];
  const due = dueTopics(data).length;
  const currentTree = data.trees.find((tree) => tree.id === treeId);
  const topProjects = data.trees.filter((tree) => !tree.parentTreeId);
  const sidebarProject = currentTree?.parentTreeId
    ? data.trees.find((tree) => tree.id === currentTree.parentTreeId)
    : currentTree;
  const selectedNode = data.nodes.find((node) => node.id === selectedId);
  const fallbackStage = currentTree
    ? data.trees.find((tree) => tree.parentTreeId === currentTree.id)
    : undefined;
  const activeStage = selectedNode
    ? data.trees.find((tree) => tree.id === selectedNode.treeId)
    : currentTree?.parentTreeId
      ? currentTree
      : (fallbackStage ?? currentTree);
  const activeStageProgress = activeStage
    ? treeProgress(data, activeStage.id)
    : null;
  return (
    <div
      className={`app-shell ${page === "trees" ? "tree-page" : page === "home" ? "overview-shell" : ""} ${page === "learn" ? "learning-page" : ""}`}
    >
      {(saving || remoteChanged) && (
        <div className="database-status" role="status">
          {saving ? (
            "正在保存到数据库…"
          ) : (
            <>
              <span>数据库有更新，当前未保存的输入请先保留。</span>
              <button onClick={() => void reloadWorkspace()}>
                关闭表单并载入最新数据
              </button>
            </>
          )}
        </div>
      )}
      <a className="skip-link" href="#main">
        跳到主内容
      </a>
      {mobileMenu && (
        <button
          className="sidebar-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <button className="brand" onClick={() => navigate("trees")}>
          <span className="brand-icon">
            <Network size={22} />
          </span>
          <span>
            LearningTree<small>YOUR PERSONAL SKILL MAP</small>
          </span>
        </button>
        {page === "trees" && sidebarProject && (
          <div className="sidebar-project">
            <span className="sidebar-project-icon">
              <Network size={16} />
            </span>
            <span>
              <strong>{sidebarProject.title}</strong>
            </span>
            <ChevronDown size={14} />
            <select
              aria-label="切换学习项目"
              value={sidebarProject.id}
              onChange={(event) => setTreeId(event.target.value)}
            >
              {topProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => navigate(item.id)}
              aria-current={page === item.id ? "page" : undefined}
            >
              <item.icon size={18} />
              <span>{item.title}</span>
              {item.id === "reviews" && due > 0 && <b>{due}</b>}
            </button>
          ))}
        </nav>
        {page === "trees" && activeStage && activeStageProgress && (
          <div className="sidebar-route">
            <strong>{activeStage.title}</strong>
            <small>
              {activeStageProgress.completed} / {activeStageProgress.total}{" "}
              节点已完成
            </small>
          </div>
        )}
        <div className="sidebar-grow">
          <div className="sidebar-note">
            <Network size={18} />
            <p>
              {data.trees.length} 条学习路线 · {data.nodes.length} 个节点
            </p>
          </div>
        </div>
        <button
          className={`settings-nav ${page === "settings" ? "active" : ""}`}
          onClick={() => navigate("settings")}
        >
          <Settings2 size={18} />
          偏好与数据
        </button>
        <div className="profile">
          <span className="avatar">{data.settings.name.charAt(0)}</span>
          <div>
            <strong>{data.settings.name}</strong>
            <span>
              <i />
              {data.demo ? "示例学习空间" : "个人学习空间"} · @{user.username}
            </span>
          </div>
          <button
            className="icon-button"
            aria-label="退出登录"
            title="退出登录"
            onClick={() => void onSessionEnd()}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button menu-toggle"
              aria-label="打开导航"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span>我的空间</span>
            <ChevronRight size={13} />
            <strong>
              {page === "learn"
                ? "学习工作台"
                : (nav.find((n) => n.id === page)?.title ?? "偏好与数据")}
            </strong>
          </div>
          <div className="header-actions">
            {page === "trees" && currentTree && (
              <div className="topbar-tree-actions">
                <button
                  className="topbar-action"
                  onClick={() => navigate("settings")}
                >
                  <FileUp size={14} />
                  导入课程
                </button>
                <button
                  className="topbar-action primary"
                  onClick={() => actions.tree(undefined, currentTree.id)}
                >
                  <Plus size={14} />
                  添加子树
                </button>
              </div>
            )}
            <div className="search-wrap">
              <Search size={16} />
              <input
                aria-label="搜索知识点"
                placeholder="搜索知识点…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearch("");
                }}
              />
              {!search && <kbd className="search-shortcut">Ctrl K</kbd>}
              {search && (
                <button
                  className="icon-button"
                  aria-label="清空搜索"
                  onClick={() => setSearch("")}
                >
                  <X size={14} />
                </button>
              )}
              {search && (
                <div className="search-results">
                  {result.length ? (
                    result.map((n) => (
                      <button key={n.id} onClick={() => select(n.id)}>
                        <Leaf size={16} />
                        <span>
                          {n.title}
                          <small>
                            {data.trees.find((t) => t.id === n.treeId)?.title}
                          </small>
                        </span>
                        <ArrowRight size={14} />
                      </button>
                    ))
                  ) : (
                    <p>没有找到相关知识点</p>
                  )}
                </div>
              )}
            </div>
            <button
              className="icon-button"
              aria-label="通知"
              onClick={() => navigate("reviews")}
            >
              <Bell size={18} />
            </button>
            <span className="topbar-avatar">
              {data.settings.name.charAt(0)}
            </span>
          </div>
        </header>
        {data.demo && (
          <div className="demo-banner">
            <span>
              <Sprout size={15} />
              示例路线 · 试着完成一个挑战，观察技能树如何点亮
            </span>
            <button onClick={actions.reset}>
              开始我的学习
              <ArrowRight size={14} />
            </button>
          </div>
        )}
        <main id="main" className="main-content">
          {page === "learn" && (
            <Suspense
              fallback={
                <div className="recovery" role="status">
                  <Sprout size={38} />
                  <h1>正在打开学习工作台</h1>
                  <p>加载讲义、测验与复习内容…</p>
                </div>
              }
            >
              <LearningRoom
                key={selectedId}
                data={data}
                nodeId={selectedId}
                actions={actions}
              />
            </Suspense>
          )}
          {page === "home" && <Home data={data} actions={actions} />}
          {page === "trees" && (
            <Trees
              data={data}
              actions={actions}
              treeId={treeId}
              setTreeId={(id) => {
                setTreeId(id);
                setSelectedId(null);
              }}
              selectedId={selectedId}
            />
          )}
          {page === "reviews" && (
            <Reviews data={data} actions={actions} initialNodeId={selectedId} />
          )}
          {page === "feedback" && <Feedback data={data} actions={actions} />}
          {page === "journal" && <Journal data={data} actions={actions} />}
          {page === "settings" && (
            <Settings
              key={data.settings.name + data.settings.dailyMinutes}
              data={data}
              actions={actions}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>
            <Leaf size={13} />
            LearningTree <span className="footer-dot">·</span> 用证据记录成长
          </span>
        </footer>
      </div>
      {dialog?.kind === "tree" && (
        <TreeForm
          data={data}
          tree={dialog.tree}
          defaultParentTreeId={dialog.parentTreeId}
          onClose={() => setDialog(null)}
          onSave={async (tree) => {
            const next = {
              ...data,
              trees: dialog.tree
                ? data.trees.map((t) => (t.id === tree.id ? tree : t))
                : [...data.trees, tree],
            };
            const ok = await commit(
              next,
              dialog.tree ? "学习树已更新" : "学习树已创建",
            );
            if (ok) {
              setTreeId(tree.id);
              setSelectedId(null);
              navigate("trees");
            }
            return ok;
          }}
        />
      )}
      {dialog?.kind === "topic" && (
        <TopicForm
          data={data}
          treeId={dialog.treeId}
          topic={dialog.topic}
          parentId={dialog.parentId}
          onClose={() => setDialog(null)}
          onSave={async (topic) => {
            const next = {
              ...data,
              nodes: dialog.topic
                ? data.nodes.map((n) => (n.id === topic.id ? topic : n))
                : [...data.nodes, topic],
            };
            const ok = await commit(next, "知识点已保存");
            if (ok) {
              setTreeId(topic.treeId);
              setSelectedId(topic.id);
              navigate("trees");
            }
            return ok;
          }}
        />
      )}
      {dialog?.kind === "session" && (
        <SessionForm
          data={data}
          nodeId={dialog.nodeId}
          onClose={() => setDialog(null)}
          onSave={(next) => commit(next, "学习已记录，反馈已更新")}
        />
      )}
      {dialog?.kind === "confirm" && (
        <Modal
          title={dialog.title}
          onClose={() => setDialog(null)}
          busy={saving}
        >
          <p className="confirm-description">{dialog.description}</p>
          <div className="form-footer">
            <button
              className="button"
              disabled={saving}
              onClick={() => setDialog(null)}
            >
              取消
            </button>
            <button
              className="button primary"
              disabled={saving}
              onClick={async () => {
                if (await dialog.run()) setDialog(null);
              }}
            >
              {dialog.label}
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <CircleHelp size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setToast(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
