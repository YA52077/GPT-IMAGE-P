# 项目说明文档

## 1. 项目简介

`GPT-IMAGE-P` 是一个基于 **React + Vite + TypeScript** 构建的前端图片生成与编辑应用，面向 OpenAI
`gpt-image`、OpenAI 兼容接口、fal.ai 以及可导入的自定义 HTTP 图片服务商。

项目目标不是只做一个简单的调用面板，而是提供一个适合长期使用的本地化图片工作台，重点覆盖以下场景：

- 文本生图
- 参考图上传与多图输入
- 遮罩编辑
- 批量生成
- Agent 多轮对话式生成
- 本地历史记录与收藏夹管理
- 多服务商配置切换
- 浏览器端纯本地数据保存

当前应用包含两种主要工作模式：

- **画廊模式（Gallery）**：更适合单次或批量图片生成、筛选、收藏和下载
- **Agent 模式（Agent）**：更适合多轮上下文驱动的连续创作、引用前文图片、分支重生成等复杂工作流

## 界面预览

### 桌面端主界面

![桌面端主界面](images/example_pc_1.jpg)

### 任务详情与实际参数

![任务详情与实际参数](images/example_pc_2.jpg)

### 桌面端批量选择

![桌面端批量选择](images/example_pc_3.jpg)

### 桌面端 Agent 模式

![桌面端 Agent 模式](images/example_pc_4.jpg)

### 移动端主界面

<img src="images/example_mb_1.jpg" alt="移动端主界面" width="420" />

### 移动端侧滑多选

<img src="images/example_mb_2.jpg" alt="移动端侧滑多选" width="420" />

---

## 2. 核心特性

### 2.1 图片生成与编辑

- 支持 OpenAI 兼容的 `Images API` 与 `Responses API`
- 支持 fal.ai 队列式生图
- 支持参考图输入、最多多张图片联合生成
- 支持遮罩编辑与局部重绘
- 支持批量生成与失败槽位提示
- 支持流式中间图像接收，缓解长连接超时问题
- 支持透明背景本地后处理（通过纯色背景抠图实现）

### 2.2 Agent 多轮创作

- 基于 Responses API 的对话式生成
- 支持在提示词中通过 `@` 引用历史图片或参考图
- 支持单图生成、并发批量生成、依赖图继续生成
- 支持对话分支、重生成、沿当前路径解析引用
- 可选启用 Web Search 工具

### 2.3 本地历史与管理能力

- 任务历史保存在浏览器本地
- 图片按哈希去重保存，减少重复存储
- 自动生成缩略图，提高列表浏览性能
- 支持收藏夹、批量选择、打包下载 ZIP
- 支持查看任务实际生效参数、改写提示词、原始响应内容

### 2.4 服务商与配置管理

- 内置 OpenAI 兼容接口与 fal.ai
- 支持导入自定义 HTTP 服务商描述
- 支持同步型与异步轮询型自定义服务商
- 支持独立的 Agent 文本模型 / 图片模型配置
- 支持本地开发代理 `/api-proxy/` 以绕过浏览器跨域限制

---

## 3. 技术栈

- **前端框架**：React 19
- **构建工具**：Vite 6
- **语言**：TypeScript
- **状态管理**：Zustand
- **样式方案**：Tailwind CSS
- **测试**：Vitest
- **Markdown / 数学公式**：react-markdown、remark-gfm、katex、streamdown
- **本地存储**：IndexedDB + Zustand persist
- **部署方式**：Vercel、Cloudflare Workers、Docker、静态站点

---

## 4. 目录结构说明

> 以下为理解项目的关键目录，而不是完整文件清单。

```text
src/
  components/            页面组件与弹窗组件
  components/settings/   设置页子模块
  components/favorites/  收藏夹相关组件
  components/input/      输入栏相关子组件
  hooks/                 自定义 React hooks
  lib/                   API、图片处理、存储、导出、兼容逻辑
  store.ts               全局状态与核心业务入口
  types.ts               全局类型定义
  App.tsx                应用根组件
  main.tsx               应用入口

docs/
  mock-image-api.md              本地故障模拟 API 文档
  custom-provider-llm-prompt.md  自定义服务商生成提示词
  project-overview.md            当前项目说明文档

public/
  sw.js                  Service Worker
  manifest.webmanifest   PWA 清单

scripts/
  mock-image-api.mjs     本地故障模拟服务

deploy/
  Dockerfile             Docker 部署文件
  nginx.conf             容器内静态服务与代理配置
```

---

## 5. 整体架构

## 5.1 应用入口层

入口文件是 `src/main.tsx`，负责：

- 加载全局样式
- 安装移动端视口保护逻辑
- 在生产环境注册 `sw.js`
- 在开发环境自动注销旧 Service Worker，避免缓存影响调试

根组件 `src/App.tsx` 负责：

- 解析 URL 参数并注入默认配置
- 按当前模式切换画廊界面和 Agent 界面
- 挂载全局弹窗、提示、设置面板、遮罩编辑器等

## 5.2 状态管理层

`src/store.ts` 是项目的核心业务入口，承担了大量职责，包括：

