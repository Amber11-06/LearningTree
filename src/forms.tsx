import { useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Plus,
  Save,
  ShieldCheck,
  UnlockKeyhole,
} from "lucide-react";
import {
  descendantIds,
  emptyCard,
  nodeScore,
  uid,
  type Data,
  type Topic,
  type Tree,
} from "./domain";
import { Modal } from "./components";
import { evidence, newlyUnlocked } from "./progression";

function useSaveGuard<T>(onSave: (value: T) => Promise<boolean>) {
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  async function save(value: T) {
    if (pending.current) return false;
    pending.current = true;
    setSaving(true);
    try {
      return await onSave(value);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return { saving, save };
}

export function TreeForm({
  data,
  tree,
  defaultParentTreeId,
  onSave,
  onClose,
}: {
  data: Data;
  tree?: Tree;
  defaultParentTreeId?: string;
  onSave: (tree: Tree) => Promise<boolean>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(tree?.title ?? "");
  const { saving, save } = useSaveGuard(onSave);
  const [description, setDescription] = useState(tree?.description ?? "");
  const [color, setColor] = useState<Tree["color"]>(tree?.color ?? "green");
  const [parentTreeId, setParentTreeId] = useState(
    tree?.parentTreeId ?? defaultParentTreeId ?? "",
  );
  const [prerequisiteTreeIds, setPrerequisiteTreeIds] = useState<string[]>(
    tree?.prerequisiteTreeIds ?? [],
  );
  const candidates = data.trees.filter((t) => t.id !== tree?.id);
  return (
    <Modal
      title={tree ? "编辑学习树" : "种下一棵学习树"}
      onClose={onClose}
      busy={saving}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await save({
              id: tree?.id ?? uid(),
              title: title.trim(),
              description: description.trim(),
              color,
              parentTreeId: parentTreeId || null,
              prerequisiteTreeIds,
              createdAt: tree?.createdAt ?? new Date().toISOString(),
            })
          )
            onClose();
        }}
      >
        <fieldset disabled={saving}>
          <p className="form-intro">
            填写学习树名称、说明和颜色。
          </p>
          <label>
            学习目标
            <input
              autoFocus
              required
              maxLength={60}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：学会用 Python 分析数据"
            />
          </label>
          <label>
            想做到什么
            <textarea
              maxLength={300}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：独立分析一份自己的消费数据"
            />
          </label>
          <label>
            上级学习树
            <select
              value={parentTreeId}
              onChange={(e) => setParentTreeId(e.target.value)}
            >
              <option value="">独立学习树</option>
              {candidates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <small>
              设置后，这棵树会以加大、加粗边框的子树节点出现在上级地图中。
            </small>
          </label>
          <fieldset className="tree-prerequisites">
            <legend>前置学习树</legend>
            <p>
              推荐路线会先安排这些树；它们的知识点全部验证后，再推荐当前树。
            </p>
            {candidates.length ? (
              candidates.map((t) => (
                <label key={t.id}>
                  <input
                    type="checkbox"
                    checked={prerequisiteTreeIds.includes(t.id)}
                    onChange={(e) =>
                      setPrerequisiteTreeIds((ids) =>
                        e.target.checked
                          ? [...ids, t.id]
                          : ids.filter((id) => id !== t.id),
                      )
                    }
                  />
                  {t.title}
                </label>
              ))
            ) : (
              <p>创建其他学习树后，即可设置前置依赖。</p>
            )}
          </fieldset>
          <fieldset className="color-options">
            <legend>标记颜色</legend>
            {(["green", "blue", "amber"] as const).map((c, i) => (
              <label key={c} className={c}>
                <input
                  type="radio"
                  name="color"
                  value={c}
                  checked={color === c}
                  onChange={() => setColor(c)}
                />
                {["浅蓝", "经典蓝", "灰蓝"][i]}
              </label>
            ))}
          </fieldset>
          <div className="form-footer">
            <button type="button" className="button" onClick={onClose}>
              取消
            </button>
            <button className="button primary" disabled={!title.trim()}>
              <Plus size={16} />
              {tree ? "保存学习树" : "创建学习树"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
export function TopicForm({
  data,
  treeId,
  topic,
  parentId,
  onSave,
  onClose,
}: {
  data: Data;
  treeId: string;
  topic?: Topic;
  parentId?: string;
  onSave: (topic: Topic) => Promise<boolean>;
  onClose: () => void;
}) {
  const { saving, save } = useSaveGuard(onSave);
  const [draft, setDraft] = useState({
    title: topic?.title ?? "",
    parentId: topic?.parentId ?? parentId ?? "",
    note: topic?.note ?? "",
    content: topic?.content ?? "",
    question: topic?.question ?? "",
    answer: topic?.answer ?? "",
    resource: topic?.resource ?? "",
  });
  const excluded = topic ? descendantIds(data, topic.id) : new Set<string>();
  const change = (key: keyof typeof draft, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));
  const questionChanged =
    topic &&
    (topic.question !== draft.question.trim() ||
      topic.answer !== draft.answer.trim());
  return (
    <Modal
      title={topic ? "编辑知识点" : "添加一个知识点"}
      onClose={onClose}
      wide
      busy={saving}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await save({
              ...draft,
              quiz: topic?.quiz ?? [],
              ...(topic?.learnedAt ? { learnedAt: topic.learnedAt } : {}),
              title: draft.title.trim(),
              question: draft.question.trim(),
              answer: draft.answer.trim(),
              id: topic?.id ?? uid(),
              treeId,
              parentId: draft.parentId || null,
              createdAt: topic?.createdAt ?? new Date().toISOString(),
              card: topic && !questionChanged ? topic.card : emptyCard(),
            })
          )
            onClose();
        }}
      >
        <fieldset disabled={saving}>
          <div className="form-grid">
            <label>
              知识点名称
              <input
                autoFocus
                required
                maxLength={80}
                value={draft.title}
                onChange={(e) => change("title", e.target.value)}
                placeholder="例如：闭包与作用域"
              />
            </label>
            <label>
              上级知识点
              <select
                value={draft.parentId}
                onChange={(e) => change("parentId", e.target.value)}
              >
                <option value="">根节点</option>
                {data.nodes
                  .filter((n) => n.treeId === treeId && !excluded.has(n.id))
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label>
            学习笔记
            <textarea
              rows={3}
              maxLength={4000}
              value={draft.note}
              onChange={(e) => change("note", e.target.value)}
              placeholder="留下你的理解、困惑或例子…"
            />
          </label>
          <label>
            学习资料链接
            <input
              type="url"
              maxLength={1000}
              value={draft.resource}
              onChange={(e) => change("resource", e.target.value)}
              placeholder="https://…"
            />
          </label>
          <div className="form-section">
            <h3>给未来的自己留一个问题</h3>
            <p>填写问题和参考答案后，它会进入间隔复习。</p>
          </div>
          <label>
            回忆题
            <textarea
              rows={2}
              maxLength={2000}
              value={draft.question}
              onChange={(e) => change("question", e.target.value)}
              placeholder="不看笔记，你能回答什么问题？"
            />
          </label>
          <label>
            参考答案
            <textarea
              rows={3}
              maxLength={4000}
              value={draft.answer}
              onChange={(e) => change("answer", e.target.value)}
              placeholder="用自己的话写下答案，复习时用于核对"
            />
          </label>
          {questionChanged && (
            <p className="inline-notice">
              修改题目或答案后，复习计划将从新卡开始；历史记录保留。
            </p>
          )}
          <div className="form-footer">
            <button type="button" className="button" onClick={onClose}>
              取消
            </button>
            <button className="button primary" disabled={!draft.title.trim()}>
              <Save size={16} />
              保存知识点
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
export function SessionForm({
  data,
  nodeId,
  onSave,
  onClose,
}: {
  data: Data;
  nodeId?: string;
  onSave: (data: Data) => Promise<boolean>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(nodeId ?? data.nodes[0]?.id ?? "");
  const { saving, save } = useSaveGuard(onSave);
  const [minutes, setMinutes] = useState("25");
  const [confidence, setConfidence] = useState(3);
  const [tested, setTested] = useState(false);
  const [correct, setCorrect] = useState("");
  const [total, setTotal] = useState("10");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{
    title: string;
    score: number | null;
    before: number | null;
    verified: boolean;
    unlocked: string[];
  } | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (tested && Number(correct) > Number(total)) {
      setError("正确题数不能超过总题数");
      return;
    }
    const next: Data = {
      ...data,
      sessions: [
        ...data.sessions,
        {
          id: uid(),
          nodeId: selected,
          at: new Date().toISOString(),
          minutes: Number(minutes),
          confidence,
          correct: tested ? Number(correct) : null,
          total: tested ? Number(total) : null,
          note: note.trim(),
        },
      ],
    };
    if (await save(next))
      setReceipt({
        title: data.nodes.find((n) => n.id === selected)?.title ?? "",
        score: nodeScore(next, selected),
        before: nodeScore(data, selected),
        verified:
          !evidence(data, selected).verified &&
          evidence(next, selected).verified,
        unlocked: newlyUnlocked(data, next).map((n) => n.title),
      });
  }
  if (receipt)
    return (
      <Modal
        title={receipt.verified ? "挑战完成 · 节点已点亮" : "学习记录已保存"}
        onClose={onClose}
      >
        <div className={`receipt ${receipt.verified ? "level-up" : ""}`}>
          {receipt.verified ? (
            <div className="achievement-emblem">
              <ShieldCheck size={40} />
              <i />
              <i />
              <i />
            </div>
          ) : (
            <CheckCircle2 size={44} />
          )}
          <h3>{receipt.title}</h3>
          <p>
            学习了 {minutes} 分钟。
            {tested
              ? `这次自测答对 ${correct} / ${total} 题。`
              : "这次记录了学习过程，还没有自测成绩。"}
          </p>
          {receipt.unlocked.length > 0 && (
            <div className="unlock-receipt">
              <span>
                <UnlockKeyhole size={16} />
                解锁 {receipt.unlocked.length} 个新节点
              </span>
              {receipt.unlocked.map((title) => (
                <strong key={title}>
                  {title}
                  <ArrowRight size={13} />
                </strong>
              ))}
            </div>
          )}
          {tested && (
            <div className="receipt-score">
              <span>近期自测正确率</span>
              <strong>{receipt.score}%</strong>
              {receipt.before !== null && (
                <small>之前 {receipt.before}% · 最近最多 5 次自测加权</small>
              )}
            </div>
          )}
          <p className="receipt-advice">
            {tested
              ? Number(correct) / Number(total) < 0.6
                ? "下一步：挑一道错题，不看答案重新解释思路，再用新题验证。"
                : "下一步：隔一段时间，再试着不看笔记回答回忆题。"
              : "尚未填写自测成绩；完成一次带自测的学习记录后再查看趋势。"}
          </p>
          <button className="button primary" onClick={onClose}>
            查看我的进展
            <ArrowRight size={16} />
          </button>
        </div>
      </Modal>
    );
  return (
    <Modal title="记录一次学习" onClose={onClose} busy={saving}>
      <form onSubmit={submit}>
        <fieldset disabled={saving}>
          <p className="form-intro">
            不用追求完美记录。记下学了什么，以及还有哪里不确定。
          </p>
          <label>
            这次学习了
            <select
              autoFocus
              required
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {data.trees.map((t) => (
                <optgroup key={t.id} label={t.title}>
                  {data.nodes
                    .filter((n) => n.treeId === t.id)
                    .map((n) => (
                      <option value={n.id} key={n.id}>
                        {n.title}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            专注时长（分钟）
            <input
              type="number"
              required
              min={1}
              max={720}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
          <fieldset className="confidence">
            <legend>
              现在有多大信心？<small>主观感受，与自测成绩分开记录</small>
            </legend>
            <div>
              {[1, 2, 3, 4, 5].map((n, i) => (
                <label className={confidence === n ? "active" : ""} key={n}>
                  <input
                    type="radio"
                    name="confidence"
                    checked={confidence === n}
                    onChange={() => setConfidence(n)}
                  />
                  <strong>{n}</strong>
                  <span>
                    {
                      [
                        "很模糊",
                        "有点印象",
                        "基本理解",
                        "比较熟悉",
                        "能够讲解",
                      ][i]
                    }
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="check-label">
            <input
              type="checkbox"
              checked={tested}
              onChange={(e) => setTested(e.target.checked)}
            />
            我做了自测，记录实际结果
          </label>
          {tested && (
            <div className="form-grid">
              <label>
                正确题数
                <input
                  type="number"
                  required
                  min={0}
                  max={1000}
                  value={correct}
                  onChange={(e) => setCorrect(e.target.value)}
                />
              </label>
              <label>
                总题数
                <input
                  type="number"
                  required
                  min={1}
                  max={1000}
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                />
              </label>
            </div>
          )}
          <label>
            一个收获 / 一个困惑
            <textarea
              maxLength={4000}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="今天终于理解了… / 还想弄懂…"
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="form-footer">
            <button type="button" className="button" onClick={onClose}>
              取消
            </button>
            <button className="button primary" disabled={!selected}>
              <CheckCircle2 size={16} />
              保存并获取反馈
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
