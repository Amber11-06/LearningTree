# FastAPI + PostgreSQL 后端

项目后端已从 Node.js 原生 HTTP + SQLite 迁移为 FastAPI + PostgreSQL。前端仍通过同一个 `/api` 契约访问数据，Vite 开发代理把 `/api` 转发到 `127.0.0.1:8000`。

## 技术栈

| 层         | 技术                                              |
| ---------- | ------------------------------------------------- |
| Web 框架   | FastAPI                                           |
| ASGI 服务  | Uvicorn                                           |
| ORM        | SQLAlchemy 2.x（同步 Session）                    |
| 驱动       | psycopg 3                                         |
| 数据库     | PostgreSQL 14+（工作区关联的独立业务表）            |
| 认证       | 本地用户名/密码、Argon2id、HttpOnly 会话 Cookie   |
| 数据校验   | Pydantic + 自定义关系校验                         |

后端不依赖 Node.js；`npm run dev` 只是统一启动 Python API 和 Vite 的便捷脚本。

## 目录

```text
backend/
  app/
    main.py          FastAPI 应用、中间件、路由
    config.py        LEARNINGTREE_* 配置
    db.py            SQLAlchemy engine / Session
    models.py        users、login_sessions、workspaces 等表
    auth.py          注册、登录、退出、当前用户
    workspace.py     工作区读写、revision、内置课程安装
    relational.py    工作区与业务表转换、旧 JSONB 数据迁移
    validation.py    工作区与课程包校验、课程合并
    courses.py       内置课程加载
    security.py      Argon2 密码哈希、会话令牌
    schemas.py       请求模型
  scripts/
    migrate_sqlite.py  旧 SQLite -> PostgreSQL
    import_course.py   命令行课程导入
  tests/             pytest 接口测试
```

## 启动

```powershell
# 1. PostgreSQL 中创建角色和数据库（只需一次）
psql -U postgres -c "CREATE ROLE learningtree LOGIN PASSWORD 'learningtree';"
psql -U postgres -c "CREATE DATABASE learningtree OWNER learningtree;"

# 2. 配置
Copy-Item .env.example .env

# 3. Python 环境
python -m venv .venv
.venv\Scripts\python -m pip install -r backend\requirements.txt

# 4. 前端依赖并启动
npm ci
npm run dev
```

访问 `http://127.0.0.1:5173`，首次使用点击「注册」创建本地账号。数据库表在 FastAPI 启动时自动创建。

生产运行：

```powershell
npm run build
npm start
```

`npm start` 等价于用 Uvicorn 启动 `backend.app.main:app`，并由 FastAPI 提供 `dist/` 静态文件和 API。默认访问 `http://127.0.0.1:8000`。

## 配置

| 变量                             | 默认值                                                         | 说明                                      |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `LEARNINGTREE_DATABASE_URL`      | `postgresql+psycopg://learningtree:learningtree@127.0.0.1:5432/learningtree` | SQLAlchemy 连接串                         |
| `LEARNINGTREE_API_PORT`          | `8000`                                                         | FastAPI / Vite 代理端口                   |
| `LEARNINGTREE_SESSION_TTL_DAYS`  | `7`                                                            | 登录会话有效天数                          |
| `LEARNINGTREE_COOKIE_SECURE`     | `false`                                                        | HTTPS 部署时设为 `true`                   |
| `LEARNINGTREE_ALLOWED_ORIGINS`   | 本机 5173 / 8000 的 127.0.0.1 与 localhost                      | 允许携带 Cookie 的浏览器 Origin           |
| `LEARNINGTREE_PYTHON`            | 自动探测 `.venv/Scripts/python.exe` 或 `python`                  | `npm run dev` 使用的 Python 路径          |

`.env` 已加入 `.gitignore`；不要把真实密码提交到仓库。

## 认证接口

认证使用数据库中的不透明随机会话令牌。浏览器只拿到原始令牌（HttpOnly Cookie `learningtree_session`），数据库只保存 SHA-256 摘要；退出登录会删除对应会话。

| 方法与路径               | 请求体                                      | 说明                         |
| ------------------------ | ------------------------------------------- | ---------------------------- |
| `POST /api/auth/register` | `{username, password, display_name?}`      | 创建账号、默认工作区并登录   |
| `POST /api/auth/login`    | `{username, password}`                     | 登录并轮换会话 Cookie        |
| `POST /api/auth/logout`   | 无                                          | 删除当前会话并清除 Cookie    |
| `GET /api/auth/me`        | 无                                          | 返回当前用户；未登录为 401   |

- 用户名 3–32 个字符，允许字母、数字、汉字、点、下划线和短横线；大小写不敏感。
- 密码至少 8 个字符，使用 Argon2id 哈希。
- Cookie 为 `HttpOnly`、`SameSite=Lax`、`Path=/`；本地 HTTP 下 `Secure=false`。
- 所有写请求校验 `Origin`，只接受本机前端来源。
- 每个用户有独立工作区，学习数据不会跨账号共享。

## 工作区 API