- 全局设置状态
- 当前任务列表与任务筛选
- 图片生成 / 编辑提交入口
- Agent 对话与轮次管理
- 图片缓存与缩略图缓存
- 收藏夹与批量操作
- 本地导入导出逻辑
- 与 IndexedDB 的协同持久化

这意味着：

- UI 组件主要负责展示和交互
- 业务动作多由 `store.ts` 导出的 action 发起
- API 调用、状态落库、错误提示常常在 store 中被串起来

## 5.3 数据持久化层

项目使用 **IndexedDB** 保存本地数据，封装位于 `src/lib/db.ts`。

主要对象仓库包括：

- `tasks`：任务记录
- `images`：原始图片数据
- `thumbnails`：缩略图数据
- `agentConversations`：Agent 对话记录

特点：

- 图片按哈希存储，可复用已存在图片
- 缩略图单独存储，优化瀑布流展示性能
- 任务与图片解耦，删除时会检查引用关系
- 所有历史数据默认保存在浏览器本地，不依赖后端数据库

## 5.4 API 适配层

统一调用入口位于 `src/lib/api.ts`。

它会根据当前激活的 API 配置自动分发到不同实现：

- `src/lib/openaiCompatibleImageApi.ts`：OpenAI 兼容接口 / 自定义服务商
- `src/lib/falAiImageApi.ts`：fal.ai
- `src/lib/agentApi.ts`：Agent 模式下的 Responses API 与工具编排

相关配置与兼容逻辑集中在 `src/lib/apiProfiles.ts`，主要负责：

- 默认配置生成
- 服务商类型识别
- 自定义服务商定义清洗与兼容
- Agent 文本 / 图片模型选择
- 默认代理与运行时环境变量适配

## 5.5 组件层

主要界面由以下组件构成：

- `Header.tsx`：顶部导航与模式切换
- `SearchBar.tsx`：任务搜索与筛选
- `TaskGrid.tsx`：画廊列表
- `InputBar.tsx`：底部输入、参数设置、图片上传、提交
- `AgentWorkspace.tsx`：Agent 对话工作区
- `DetailModal.tsx`：任务详情
- `SettingsModal.tsx`：设置中心
- `MaskEditorModal.tsx`：遮罩编辑器
- `FavoriteCollections*.tsx`：收藏夹视图与管理

---

## 6. 核心数据模型

类型定义主要位于 `src/types.ts`。

### 6.1 AppSettings

`AppSettings` 表示全局配置，包含：

- 当前服务商配置列表 `profiles`
- 当前激活配置 `activeProfileId`
- 自定义服务商定义 `customProviders`
- 是否清空输入、是否保留输入、是否启用通知等 UI 习惯项
- Agent 专用配置，如 `agentApiConfigMode`、`agentTextProfileId`、`agentImageProfileId`

### 6.2 TaskRecord

`TaskRecord` 是图片任务的核心实体，记录：

- 提示词
- 请求参数
- 使用的 provider / profile / model
- 输入图、遮罩图、输出图 ID
- 实际返回参数与改写提示词
- 错误信息与状态
- 收藏状态与收藏夹归属
- 是否来源于 Agent 模式

### 6.3 AgentConversation / AgentRound / AgentMessage

这组结构共同描述 Agent 工作流：

- `AgentConversation`：一段完整对话
- `AgentRound`：一次 user → assistant 的轮次
- `AgentMessage`：轮次中的消息内容

它们配合任务记录中的 `agentConversationId`、`agentRoundId` 等字段，把 Agent 文本输出和生成图片关联起来。

---

## 7. 关键业务流程

## 7.1 画廊模式生成流程

1. 用户在 `InputBar` 中输入提示词、上传参考图、选择参数
2. 提交动作进入 `store.ts` 的任务提交逻辑
3. `store.ts` 调用 `callImageApi()`
4. API 层根据 profile 分发到 OpenAI / fal / 自定义服务商
5. 返回的图片被存入 IndexedDB，并建立任务记录
6. `TaskGrid` 根据状态刷新展示
7. 用户可继续收藏、查看详情、下载、删除或二次编辑

## 7.2 Agent 模式流程

1. 用户在 Agent 输入区提交消息
2. `store.ts` 为该轮创建对话与消息记录
3. `agentApi.ts` 生成工具说明并调用 Responses API
4. 模型可在一个或多个工具轮次中调用：
   - 单图生成
   - 批量并发图像生成
   - `continue_generation` 继续下一轮依赖图生成
   - 可选 `web_search`
5. 每次工具调用生成的图片任务会回流到统一任务系统
6. `AgentWorkspace` 按轮次展示文本、工具状态和图片卡片
7. 用户可继续追问、编辑旧轮次、重生成或切换分支

## 7.3 本地图片与缩略图流程

1. 图片以 data URL 形式进入系统
2. 通过哈希去重后存入 `images`
3. 同步或异步生成缩略图并存入 `thumbnails`
4. 画廊与聊天缩略图优先使用缓存
5. 大图查看时再读取原图，兼顾性能与存储

---

