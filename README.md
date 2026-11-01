# LearningTree

面向个人学习者的网页应用：蓝白工作台、可拖拽缩放的游戏式技能树，以及「学习内容 → 底部开始测验 → 判分反馈 → 解锁节点」的完整流程。

前端为 React + TypeScript + Vite；后端为 **FastAPI + PostgreSQL**，提供本地账号注册、登录、会话鉴权和按用户隔离的学习工作区。当前布局保留左侧导航；项目导航位于画布左上，右侧为固定任务指挥台。新版设计与参考项目见 [交互重做说明](docs/interaction-redesign.md)。

## 技术栈

| 层     | 技术                                                  |
| ------ | ----------------------------------------------------- |
| 前端   | React 19、TypeScript、Vite 8、React Flow、Zod         |
| 后端   | FastAPI、Uvicorn、SQLAlchemy 2、Pydantic              |
| 数据库 | PostgreSQL（工作区 JSONB + 账号/会话/导入记录关系表） |
| 认证   | 本地用户名/密码、Argon2id、HttpOnly 会话 Cookie       |
| 测试   | Vitest（前端领域逻辑）、pytest（FastAPI 接口）        |

## 运行

需要 Node.js 24、Python 3.12+ 和本地 PostgreSQL 14+。

```powershell
# 1. 创建本地数据库（只需一次；请替换为自己的密码）
psql -U postgres -c "CREATE ROLE learningtree LOGIN PASSWORD 'learningtree';"
psql -U postgres -c "CREATE DATABASE learningtree OWNER learningtree;"

# 2. 配置与 Python 依赖
Copy-Item .env.example .env
python -m venv .venv
.venv\Scripts\python -m pip install -r backend\requirements.txt

# 3. 前端依赖并启动
npm ci
npm run dev
```

打开 http://127.0.0.1:5173 ，首次使用点击「注册」创建本地账号。`npm run dev` 同时启动 FastAPI 和 Vite；Vite 将 `/api` 代理到 `http://127.0.0.1:8000`。学习数据保存在 PostgreSQL 中，每个账号有独立工作区。

