import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  GitBranch,
  HelpCircle,
  ListChecks,
  Pencil,
  Save,
  ShieldCheck,
  Sparkles,
  UnlockKeyhole,
  X,
} from "lucide-react";
import type { Data, QuizQuestion, Session } from "./domain";
import { uid } from "./domain";
import { Empty } from "./components";
import { evidence, newlyUnlocked } from "./progression";
import { lessons } from "./lessons";
import {
  gradeQuiz,
  answerComplete,
  isManualQuestion,
  questionKind,
  questionLabels,
  questionPoints,
  assessmentPoints,
  answerPoints,
  manualAssessmentComplete,
  type QuizResponse,
  type ManualAssessment as Assessment,
} from "./quiz";
import { QuestionInput } from "./QuestionInput";
import { ManualAssessment } from "./ManualAssessment";
import { AutomaticFeedback } from "./AutomaticFeedback";
import { skillIcon } from "./skill-icons";
import type { Actions } from "./pages";
import "./learning-room.css";

export function LearningRoom({
  data,
  nodeId,
  actions,
}: {
  data: Data;
  nodeId: string | null;
  actions: Actions;
}) {
  const topic = data.nodes.find((n) => n.id === nodeId);
  const [mode, setMode] = useState<"read" | "quiz" | "evaluate" | "result">(
    "read",
  );
  const [note, setNote] = useState(topic?.note ?? "");
  const [noteSaved, setNoteSaved] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<QuizResponse[]>([]);
  const [assessments, setAssessments] = useState<Record<string, Assessment>>(
    {},
  );
  const [confidence, setConfidence] = useState(3);
  const [error, setError] = useState("");
  const [automaticPreview, setAutomaticPreview] = useState<Session | null>(
    null,
  );
  const [result, setResult] = useState<{
    session: Session;
    unlocked: { id: string; title: string }[];
    verified: boolean;
    score: number | null;
  } | null>(null);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [pending, setPending] = useState(false);
  const startedAt = useRef(Date.now()),
    submitting = useRef(false);
  const attemptId = useRef(uid());
  useEffect(() => setNote(topic?.note ?? ""), [topic?.note]);
  if (!topic)
    return (
      <Empty
        title="这个知识点已不存在"
        action="返回技能树"
        onAction={() => actions.navigate("trees")}
      >
        选择一个知识点，继续学习。
      </Empty>
    );
  const course = data.trees.find((t) => t.id === topic.treeId);
  const Icon = skillIcon(topic.title);
  const demoLesson = data.demo ? lessons[topic.id] : undefined;
  const content =
    (demoLesson &&
    !topic.quiz.length &&
    topic.content.startsWith("## 你要掌握的概念")
      ? demoLesson.content
      : topic.content) ||
    demoLesson?.content ||
    (topic.answer
      ? `## 核心概念\n\n${topic.question}\n\n${topic.answer}\n\n## 练习与思考\n\n用你自己的例子解释这个概念，再把疑问记在旁边。`
      : "");
  const quiz = topic.quiz.length ? topic.quiz : (demoLesson?.quiz ?? []);
  const headings = content
    .split("\n")
    .flatMap((line, i) =>
      line.startsWith("## ")
        ? [{ title: line.slice(3), id: `section-${i + 1}` }]
        : [],
    );
  const answered = questions.filter((q, i) =>
    answerComplete(q, answers[i]),
  ).length;
  const manualQuestions = questions.filter(isManualQuestion);
  const selfReady = manualQuestions.every((q) =>
    manualAssessmentComplete(q, assessments[q.id]),
  );
  const objectiveCount = quiz.filter((q) => !isManualQuestion(q)).length;
  const objectivePoints = quiz
    .filter((q) => !isManualQuestion(q))
    .reduce((total, q) => total + questionPoints(q), 0);
  const manualPoints = quiz
    .filter(isManualQuestion)
    .reduce((total, q) => total + questionPoints(q), 0);
  const automaticScore = assessmentPoints(result?.session.quizAnswers ?? []);
  const selfScore = assessmentPoints(result?.session.quizAnswers ?? [], "self");
  const nodeProgress = evidence(data, topic.id);
  async function markLearned() {
    if (pending || nodeProgress.completed) return;
    setPending(true);
    try {
      if (await actions.markLearned(topic!.id, note)) actions.select(topic!.id);
    } finally {
      setPending(false);
    }
  }
  async function startQuiz() {
    if (!quiz.length || pending) return;
    setPending(true);
    try {
      if (note !== topic!.note && !(await actions.saveNote(topic!.id, note)))
        return;
      setQuestions(structuredClone(quiz));
      attemptId.current = uid();
      setAnswers(quiz.map(() => undefined));
      setAssessments({});
      setQuestionIndex(0);
      setError("");
      setResult(null);
      setAutomaticPreview(null);
      setOnlyWrong(false);
      submitting.current = false;
      setMode("quiz");
      window.scrollTo({ top: 0 });
    } finally {
      setPending(false);
    }
  }
  async function submit() {
    if (submitting.current || !topic) return;
    if (JSON.stringify(quiz) !== JSON.stringify(questions)) {
      setError("题目内容已更新，请返回学习界面重新开始测验。");
      return;
    }
    if (mode === "quiz" && manualQuestions.length) {
      if (answered !== questions.length) {
        setError("请完成所有题目后再提交。");
        return;
      }
      try {
        const objective = questions.flatMap((question, index) =>
          isManualQuestion(question)
            ? []
            : [{ question, response: answers[index] }],
        );
        setAutomaticPreview(
          objective.length
            ? gradeQuiz(
                topic.id,
                objective.map((item) => item.question),
                objective.map((item) => item.response),
                (Date.now() - startedAt.current) / 60000,
                confidence,
              )
            : null,
        );
        setMode("evaluate");
        setError("");
        window.scrollTo({ top: 0 });
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "自动判分失败，请重试。",
        );
      }
      return;
    }
    if (!selfReady) {
      setError("请填写每道主观题的有效分数，并确认已完成自评。");
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      const session = gradeQuiz(
        topic.id,
        questions,
        answers,
        (Date.now() - startedAt.current) / 60000,
        confidence,
        new Date(),
        assessments,
      );
      session.id = attemptId.current;
      const next = {
        ...data,
        sessions: [
          ...data.sessions.filter((s) => s.id !== session.id),
          session,
        ],
      };
      if (!(await actions.recordQuiz(session))) {
        submitting.current = false;
        setError("成绩尚未保存。你的答案已保留，请重试。");
        return;
      }
      const progress = evidence(next, topic.id);
      setResult({
        session,
        unlocked: newlyUnlocked(data, next).map((n) => ({
          id: n.id,
          title: n.title,
        })),
        verified: progress.verified,
        score: progress.score,
      });
      setMode("result");
      window.scrollTo({ top: 0 });
    } catch (error) {
      submitting.current = false;
      setError(error instanceof Error ? error.message : "提交失败，请重试");
    } finally {
      setPending(false);
    }
  }
  async function saveNote() {
    if (pending || !topic) return;
    setPending(true);
    try {
      setNoteSaved(await actions.saveNote(topic.id, note));
    } finally {
      setPending(false);
    }
  }
  function backToReading() {
    if (
      (mode !== "quiz" && mode !== "evaluate") ||
      answered === 0 ||
      window.confirm("返回学习会放弃当前未提交的答案，是否继续？")
    ) {
      setMode("read");
      setError("");
      window.scrollTo({ top: 0 });
    }
  }
  const current = questions[questionIndex];
  return (
    <div className="learning-room">
      <div className="lesson-breadcrumb">
        <button onClick={() => actions.select(topic.id)}>
          <ArrowLeft size={15} />
          技能树
        </button>
        <ChevronRight size={12} />
        <span>{course?.title}</span>
        <ChevronRight size={12} />
        <strong>{topic.title}</strong>
      </div>
      <div className="lesson-heading">
        <div className="lesson-title">
          <span className="lesson-icon">
            <Icon size={25} />
          </span>
          <div>
            <span className="section-kicker">
              {mode === "read"
                ? "学习内容"
                : mode === "quiz"
                  ? "课后测验"
                  : "学习反馈"}
            </span>
            <h1>
              {mode === "read"
                ? topic.title
                : mode === "quiz"
                  ? `${topic.title} · 课后测验`
                  : mode === "evaluate"
                    ? automaticPreview
                      ? "自动成绩与主观自评"
                      : "主观练习 · 对照自评"
                    : "测验反馈"}
            </h1>
          </div>
        </div>
        <div className="learning-steps">
          <span className={mode === "read" ? "active" : "done"}>
            <i>{mode !== "read" ? <Check size={11} /> : 1}</i>学习
          </span>
          <ChevronRight size={11} />
          <span
            className={
              mode === "quiz" || mode === "evaluate"
                ? "active"
                : mode === "result"
                  ? "done"
                  : ""
            }
          >
            <i>{mode === "result" ? <Check size={11} /> : 2}</i>测验
          </span>
          <ChevronRight size={11} />
          <span className={mode === "result" ? "active" : ""}>
            <i>3</i>反馈
          </span>
        </div>
      </div>
      {mode === "read" ? (
        <div className="lesson-layout">
          <article className="lesson-article">
            <div className="lesson-article-top">
              <span>
                <BookOpen size={14} />
                学习内容
              </span>
              <span className="lesson-source">攻略讲义</span>
            </div>
            {content ? (
              <div className="markdown-content">
                <Markdown
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    h2: ({ node, children }) => (
                      <h2 id={`section-${node?.position?.start.line}`}>
                        {children}
                      </h2>
                    ),
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {content}
                </Markdown>
              </div>
            ) : (
              <Empty title="这节攻略的内容正在准备">
                讲义和测验由攻略提供者准备。你可以先学习其他节点，或阅读已关联的资料。
              </Empty>
            )}
            {topic.resource && (
              <a
                className="lesson-resource"
                href={topic.resource}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={19} />
                <span>
                  <strong>继续阅读学习资料</strong>
                  <small>在新标签页中打开你保存的资料</small>
                </span>
                <ArrowRight size={16} />
              </a>
            )}
            <div className="reading-end">
              <ShieldCheck size={22} />
              <div>
                <strong>本节测验</strong>
                <p>
                  {quiz.length
                    ? `本节有 ${quiz.length} 道题，其中 ${objectiveCount} 道自动判分（${objectivePoints} 分）、${quiz.length - objectiveCount} 道标准自评（${manualPoints} 分）。每题标明题号与分值。完成后查看解析和节点进展。`
                    : "攻略提供者尚未发布本节测验，准备好后可直接作答。"}
                </p>
              </div>
            </div>
          </article>
          <aside className="lesson-aside">
            <section className="lesson-toc">
              <h3>
                <ListChecks size={16} />
                本节导航
              </h3>
              {headings.map((h, i) => (
                <a key={h.id} href={`#${h.id}`}>
                  <small>{String(i + 1).padStart(2, "0")}</small>
                  {h.title}
                </a>
              ))}
            </section>
            <section className="lesson-notes">
              <h3>
                <Pencil size={15} />
                我的笔记
              </h3>
              <p>写一个自己的例子，或记下还没弄懂的地方。</p>
              <textarea
                aria-label="本节学习笔记"
                disabled={pending}
                maxLength={4000}
                rows={7}
                placeholder="记录概念、例子或疑问…"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setNoteSaved(false);
                }}
              />
              <div>
                <span>{note.length}/4000</span>
                <button
                  className="button small"
                  onClick={saveNote}
                  disabled={pending}
                >
                  {noteSaved ? <Check size={13} /> : <Save size={13} />}{" "}
                  {noteSaved ? "已保存" : "保存笔记"}
                </button>
              </div>
            </section>
            <div className="lesson-rule">
              <Sparkles size={17} />
              <p>
                最近 5 次计分自测的加权正确率达到 80%，且至少完成 5
                道计分题，即可点亮节点；标准自评不计入正确率。
              </p>
            </div>
          </aside>
        </div>
      ) : mode === "quiz" && current ? (
        <div className="quiz-layout">
          <section className="question-card">
            <div className="question-meta">
              <span>
                {questionLabels[questionKind(current)]} ·{" "}
                {questionPoints(current)} 分
              </span>
              <strong>
                第 {questionIndex + 1} 题 <small>/ {questions.length}</small>
              </strong>
            </div>
            <div className="quiz-progress">
              <i style={{ width: `${(answered / questions.length) * 100}%` }} />
            </div>
            <h2>{current.prompt}</h2>
            <QuestionInput
              question={current}
              value={answers[questionIndex]}
              disabled={pending}
              onChange={(value) => {
                setAnswers((previous) =>
                  previous.map((answer, index) =>
                    index === questionIndex ? value : answer,
                  ),
                );
                if (isManualQuestion(current))
                  setAssessments((previous) => ({
                    ...previous,
                    [current.id]: {
                      reviewed: false,
                      met: current.rubric!.map(() => false),
                    },
                  }));
              }}
            />
            <p className="quiz-question-hint">
              <HelpCircle size={13} />
              {isManualQuestion(current)
                ? "本题需要对照参考答案与评分标准自评。"
                : "本题提交后自动判分，并展示正确答案与解析。"}
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </section>
          <aside className="quiz-aside">
            <section className="question-navigation">
              <h3>
                答题进度
                <span>
                  {answered}/{questions.length}
                </span>
              </h3>
              <div>
                {questions.map((q, i) => (
                  <button
                    key={q.id}
                    className={`${answerComplete(q, answers[i]) ? "answered" : ""} ${questionIndex === i ? "current" : ""}`}
                    onClick={() => setQuestionIndex(i)}
                    disabled={pending}
                    aria-label={`跳到第 ${i + 1} 题，${questionPoints(q)} 分`}
                    title={`第 ${i + 1} 题 · ${questionPoints(q)} 分`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <p>
                自动题满分 {objectivePoints} 分
                {manualPoints ? `，标准自评 ${manualPoints} 分（另计）` : ""}
                。蓝色表示已作答，可随时回看并修改。
              </p>
            </section>
            <section className="quiz-confidence">
              <h3>对本节内容有多大信心？</h3>
              <p>自我感受会与实际成绩分开记录。</p>
              <div>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    aria-label={`信心 ${n} 分`}
                    disabled={pending}
                    aria-pressed={confidence === n}
                    className={confidence === n ? "selected" : ""}
                    onClick={() => setConfidence(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <span>
                1 不太确定<span>5 很有把握</span>
              </span>
            </section>
          </aside>
        </div>
      ) : mode === "evaluate" ? (
        <div className="assessment-evaluation">
          {automaticPreview && (
            <AutomaticFeedback
              session={automaticPreview}
              questionNumbers={Object.fromEntries(
                questions.map((q, index) => [q.id, index + 1]),
              )}
            />
          )}
          <ManualAssessment
            questions={manualQuestions}
            questionNumbers={Object.fromEntries(
              questions.map((q, index) => [q.id, index + 1]),
            )}
            responses={manualQuestions.map(
              (q) => answers[questions.findIndex((item) => item.id === q.id)],
            )}
            assessments={assessments}
            pending={pending}
            onChange={(id, value) =>
              setAssessments((previous) => ({ ...previous, [id]: value }))
            }
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : result ? (
        <div className="assessment-result">
          <section className="result-summary">
            <div
              className={`result-score ${result.session.total && (result.session.correct ?? 0) / result.session.total >= 0.8 ? "passed" : ""}`}
            >
              <strong>
                {result.session.total
                  ? Math.round(
                      ((result.session.correct ?? 0) / result.session.total) *
                        100,
                    )
                  : "—"}
                {result.session.total && <small>%</small>}
              </strong>
              <span>
                {result.session.total ? "自动题正确率" : "本次为标准自评"}
              </span>
            </div>
            <div>
              <span className="section-kicker">ASSESSMENT COMPLETE</span>
              <h2>
                {!result.session.total
                  ? "练习与自评已记录。"
                  : result.unlocked.length
                    ? "验证通过，新路线已解锁。"
                    : result.verified
                      ? "继续保持，理解更扎实了。"
                      : "找到了薄弱点，就是下一步的起点。"}
              </h2>
              <p>
                {automaticScore.total > 0 && (
                  <span>
                    自动题得分 {automaticScore.earned} / {automaticScore.total}{" "}
                    分
                  </span>
                )}
                {automaticScore.total > 0 && selfScore.total > 0 && " · "}
                {selfScore.total > 0 && (
                  <span>
                    标准自评得分 {selfScore.earned} / {selfScore.total}{" "}
                    分（另计）
                  </span>
                )}
              </p>
              <p>
                {result.session.total
                  ? `自动判分 ${result.session.correct} / ${result.session.total} 题`
                  : "本次不产生自动正确率"}{" "}
                · 自评{" "}
                {result.session.quizAnswers?.filter((a) => a.grading === "self")
                  .length ?? 0}{" "}
                题 · 近期正确率{" "}
                {result.score === null ? "暂无" : `${result.score}%`} · 本次记录{" "}
                {result.session.minutes} 分钟
              </p>
              <span className="result-rule">
                {result.verified
                  ? "节点已通过验证。接下来可以学习新节点，或用间隔复习巩固记忆。"
                  : "先回看待改进项。节点验证取自动题和已有自测成绩，需近期正确率 ≥ 80% 且至少 5 题；标准自评不计入正确率。"}
              </span>
            </div>
          </section>
          {result.unlocked.length > 0 && (
            <section className="new-paths">
              <h3>
                <UnlockKeyhole size={17} />
                新解锁的节点
              </h3>
              <div>
                {result.unlocked.map((n) => (
                  <button key={n.id} onClick={() => actions.learn(n.id)}>
                    <GitBranch size={17} />
                    <span>
                      {n.title}
                      <small>点击开始学习</small>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="answer-review">
            <div className="answer-review-heading">
              <h2>
                <ClipboardList size={17} />
                逐题反馈
              </h2>
              <button
                className={`button small ${onlyWrong ? "active" : ""}`}
                aria-pressed={onlyWrong}
                onClick={() => setOnlyWrong((v) => !v)}
              >
                {onlyWrong ? "查看全部" : "只看待改进"}
              </button>
            </div>
            {result.session.quizAnswers?.map((answer, i) =>
              onlyWrong && answer.isCorrect ? null : (
                <article
                  className={answer.isCorrect ? "correct" : "incorrect"}
                  key={i}
                >
                  <div>
                    <span>
                      {answer.isCorrect ? <Check size={16} /> : <X size={16} />}
                    </span>
                    <h3>
                      第 {answer.questionNumber ?? i + 1} 题 ·{" "}
                      {questionPoints(answer)} 分 · {answer.question}
                    </h3>
                  </div>
                  <p className="answer-grading-label">
                    {answer.grading === "self"
                      ? `按评分标准自评 · 得分 ${answerPoints(answer)} / ${questionPoints(answer)} 分 · 不计入自动正确率`
                      : `自动判分 · 得分 ${answer.isCorrect ? questionPoints(answer) : 0} / ${questionPoints(answer)} 分`}
                  </p>
                  {answer.code && (
                    <pre className="review-code">{answer.code}</pre>
                  )}
                  <p>
                    <span>你的答案</span>
                    {answer.selected}
                  </p>
                  {(!answer.isCorrect || answer.grading === "self") && (
                    <p>
                      <span>
                        {answer.grading === "self" ? "参考答案" : "正确答案"}
                      </span>
                      {answer.correct}
                    </p>
                  )}
                  {answer.rubricResults && (
                    <ul className="rubric-results">
                      {answer.rubricResults.map((item, index) => (
                        <li key={index} className={item.met ? "met" : "unmet"}>
                          {item.met ? <Check size={13} /> : <X size={13} />}{" "}
                          {item.criterion}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="answer-explanation">
                    <strong>解析</strong>
                    <p>
                      {answer.explanation ||
                        "对照正确答案，重新解释你的判断依据。"}
                    </p>
                  </div>
                </article>
              ),
            )}
            {onlyWrong &&
              result.session.quizAnswers?.every((a) => a.isCorrect) && (
                <div className="no-errors">
                  <CheckCircle2 size={25} />
                  <p>本次所有题目均获得满分。</p>
                </div>
              )}
          </section>
        </div>
      ) : null}
      <div className="learning-bottom-bar">
        <div className="learning-bottom-inner">
          <div className="bottom-learning-status">
            <span>
              <Icon size={18} />
            </span>
            <div>
              <strong>{topic.title}</strong>
              <small>
                {mode === "read"
                  ? quiz.length
                    ? `${quiz.length} 道题 · 保存笔记后可开始测验`
                    : "本节暂无测验"
                  : mode === "quiz"
                    ? `已完成 ${answered} / ${questions.length} 题`
                    : mode === "evaluate"
                      ? "主观题按标准自评，不混入自动正确率。"
                      : "成绩已保存，学习树已同步更新。"}
              </small>
            </div>
          </div>
          <div className="bottom-learning-actions">
            {mode === "read" ? (
              <>
                <button
                  className="button"
                  onClick={markLearned}
                  disabled={pending || nodeProgress.completed}
                >
                  <Check size={15} />
                  {nodeProgress.markedLearned
                    ? "已标记为已学"
                    : nodeProgress.completed
                      ? "已完成"
                      : "标记为已学"}
                </button>
                {quiz.length > 0 && (
                  <span className="quiz-count">{quiz.length} 道测验题</span>
                )}
                <button
                  className="button primary"
                  onClick={startQuiz}
                  disabled={pending || !quiz.length}
                  title={
                    !quiz.length ? "攻略提供者尚未发布本节测验" : undefined
                  }
                >
                  <ClipboardList size={16} />
                  {quiz.length ? "开始测验" : "测验准备中"}
                  <ArrowRight size={15} />
                </button>
              </>
            ) : mode === "quiz" ? (
              <>
                <button
                  className="text-button"
                  onClick={backToReading}
                  disabled={pending}
                >
                  返回学习
                </button>
                <button
                  className="button"
                  disabled={pending || questionIndex === 0}
                  onClick={() => setQuestionIndex((i) => i - 1)}
                >
                  上一题
                </button>
                {questionIndex === questions.length - 1 ? (
                  <button
                    className="button primary"
                    disabled={pending || answered !== questions.length}
                    onClick={submit}
                  >
                    {objectiveCount ? "提交并自动判分" : "对照标准自评"}
                    <Check size={15} />
                  </button>
                ) : (
                  <button
                    className="button primary"
                    disabled={
                      pending ||
                      !answerComplete(current, answers[questionIndex])
                    }
                    onClick={() => setQuestionIndex((i) => i + 1)}
                  >
                    下一题
                    <ArrowRight size={15} />
                  </button>
                )}
              </>
            ) : mode === "evaluate" ? (
              <>
                <button
                  className="button"
                  disabled={pending}
                  onClick={() => {
                    setMode("quiz");
                    window.scrollTo({ top: 0 });
                  }}
                >
                  返回作答
                </button>
                <button
                  className="button primary"
                  disabled={pending || !selfReady}
                  onClick={submit}
                >
                  保存测验与自评
                  <Check size={15} />
                </button>
              </>
            ) : (
              <>
                <button
                  className="button"
                  onClick={backToReading}
                  disabled={pending}
                >
                  <BookOpen size={15} />
                  返回学习
                </button>
                <button
                  className="button primary"
                  onClick={() => actions.select(topic.id)}
                >
                  查看技能树
                  <ArrowRight size={15} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
