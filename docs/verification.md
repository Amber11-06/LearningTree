# 验收记录

> 最新的蓝白技能树、任务指挥台与学习测验流程已经完成。当前后端已迁移为 FastAPI + PostgreSQL，并加入本地账号登录；迁移验证见文末「FastAPI / PostgreSQL 迁移验收」。下方发布复核与交互记录保留为迁移前的历史快照。最终候选与浏览器证据见 [交互重做验收](interaction-verification.md)。

## 开源发布复核（2026-10-22）

以下为当前代码的发布前复核；后文记录的是早期候选，不能作为当前版本的完整验收结果。

- `npm run build`：通过，包含 TypeScript 检查；构建提示 JavaScript 分块超过 500 kB。
- `npm test`：9 / 10 通过。`backup integrity > roundtrips a full example without losing scheduling or evidence` 失败：示例课程正文末尾换行在导入校验后被裁剪，解析结果与原始示例对象不完全相等。尚未修复。
- 本次发布准备补充 MIT 许可证及环境变量文件忽略规则，未修改应用源码。

验证日期：2026-10-22。环境：Windows、Node.js 24.13.0、npm 11.6.2、Chromium 浏览器；使用隔离浏览器空间，不写入用户既有学习数据。

## 最终候选

- 应用与配置内容 SHA-256：`cd88067ee00e8807582a2bd65b2918ec90c1f736ba744da6a1f75806d7f356ea`。
- 哈希范围：按路径排序的 `src/` 内所有文件，以及 `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`vitest.config.ts`、`index.html`、`public/favicon.svg`。依次输入 UTF-8 相对路径、NUL、原始文件字节、NUL。
- 构建产物：`dist/assets/index-BoC27PvY.js` 和 `dist/assets/index-D5TUvlHE.css`。
- 构建 JavaScript 395.71 kB，gzip 121.26 kB；CSS 41.00 kB，gzip 9.44 kB。
- 原目录没有 Git 仓库；已初始化本地 Git，未创建远端或发布站点。

## 已通过的检查

| 检查                          | 结果                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `npm run typecheck`           | 通过；最终 `npm run build` 也包含 TypeScript 检查                                      |
| `npm test`                    | 10 / 10 通过                                                                           |
| `npm run build`               | 通过，最终产物启动成功                                                                 |
| `npm audit --omit=dev --json` | 生产依赖已知漏洞为 0                                                                   |
| `npm run format:check`        | 通过                                                                                   |
| 参考克隆完整性                | 22 个成功仓库的 HEAD 与清单一致；Windows 长路径使用仓库本地 `core.longpaths=true` 检查 |
| 页面控制台                    | 所测页面无 error / warn                                                                |

核心测试覆盖：完整备份往返、循环/断链/跨树父节点/孤立记录拒绝、重复 ID、非法成绩、危险资料链接、正确率按题数加权、无测试时不推断成绩、新证据消除旧信心偏差、当地日期、FSRS 调度持久化、防止提前重复复习、未完成回忆题排除、子树删除关联清理。测试用例中的多个断言对应 10 个测试。

## 实际浏览器路径

1. 从标明的示例空间进入空白空间，创建「英语阅读练习」学习树，添加「理解文章主旨」知识点、笔记、回忆题和答案。
2. 记录 35 分钟、信心 4/5、自测 4/10。先尝试 12/10，页面正确拒绝；改正后保存成功。
3. 即时反馈显示 40%；反馈页出现该知识点的薄弱项和信心/成绩差异建议。自测趋势为真实 40% 数据。
4. 进入回忆队列，输入自己的答案，揭示参考答案，选择「基本记得」。卡片从到期队列移除，下一次安排在 10 分钟后；持久化 `reps=1`，同时保留回答。
5. 刷新页面，学习树、35 分钟记录、自测 4/10 和复习记录均保留。
6. 通过页面导出备份，核对导出内容与存储相等；通过文件输入导入相同文件，在确认替换后逐字段往返一致。
7. 上传缺失字段的坏文件，导入被拒绝，原始存储内容完全不变。
8. 检查桌面窗口和 390px 手机视图。手机视图文档宽度为 390px，无页面横向溢出；知识树画布按设计内部滚动，正文最小字号提高为 11px。
9. 启动 `npm run preview -- --port 4173 --strictPort`，直接验证最终构建产物。模拟浏览器存储配额耗尽：保存失败时弹窗内显示原因，存储内容不变；恢复存储后重试，只新增一条记录，展示成功回执并清除旧错误。加载的脚本确认为 `index-BoC27PvY.js`。

## 修复与边界

- 内部检查修复了“旧信心偏差提醒在新成绩改善后仍保留”的逻辑问题，并增加相应回归保护。
- 手机视觉检查后增大了过小的文字，并调整周活动卡布局。
- 构建产物检查发现“保存失败后重试成功仍显示旧错误”，已修复并在最终构建上复核。
- 不包含跨设备云同步、自动生成学习内容、AI 评分或公网部署；本地账号认证已加入。
- 未进行 Safari/Firefox 全矩阵、长周期真人学习效果或万条数据压力验证。
- Joplin 与 Excalidraw 的 GitHub 下载持续失败，未算入 22 个完整克隆，错误保留在清单中。

复现：`npm ci` → `npm test` → `npm run build` → `npm run dev`，固定访问 `http://127.0.0.1:5173/`。

