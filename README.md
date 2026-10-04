# dsh-model-names

只改「用户看到的」provider / 模型显示名。**不动 config、不动 patch 里的路由与模型定义、不动请求。**

## 它是什么

- `data/model-names.json`：**全量命名数据库**。构建自宿主内置的 pi-ai 目录
  （`scripts/build-catalog.mjs`：41 个 provider / 约 1500 个模型的 `id → 可读名`，
  外加 provider 显示名）。
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

## 改字与重建

1. 改 `scripts/build-catalog.mjs` 里的 `PROVIDER_DISPLAY_NAMES` / `EXCEPTIONS`
   （新增可读名），或直接改 `data/model-names.json`。
2. `node scripts/build-catalog.mjs`（`--check` 只比较不写）。
3. 重启 DSH NEXT（Host 插件代码/数据变更不热加载）。

## 安装

```
dsh plugin add <插件目录绝对路径>
```