已有 SQLite 数据可迁移，见 [迁移说明](docs/fastapi-postgres.md#从旧-sqlite-迁移)。

```powershell
npm test           # 数据一致性、反馈规则、FSRS 调度测试
npm run typecheck  # TypeScript 检查
npm run build      # 构建到 dist/
npm start          # 生产模式：FastAPI 提供 API 和 dist/
```

生产模式默认访问 http://127.0.0.1:8000 。详细的配置、认证接口和数据表说明见 [FastAPI + PostgreSQL 后端](docs/fastapi-postgres.md)。

## 部署到 Sealos Devbox

当前部署使用 **8080 单端口**：FastAPI 同时提供 `/api` 和构建后的 `dist/`，Sealos 公网调试地址映射到 8080。生产环境不需要 Vite，也不暴露 5173。

- 公网地址：https://yxcpadoqcxca.sealosbja.site
- 部署与 Supervisor 配置：[deploy/README.md](deploy/README.md)
- GitHub Actions：push 到 `main` 后自动测试、构建并 SSH 部署到 Devbox，见 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
- 远程环境变量需要设置 `LEARNINGTREE_API_HOST=0.0.0.0`、`LEARNINGTREE_API_PORT=8080`、`LEARNINGTREE_COOKIE_SECURE=true`

## 使用流程

1. 注册或登录本地账号，进入自己的学习空间。
2. 在左上项目导航选择或创建学习树；点击「推荐节点」聚焦放大，展开「推荐路线」查看学习顺序。
3. 从右侧任务指挥台「开始学习」，阅读内容、示例并保存笔记；已掌握的节点可点击「标记为已学」跳过，直接推进进度与解锁后续节点。该标记与测验成绩分别记录，刷新或课程更新后保留。
4. 从学习页底部「开始测验」，提交后先查看选择、判断、填空、排序、代码阅读等自动题的成绩与逐题解析；简答、代码改错和实战题另行对照参考答案与评分项自评。完成后一起保存记录并更新节点进展。
5. 近期正确率按最近最多 5 次有成绩的自测题数加权；达到 80% 且这些记录合计至少 5 题后，通过节点验证。标准自评单独保存，不进入自动正确率。
6. 讲义与题库由作者通过 JSON 课程包维护和导入，学习者直接阅读、作答和记录笔记。同一 ID 的课程更新保留个人进度。
7. 复习流程仍使用 FSRS；先回忆、再核对参考答案、自评并安排下一次复习。
8. 在「偏好与数据」调整每日目标、导出备份或恢复备份。
9. 点击「添加子树」创建嵌套学习树，或在项目编辑中设置「上级学习树」和「前置学习树」。子树节点更大、边框加粗，点击可进入，左上可返回上级。推荐路线先安排前置树。

## 内置课程与制作 skills

仓库内置 **8 个阶段、24 个知识点、24 篇讲义和 216 道题**：Web/HTML → CSS 与 JavaScript → 浏览器与 TypeScript → React → 工程与质量 → 交付实战。总树展示阶段依赖，进入子树后学习具体知识点。每节均有概念解释、代码例子、误区、动手任务、回忆卡与九类题目。

| 内容                     | 位置                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------ |
| 完整可导入课程包         | [courses/builtin/frontend-tech-tree.json](courses/builtin/frontend-tech-tree.json)   |
| 阶段与知识点编排         | [catalog.json](courses/builtin/frontend/catalog.json)                                |
| 讲义源码                 | [lessons/](courses/builtin/frontend/lessons/)                                        |
| 题库源码                 | [questions/](courses/builtin/frontend/questions/)                                    |
| 科技树与课程包制作 skill | [learningtree-course-author](.agents/skills/learningtree-course-author/SKILL.md)     |
| 讲义制作 skill           | [learningtree-lesson-author](.agents/skills/learningtree-lesson-author/SKILL.md)     |
| 九类题库制作 skill       | [learningtree-question-author](.agents/skills/learningtree-question-author/SKILL.md) |

144 道自动题覆盖单选、多选、判断、填空、排序和代码阅读；72 道标准自评题覆盖简答、代码改错和实战任务。代码只作为文本展示和保存，不自动执行。题目有答案、解析，自评题另有可观察评分标准。

维护流程见 [课程制作指南](docs/content-authoring.md) 和 [九类题目格式](docs/question-format.md)。修改独立 Markdown/JSON 源码后生成课程包：

```powershell
npm run courses:build
```

生成命令不修改数据库。内置包只自动安装一次，重启不覆盖用户编辑、不恢复已删除课程；更新已安装内容时，在「偏好与数据」导入生成包，或执行：

```powershell
npm run import:course -- courses/builtin/frontend-tech-tree.json
```

`courses:example` 是新内置包生成的别名；旧混合示例的生成保留为 `courses:legacy-example`。

## 数据与边界

- 学习树、讲义与题库、个人笔记、成绩、复习记录和偏好按登录账号保存到 PostgreSQL。
- 一个账号一个工作区；账号之间不共享学习数据。工作区使用 revision 防止旧页面覆盖新数据。
- 首次空工作区会自动安装内置课程；已有工作区不会被重启覆盖。
- 课程包按稳定 ID 合并内容，保留笔记与历史；完整备份恢复则在确认后整体替换工作区。
- 保存使用数据库事务和行级锁，服务器确认后才更新界面。
- JSON 文件最大 32 MB；工作区最多 100 棵学习树、1,000 个知识点、30 层树结构、20,000 条学习记录和 20,000 条复习记录。
- 删除知识点会删除其子节点和关联记录；删除树时保留子树并调整关系。修改回忆题会重置当前复习卡，历史记录保留。
- 当前为本机单机部署，无云同步；请定期导出完整 JSON 备份。

## 结构

| 文件 / 目录                 | 职责                                       |
| --------------------------- | ------------------------------------------ |
| `backend/app/main.py`       | FastAPI 应用、路由、异常和静态资源         |
| `backend/app/auth.py`       | 注册、登录、退出、当前用户                 |
| `backend/app/workspace.py`  | 工作区读写、revision、内置课程安装         |
| `backend/app/validation.py` | 数据契约、关系校验和课程合并               |
| `backend/app/models.py`     | SQLAlchemy 表模型                          |
| `backend/scripts/`          | SQLite 迁移、命令行课程导入                |
| `src/domain.ts`             | 数据契约、关系校验、反馈统计、复习调度     |
| `src/storage.ts`            | 前端 API 通信、旧数据迁移、导入与导出      |
| `src/auth.ts`               | 登录、注册、退出和会话语义                 |
| `src/AuthScreen.tsx`        | 本地账号登录/注册界面                      |
| `src/App.tsx`               | 导航、操作、持久化和错误处理               |
| `src/pages.tsx`             | 概览、学习树、复习、反馈、日志、设置       |
| `src/forms.tsx`             | 学习树、知识点、学习记录表单               |
| `src/components.tsx`        | 可访问弹窗、知识树布局和共享组件           |
| `references/`               | 搜索结果、参考清单、独立 Git 浅克隆        |

## 参考项目

参考项目克隆在当前目录的 `references/`，独立仓库不纳入本项目 Git。详见 [参考项目与取舍](docs/references.md)、[检索结果](references/search-results.json) 和 [来源/许可证/提交清单](references/manifest.json)。

```powershell
python scripts/collect-references.py          # 检索并收集
python scripts/collect-references.py --retry  # 复用元信息，补齐未完成克隆
```

脚本仅下载，不安装或运行参考仓库。它对自身 Git 子进程隔离本机 URL 重写配置，不修改用户全局配置。界面和业务实现为本项目编写，参考仓库代码未直接复制进产品。实际使用的运行时依赖包括 React、Lucide、Zod、ts-fsrs，其许可证保留在安装包中。

产品范围见 [交付约定](docs/intent.md)，验证结果见 [验收记录](docs/verification.md)。

## 开源许可

本项目采用 [MIT 许可证](LICENSE)。第三方组件和参考项目保留各自的许可证；相关声明见 [licenses/](licenses/) 和 [参考项目与取舍](docs/references.md)。