## 8. 配置与运行方式

## 8.1 常用命令

```bash
npm install
npm run dev
npm run build
npm test
```

## 8.2 本地开发

默认开发方式：

```bash
npm install
npm run dev
```

开发服务器通常运行在：

- `http://127.0.0.1:5173/`

## 8.3 关键环境能力

项目支持若干运行时配置，常见的有：

- `VITE_DEFAULT_API_URL`：预置默认 API 地址，也可放配置 URL
- `VITE_SHOW_DEFAULT_CONFIG_ONLY=true`：只允许展示默认配置
- `VITE_API_PROXY_AVAILABLE=true`：启用同源代理能力
- Docker 部署时还会读取与代理相关的运行时变量

## 8.4 本地代理

为解决浏览器 CORS 问题，开发环境支持 `/api-proxy/` 同源转发。

相关逻辑主要在：

- `src/lib/devProxy.ts`
- `dev-proxy.config.example.json`

## 8.5 故障模拟 API

项目内置了一个本地模拟服务，便于复现：

- 图片 URL 无 CORS
- OpenAI 返回结构异常
- 非标准图片 JSON
- 流式数据异常
- 异步任务轮询失败

启动命令：

```bash
npm run mock:api
```

详细说明见：

- `docs/mock-image-api.md`

---

## 9. 测试与验证

项目使用 **Vitest**，测试文件分布在 `src/lib/*.test.ts`、`src/store.test.ts` 等位置。

测试重点主要覆盖：

- API 兼容层
- URL / 配置解析
- 图片与遮罩处理
- 透明背景后处理
- 参数兼容与尺寸规则
- Agent 引用解析
- 导出 ZIP 与开发代理逻辑

常用命令：

```bash
npm test
```

构建验证：

```bash
npm run build
```

---

## 10. 适合二次开发的扩展点

### 10.1 新增服务商

如果要接入新的图片服务商，优先关注：

- `src/lib/apiProfiles.ts`
- `src/lib/openaiCompatibleImageApi.ts`
- `src/types.ts`

如果是 OpenAI 兼容结构，通常只需要新增一个 profile 或导入自定义服务商配置。

如果是非标准 HTTP 结构，可以通过 `customProviders` 的 submit / poll 映射来接入，而不必重写整套 UI。

### 10.2 修改任务参数

如需增加新的图片参数字段，应检查：

- `src/types.ts` 中的 `TaskParams`
- `src/components/input/inputParamsPanel.tsx`
- `src/lib/paramCompatibility.ts`
- `src/lib/openaiCompatibleImageApi.ts`
- `src/store.ts`

### 10.3 调整 Agent 能力

如需修改 Agent 的工具调用策略、提示词说明或轮次限制，重点查看：

- `src/lib/agentApi.ts`
- `src/components/AgentWorkspace.tsx`
- `src/store.ts`
- `src/lib/agentImageReferences.ts`
- `src/lib/agentWebSearch.ts`

### 10.4 调整本地存储结构

如需修改图片、任务或会话的持久化结构，重点查看：

- `src/lib/db.ts`
- `src/store.ts`
- `src/types.ts`

注意：修改 IndexedDB schema 时需要升级数据库版本，并处理旧数据兼容。

---

## 11. 维护建议

1. **谨慎继续膨胀 `src/store.ts`**  
   当前 store 已承担过多职责，新功能建议优先拆到 `src/lib/` 或独立 hook / 组件。

2. **新增服务商时优先走配置化接入**  
   该项目已经具备较强的 HTTP 图片接口映射能力，能不写死就不要写死。

3. **保持任务系统与图片存储的解耦**  
   当前任务记录保存的是图片 ID，而不是图片本体，这一点对性能和去重都很重要。

4. **Agent 功能修改时要关注引用链与分支路径**  
   Agent 模式的复杂度主要不在聊天 UI，而在“引用哪张图、来自哪个轮次、是否仍在当前分支路径上”。

5. **改动数据结构前先看兼容函数**  
   `normalize*`、`ensure*`、`mergeImportedSettings()` 一类逻辑承担了旧数据迁移与兜底兼容职责。

---

## 12. 相关文档

- `README.md`：面向最终用户的功能介绍与部署说明
- `docs/mock-image-api.md`：本地故障模拟 API 使用说明
- `docs/custom-provider-llm-prompt.md`：用于生成自定义服务商配置的提示词文档

---

## 13. 总结

这是一个以**浏览器本地化工作流**为核心的图片生成应用，不依赖自建后端数据库，却具备较完整的：

- 多服务商接入能力
- 图片编辑与历史管理能力
- Agent 多轮创作能力
- 本地存储与导出能力
- 配置导入、代理、异常排查能力

如果把它理解成一个项目类型，可以把它看作：

> **“面向图片生成场景的前端单页工作台 + 本地持久化系统 + 可扩展 API 适配层”**

对于继续开发者来说，最重要的三个入口分别是：

- `src/store.ts`：业务主入口
- `src/lib/apiProfiles.ts`：配置与服务商适配中心
- `src/lib/agentApi.ts`：Agent 能力入口
