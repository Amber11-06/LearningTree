import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Database,
  Eye,
  EyeOff,
  Leaf,
  LockKeyhole,
  ShieldCheck,
  Sprout,
  UserRound,
} from "lucide-react";
import { AuthError, login, register, type AuthUser } from "./auth";

type Mode = "login" | "register";

function errorText(error: unknown) {
  if (error instanceof AuthError) return error.message;
  return error instanceof Error ? error.message : "操作失败，请重试";
}

export function AuthScreen({
  onAuthenticated,
  notice,
}: {
  onAuthenticated: (user: AuthUser) => void;
  notice?: string;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(notice ?? "");

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setPassword("");
    setConfirm("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (mode === "register") {
      if (password.length < 8) {
        setError("密码至少需要 8 个字符。");
        return;
      }
      if (password !== confirm) {
        setError("两次输入的密码不一致。");
        return;
      }
    }
    setBusy(true);
    try {
      const user =
        mode === "login"
          ? await login(username.trim(), password)
          : await register(username.trim(), password, displayName.trim());
      onAuthenticated(user);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-story" aria-label="LearningTree 本地账号">
        <div className="auth-brand">
          <span className="brand-icon">
            <Sprout size={24} />
          </span>
          <span>
            LearningTree<small>PERSONAL SKILL MAP</small>
          </span>
        </div>
        <div className="auth-story-copy">
          <span className="auth-kicker">
            <Database size={14} />
            LOCAL WORKSPACE
          </span>
          <h1>
            登录你的
            <br />
            学习空间
          </h1>
          <p>
            技能树、学习记录和复习计划保存在本机 PostgreSQL。每个账号拥有独立工作区。
          </p>
          <div className="auth-stats">
            <div>
              <strong>本地</strong>
              <span>账号存储</span>
            </div>
            <div>
              <strong>PostgreSQL</strong>
              <span>学习数据</span>
            </div>
            <div>
              <strong>Argon2</strong>
              <span>密码哈希</span>
            </div>
          </div>
        </div>
        <div className="auth-meta">
          <span>
            <ShieldCheck size={14} />
            HttpOnly 会话
          </span>
          <span>独立工作区</span>
          <span>不连接第三方</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-head">
            <span className="auth-eyebrow">LOCAL ACCOUNT</span>
            <h2>{mode === "login" ? "登录" : "创建账号"}</h2>
            <p>
              {mode === "login"
                ? "使用本地账号进入工作区。"
                : "账号只保存在这台电脑的 PostgreSQL 中。"}
            </p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="登录或创建账号">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "active" : ""}
              onClick={() => switchMode("login")}
            >
              登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "active" : ""}
              onClick={() => switchMode("register")}
            >
              创建账号
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            <label>
              <span>用户名</span>
              <div className="auth-input">
                <UserRound size={17} />
                <input
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="例如 amber"
                  minLength={3}
                  maxLength={32}
                  required
                  autoFocus
                />
              </div>
            </label>

            {mode === "register" && (
              <label>
                <span>显示名称（可选）</span>
                <div className="auth-input">
                  <Leaf size={17} />
                  <input
                    name="displayName"
                    autoComplete="nickname"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="在界面上如何称呼你"
                    maxLength={60}
                  />
                </div>
              </label>
            )}

            <label>
              <span>密码</span>
              <div className="auth-input">
                <LockKeyhole size={17} />
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "register" ? "至少 8 个字符" : "输入密码"}
                  minLength={mode === "register" ? 8 : 1}
                  maxLength={128}
                  required
                />
                <button
                  type="button"
                  className="auth-eye"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {mode === "register" && (
              <label>
                <span>确认密码</span>
                <div className="auth-input">
                  <LockKeyhole size={17} />
                  <input
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="再输入一次密码"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                </div>
              </label>
            )}

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button
              className="button primary auth-submit"
              type="submit"
              disabled={busy}
            >
              {busy
                ? "请稍候…"
                : mode === "login"
                  ? "登录"
                  : "创建并进入"}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>

          <p className="auth-footnote">
            账号与学习数据只保存在本机 PostgreSQL，不使用第三方登录。
          </p>
        </div>
      </section>
    </div>
  );
}
