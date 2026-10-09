# dsh-model-names

只改「用户看到的」provider / 模型显示名。**不动 config、不动 patch 里的路由与模型定义、不动请求。**

## 它是什么

- `data/model-names.json`：**全量命名数据库**。由 `scripts/build-catalog.mjs` 从宿主内置的
  pi-ai provider / model 目录生成，并合并 DSH 自带路由；`sourceVersion` 记录上游目录版本。
  数据为模型 ID 与可读显示名的映射，随上游目录自动更新，不在文档中固定数量。
- `lib/index.js`：载入时包装 `ctx.llm` 的目录读取方法，**按当前环境里实际存在的**
  provider 与模型做映射：

  | 被包装的方法 | 改写的展示字段 | 影响面 |
  |---|---|---|
  | `listProviders()` | `provider.name` | 模型选择器里的 provider 分组标题 |
  | `listConfigurableProviders()` | `displayName` | 设置页「配置提供方」 |
  | `listModels(provider)` | `model.name` | 模型选择器 / 设置页的模型列表 |

  数据库里没有的 id 原样返回；未启用的 provider 不会被激活（它本来就不在目录里）。
  路由 id、凭据、模型集合、请求与会话记录都不受影响。

- `cordis.patch.yml`：只 `insert` 本插件自己一行，不写任何 provider / 模型配置。

## 为什么不在 patch 里改名

`llm-pi-ai` 的 `models` 是**整体替换**（收窄模型集合、丢掉未照抄的默认值），
`modelOverrides` 只对"已在 config 里声明的路由"生效且与 `models` 互斥；内置
DeepSeek 两条路由的 provider 显示名更是硬编码、config schema 里没有该字段。
显示层映射绕开了这些限制，也免去为每条路由维护一份 config。

## 边界

- `dsh-codex-connect` 的模型名、内置 DeepSeek 两条路由的 **provider** 名：
  数据库里有对应条目就会被映射（codex 目前走的是它自己 RPC 报告的目录，
  若它不走 `ctx.llm.listModels`，这里覆盖不到）。
- 只改展示字符串：搜索、选择、提交仍按 `id` 进行。

## 自动同步上游目录

`.github/workflows/update-catalog.yml` 每周一 02:13 UTC 检查 npm 上最新的
`@earendil-works/pi-ai`，也可以在 Actions 页面手动运行并指定精确版本。工作流下载
该版本的包，读取其中的 provider / model 目录；对于新增且上游缺名或名称仍等于 ID 的条目，调用
配置的 OpenAI-compatible Chat Completions API 生成候选名。已有人工命名会在上游仍缺名
或名称仍为 ID 时保留。数据库记录上游 `sourceVersion`，便于追踪来源。

工作流只创建 `automation/update-provider-model-catalog` 分支和 PR，不会直接更新主分支或
发布 Release。除添加下面的变量和 Secret 外，还需在仓库 **Settings → Actions → General**
允许 GitHub Actions 创建 Pull Request（组织策略也不能禁用此权限）。

| 名称 | 类型 | 内容 |
|---|---|---|
| `MODEL_API_URL` | Variable | 完整 Chat Completions URL，例如 `https://api.example/v1/chat/completions` |
| `MODEL_API_MODEL` | Variable | 服务商支持的模型 ID |
| `MODEL_API_KEY` | Secret | 模型 API 密钥 |

API 响应需符合 OpenAI-compatible 格式，并在 `choices[0].message.content` 中返回 JSON：
`{"items":[{"key":"provider:example","name":"Example Provider"}]}`。工作流会拒绝缺失、重复、额外或仍等于 ID 的结果；API 失败时不会创建更新 PR。
如果某次上游更新没有未命名条目，构建不需要模型 API；首次运行会处理数据库里仍等于 ID 的条目，因此应先配置好这三个值。

## 手动改字与本地重建

1. 在 `scripts/build-catalog.mjs` 维护 `PROVIDER_DISPLAY_NAMES` / `EXCEPTIONS`，避免直接编辑自动生成的数据文件。
2. `node scripts/build-catalog.mjs --pi-ai <pi-ai 包目录>` 重建本地数据库；`--enrich` 会调用上面的 API 环境变量为未命名条目生成候选名，`--check` 比较并在过期时以非零状态退出。
3. 审核生成结果，再提交；插件数据库变更后重启 DSH NEXT（Host 插件代码/数据变更不热加载）。

## 安装

从 npm 安装：

```sh
dsh plugin --profile <profile> add dsh-model-names
```

版本标签触发的发布 CI 会校验并构建安装包，同时发布到 GitHub Release 和 npm。
npm 发布通过 Trusted Publisher 使用 GitHub Actions OIDC，不保存长期发布 Token。

```
dsh plugin add <插件目录绝对路径>
```