## FastAPI / PostgreSQL 迁移验收（2026-10-31）

环境：Windows、Node.js 24.22.0、Python 3.13.15、PostgreSQL 18.4（本地 127.0.0.1:5432）。

| 检查                                      | 结果                                                        |
| ----------------------------------------- | ----------------------------------------------------------- |
| `pytest backend\tests -q`                 | 7 / 7 通过：鉴权、注册登录退出、账号隔离、revision、内置课程 |
| `npm test`                                | 41 / 41 通过（Vitest）                                      |
| `npm run typecheck`                       | 通过                                                        |
| `npm run build`                           | 通过；生产产物由 FastAPI 静态服务验证                       |
| 浏览器登录 → 工作区 → 退出                | 无头 Edge 实测通过；无 runtime error                        |
| 旧 SQLite → PostgreSQL 迁移脚本           | 9 棵树、24 个知识点、内置课程安装标记迁移通过               |
| Vite `/api` 代理与 HttpOnly 会话 Cookie   | 通过；Cookie 为 HttpOnly、SameSite=Lax                      |

迁移后的接口验证还覆盖：未登录 401、错误密码 401、重复用户名 409、跨账号工作区隔离、旧 revision 409、断链数据 422、内置课程首次安装和显式导入。

## Sealos Devbox 部署与 CI/CD 验收（2026-11-01）

环境：Sealos Devbox（Ubuntu 24.04）、Node.js 24.22.2、Python 3.12、PostgreSQL 16、Supervisor。

| 检查                                      | 结果                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------- |
| 公网地址                                  | https://yxcpadoqcxca.sealosbja.site → Devbox 8000                     |
| 单端口部署                                | FastAPI 同时提供 `/api` 与 `dist/`；未暴露 Vite 5173                 |
| 公网注册 → 工作区 → 退出                  | 201 → revision 1（9 棵树、24 个知识点）→ 200 → 401                    |
| 公网 Cookie                               | `HttpOnly`、`Secure`、`SameSite=Lax`                                 |
| GitHub Actions `CI/CD`（run 41309622561） | 测试 48s、部署 36s，全部成功                                         |
| 部署后远程版本                            | `7dd5f09`，Supervisor 中 `learningtree` 与 `postgresql` 均为 RUNNING |
| 公网健康检查                              | 200 `{"ok":true,"storage":"postgresql","auth":"cookie"}`             |

前端优化：学习工作台改为 `React.lazy` 按需加载，初始 JS 从 859.51 kB 降至 676.32 kB，LearningRoom 拆为 184.92 kB 独立块。

CI/CD 流程：push 到 `main` → GitHub Actions 启动 PostgreSQL service → pytest / Vitest / typecheck / build → SSH 到 Devbox → `git reset --hard origin/main` → 重装依赖并构建 → 更新 Supervisor 配置并重启 → `/api/health` 健康检查。

## 前端改版验收（2026-11-06）

- 采用 Monet《The Japanese Bridge 3》蓝灰色板：`#16263D`、`#334C64`、`#547095`、`#597481`、`#7F9CB1`、`#B1C4CE`。
- 登录页：76px 网格基线、统一「登录 / 创建账号」入口、本地 PostgreSQL 说明。
- 技能树：卡片节点、画布容器边界、悬停路径高亮、按编号成组的 3 列布局、减弱跨行依赖线。
- 学习页：`rehype-highlight` 语法高亮、深色代码块、笔记空状态与辅助文字对比度提升。
- 移动端：`<=760px` 切换为纵向时间轴，支持「列表 / 画布」切换；已完成节点使用 ✔ 和深色实线。
- 清理首页/日志/表单中的空泛副标题，改为直接说明。
- 验证：`npm test` 41 / 41、`npm run typecheck`、`npm run build`、pytest 7 / 7；GitHub Actions run `42166131599` 测试与部署成功；公网 `/api/health` 为 200。



