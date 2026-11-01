# Sealos Devbox 部署

目标拓扑：

```text
浏览器
  └── https://yxcpadoqcxca.sealosbja.site  (Sealos 公网调试域名，映射 8000)
        └── FastAPI / Uvicorn  0.0.0.0:8000
              ├── /api/*        FastAPI
              ├── /assets/*     dist 静态资源
              └── PostgreSQL    127.0.0.1:5432
```

前端和 API 使用**同一个 8000 端口**，前端请求 `/api` 不需要跨域，也不需要单独暴露 5173。生产环境不运行 Vite，`npm run build` 生成 `dist/` 后由 FastAPI 直接托管。

## 一次性初始化

在 Devbox 上以 `devbox` 用户执行（需要 sudo）：

```bash
sudo apt-get update
sudo apt-get install -y python3-venv python3-pip postgresql postgresql-contrib supervisor curl xz-utils

# Node 24（如果镜像没有）
# 使用 NodeSource 或官方 linux-x64 二进制，确认 node -v / npm -v 可用。

git clone https://github.com/Amber11-06/LearningTree.git /home/devbox/LearningTree
cd /home/devbox/LearningTree
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
npm ci
npm run build
```

数据库：

```bash
sudo pg_ctlcluster 16 main start
sudo -u postgres psql -c "CREATE ROLE learningtree LOGIN PASSWORD '替换为强密码';"
sudo -u postgres psql -c "CREATE DATABASE learningtree OWNER learningtree;"
```

在仓库根目录创建 `.env`（不要提交）：

```dotenv
LEARNINGTREE_DATABASE_URL=postgresql+psycopg://learningtree:替换为强密码@127.0.0.1:5432/learningtree
LEARNINGTREE_API_HOST=0.0.0.0
LEARNINGTREE_API_PORT=8000
LEARNINGTREE_COOKIE_SECURE=true
LEARNINGTREE_SESSION_TTL_DAYS=7
LEARNINGTREE_ALLOWED_ORIGINS=https://yxcpadoqcxca.sealosbja.site
```

启动 supervisor：

```bash
sudo install -m 644 deploy/supervisord.conf /etc/supervisor/conf.d/learningtree.conf
sudo pg_ctlcluster 16 main stop 2>/dev/null || true
sudo supervisord -c /etc/supervisor/supervisord.conf
sudo supervisorctl status
curl -fsS http://127.0.0.1:8000/api/health
```

Devbox 重启后如果 supervisord 没有自动启动，执行：

```bash
sudo supervisord -c /etc/supervisor/supervisord.conf
sudo supervisorctl status
```

## 端口与公网地址

- Devbox 创建时设置的容器暴露端口必须是 **8000**。
- 公网调试地址由 Sealos 生成，当前为 `https://yxcpadoqcxca.sealosbja.site`。
- Uvicorn 必须绑定 `0.0.0.0:8000`，不能只绑定 `127.0.0.1`；否则 ingress 访问不到。
- HTTPS 由 Sealos ingress 终止，因此应用侧 `LEARNINGTREE_COOKIE_SECURE=true`；本机 HTTP 开发则保持 `false`。
- 公网地址变化时，更新 `.env` 的 `LEARNINGTREE_ALLOWED_ORIGINS`；同一 Host 的请求也会被动态放行。

## CI/CD

`.github/workflows/deploy.yml` 在每次 push 到 `main` 时：

1. 启动 PostgreSQL service，跑 pytest、Vitest、TypeScript 检查和前端构建。
2. 通过 SSH 登录 Devbox，`git reset --hard origin/main`、重新安装依赖、构建前端。
3. 更新 supervisor 配置并重启 FastAPI，最后请求 `/api/health` 验证。

GitHub Actions 需要以下 Secrets：

| Secret           | 值                         |
| ---------------- | -------------------------- |
| `DEVBOX_HOST`    | `bja.sealos.run`           |
| `DEVBOX_USER`    | `devbox`                   |
| `DEVBOX_PORT`    | `2233`                     |
| `DEVBOX_SSH_KEY` | Sealos 下载的 SSH 私钥内容 |

设置命令示例：

```bash
gh secret set DEVBOX_HOST --body 'bja.sealos.run'
gh secret set DEVBOX_USER --body 'devbox'
gh secret set DEVBOX_PORT --body '2233'
gh secret set DEVBOX_SSH_KEY --body-file /path/to/private-key
```

首次推送前先在服务器完成上面的初始化和 `.env`，否则 deploy job 会在重启应用时失败。