| 方法与路径                         | 说明                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| `GET /api/health`                  | `{ok, storage:"postgresql", auth:"cookie"}`               |
| `GET /api/workspace`               | 当前用户的工作区、revision、更新时间；新账号 data 为 null |
| `PUT /api/workspace`               | `{expectedRevision, data}`，保存或恢复整个工作区          |
| `POST /api/course-packages/import` | `{expectedRevision, package}`，合并课程并保留个人记录     |
| `GET /api/course-packages/example` | 下载内置完整课程包                                        |

写入使用行级 `SELECT ... FOR UPDATE` 和 revision 乐观并发控制：

- 版本不一致返回 `409` / `revision_conflict`。
- 结构或关系校验失败返回 `422` / `invalid_data`。
- 未登录返回 `401` / `unauthorized`。
- 请求体上限 32 MB；所有 API 仅监听本机。

科技树、知识节点、笔记、学习记录和复习记录分别保存在独立业务表中，前端仍通过原有工作区 JSON 契约读取和保存。`workspaces.data` 仅保存 `version`、`demo` 和 `settings` 等工作区元信息；新账号尚未初始化时为 `null`。

保存时锁定工作区，在同一事务内替换该工作区的业务记录并更新 revision，任何一步失败都回滚。读取时持有工作区共享锁，避免多张表读到不同版本的数据。每条业务记录都归属工作区，使用包含 `workspace_id` 的复合主键和外键，因此不同账号可以安装相同 ID 的课程，且不能互相引用记录。`position` 列保留树、节点、前置依赖及历史记录的顺序。

## 数据表

| 表                   | 内容                                                   |
| -------------------- | ------------------------------------------------------ |
| `users`              | 本地账号、显示名、Argon2 密码哈希、创建时间            |
| `login_sessions`     | 会话令牌摘要、用户、创建时间、过期时间                 |
| `workspaces`         | 每个用户一行；元信息 `data JSONB`、`revision`、`updated_at` |
| `learning_trees`     | 科技树标题、描述、颜色、上级树、创建时间和顺序 |
| `tree_prerequisites` | 同一工作区内的科技树前置依赖关系和顺序 |
| `knowledge_nodes`    | 所属树、父节点、标题、讲义、测验、回忆题、资源、FSRS 卡片、已学时间 |
| `node_notes`         | 每个知识节点一条个人笔记，按工作区和节点关联 |
| `study_sessions`     | 学习时间、时长、掌握程度、成绩、备注和逐题作答 |
| `review_events`      | 复习时间、评分、下次到期时间和回忆内容 |
| `installed_builtins` | 每个工作区内置课程的安装标记、release、安装时间        |
| `course_imports`     | 课程导入审计：名称、revision、树/知识点数量、导入时间  |

共 11 张业务表。节点中的 `quiz`、`card` 以及学习记录中的 `quiz_answers` 保留 JSONB，用于保存不同题型和 FSRS 的嵌套结构；业务记录本身可以按工作区、树、节点及时间直接查询。删除节点会级联删除其笔记与学习、复习记录；删除工作区会删除其全部业务记录。

## 从旧 PostgreSQL JSONB 工作区升级

后端启动时自动创建缺失的业务表，并将旧 `workspaces.data` 中的 `trees`、`nodes`、`sessions`、`reviews` 拆入对应表。原有用户、登录会话、课程安装标记、导入历史、工作区 revision 和更新时间保持不变。空工作区和未初始化工作区分别保留原有状态。

建表与数据迁移在一个事务内完成，并使用 PostgreSQL 事务级 advisory lock 协调多个启动进程。迁移完成后移除元信息中的集合字段，重复启动不会重复导入。校验或写入失败会回滚并阻止启动，旧数据仍保留，可修正后重试。

升级已有部署时先备份 PostgreSQL，再停止旧后端并启动新版本；旧版后端使用整份 JSONB 读写，不应与新版同时运行或直接降级。需要单独执行迁移时，可运行：

```powershell
.venv\Scripts\python.exe -c "from backend.app.db import init_db; init_db()"
```

## 从旧 SQLite 迁移

旧版单用户 SQLite 数据库仍在 `data/learningtree.sqlite`。先注册本地账号，再执行：

```powershell
.venv\Scripts\python.exe -m backend.scripts.migrate_sqlite `
  --sqlite data\learningtree.sqlite `
  --username amber
```

如果账号尚未创建，可加 `--password` 一并创建：

```powershell
.venv\Scripts\python.exe -m backend.scripts.migrate_sqlite `
  --sqlite data\learningtree.sqlite `
  --username amber --password "至少8位密码"
```

迁移会重建树、知识点、笔记、FSRS 卡片、学习记录、复习记录、内置课程安装标记和课程导入记录。目标账号已有数据时默认拒绝覆盖；确认覆盖加 `--replace`。原始 SQLite 文件不会被修改。

## 测试

测试使用独立的 `learningtree_test` 数据库，不会写入开发账号的数据。首次运行前创建一次，并安装测试依赖：

```powershell
psql -U postgres -c "CREATE DATABASE learningtree_test OWNER learningtree;"
.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
```

```powershell
.venv\Scripts\python.exe -m pytest backend\tests -q
npm run typecheck
npm test
```

可通过 `LEARNINGTREE_TEST_DATABASE_URL` 覆盖测试连接串。运行测试会在开始时清空测试库中的表，请勿指向开发库。
