/**
 * dsh-model-names —— 只改「用户看到的」provider / 模型显示名。
 *
 * 思路：config / patch 层完全不动。插件带一份全量命名数据库
 * （data/model-names.json，来自内置 pi-ai 目录的全部 provider 与模型），
 * 载入时包装 `ctx.llm` 的目录读取方法，把**实际存在于当前环境**的
 * provider / model 的展示字段换成可读名：
 *
 *   - `listProviders()`          → provider.name
 *   - `listConfigurableProviders()` → displayName（设置页的提供方目录）
 *   - `listModels(provider)`     → model.name（模型选择器 / 设置页）
 *
 * 数据库里没有的 id 原样返回，所以：
 *   - 环境里未启用的 provider 不会被激活，也不会出现在目录里；
 *   - 路由 id、请求、凭据、会话记录都不受影响（只改展示字符串）。
 *
 * 数据库构建：scripts/build-catalog.mjs（内置 pi-ai 目录 → data/model-names.json）。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const name = "model-names";
export const inject = ["llm"];

const DATABASE_PATH = fileURLToPath(new URL("../data/model-names.json", import.meta.url));

/** 载入内置命名数据库；文件损坏时保持原样显示，不影响宿主启动。 */
function loadDatabase(report) {
  try {
    const value = JSON.parse(readFileSync(DATABASE_PATH, "utf8"));
    const providers = value?.providers;
    if (providers === null || typeof providers !== "object") throw new Error("providers must be an object");
    const modelCount = Object.values(providers).reduce((sum, entry) => sum + Object.keys(entry?.models ?? {}).length, 0);
    report(`loaded ${Object.keys(providers).length} providers / ${modelCount} model names`);
    return providers;
  } catch (error) {
    report(`database unavailable (${error instanceof Error ? error.message : String(error)}); display names stay as-is`);
    return {};
  }
}

/**
 * @param ctx - Cordis host context carrying the LLM registry.
 */
export function apply(ctx) {
  const report = (message) => {
    try {
      ctx.logger?.info?.(`[model-names] ${message}`);
    } catch (_ignored) {}
  };
  const providers = loadDatabase(report);
  const llm = ctx.llm;

  const displayNameOf = (id, fallback) => providers[id]?.displayName ?? fallback;
  const modelNameOf = (providerId, modelId, fallback) => providers[providerId]?.models?.[modelId] ?? fallback;

  const originalListProviders = llm.listProviders;
  const originalListConfigurableProviders = llm.listConfigurableProviders;
  const originalListModels = llm.listModels;

  try {
    llm.listProviders = function listProviders(...args) {
      return originalListProviders.apply(this, args).map((provider) => {
        const name = displayNameOf(provider.id, provider.name);
        return name === provider.name ? provider : { ...provider, name };
      });
    };

    llm.listConfigurableProviders = function listConfigurableProviders(...args) {
      return originalListConfigurableProviders.apply(this, args).map((entry) => {
        const displayName = displayNameOf(entry.provider, entry.displayName);
        return displayName === entry.displayName ? entry : { ...entry, displayName };
      });
    };

    llm.listModels = async function listModels(providerId, ...rest) {
      const models = await originalListModels.call(this, providerId, ...rest);
      if (!Array.isArray(models)) return models;
      return models.map((model) => {
        const name = modelNameOf(providerId, model.id, model.name);
        return name === model.name ? model : { ...model, name };
      });
    };
  } catch (error) {
    // 宿主整体不能被包装时降级：显示名保持原样，绝不影响启动。
    llm.listProviders = originalListProviders;
    llm.listConfigurableProviders = originalListConfigurableProviders;
    llm.listModels = originalListModels;
    report(`cannot wrap the LLM registry (${error instanceof Error ? error.message : String(error)}); display names stay as-is`);
    return;
  }

  ctx.effect(() => () => {
    llm.listProviders = originalListProviders;
    llm.listConfigurableProviders = originalListConfigurableProviders;
    llm.listModels = originalListModels;
  });
}
