#!/usr/bin/env node
/**
 * 构建 data/model-names.json —— 插件内置的「全量命名数据库」。
 *
 * 数据来源：
 *   1) 宿主内置的 @earendil-works/pi-ai 目录（dist/providers/*.js 的 provider name
 *      + dist/providers/data/*.json 的全部模型 name）；
 *   2) DSH 自带、不在 pi-ai 目录里的路由（DeepSeek 两条、dsh-codex-connect 的
 *      openai-codex）——在 DSH_BUILTIN_PROVIDERS 里登记。
 * 命名策略：目录名已可读就原样保留；不可读（name === id / 缺名 / 明显代号）在
 * EXCEPTIONS 里登记可读写法。构建后会打印「仍是 id 风格」的条目，便于继续补例外。
 *
 * 用法：node scripts/build-catalog.mjs [--pi-ai <pi-ai 包目录>] [--check]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, "..");
const OUT = join(PLUGIN_ROOT, "data", "model-names.json");

/** provider 显示名（覆盖 pi-ai 目录的 name；没登记就用目录名）。 */
const PROVIDER_DISPLAY_NAMES = {
  "zai-coding-cn": "Z.ai Coding Plan (CN)",
  "kimi-coding": "Kimi Coding Plan",
  "xiaomi-token-plan-cn": "Xiaomi Token Plan (CN)",
  "xiaomi-token-plan-sgp": "Xiaomi Token Plan (SGP)",
  "xiaomi-token-plan-ams": "Xiaomi Token Plan (AMS)",
  "opencode-go": "OpenCode Go",
  opencode: "OpenCode Zen",
};

/** 逐模型可读名（provider -> modelId -> name）。 */
const EXCEPTIONS = {
  "kimi-coding": {
    "kimi-for-coding": "Kimi K2.8",
    "kimi-for-coding-highspeed": "Kimi K2.8 HighSpeed",
  },
  minimax: {
    "MiniMax-M2.7-highspeed": "MiniMax M2.7 Highspeed",
  },
  "minimax-cn": {
    "MiniMax-M2.7-highspeed": "MiniMax M2.7 Highspeed",
  },
  "opencode-go": {
    "hy4-preview": "Hy4 Preview",
    "longcat-2.0": "LongCat 2.0",
  },
  opencode: {
    "hy4-preview": "Hy4 Preview",
    "longcat-2.0": "LongCat 2.0",
  },
};

/**
 * 不在 pi-ai 目录里的内置路由：DSH 自带（dsh-llm-deepseek-account /
 * dsh-llm-deepseek-api-key）与 dsh-codex-connect（provider id `openai-codex`）。
 * 它们的模型名只能在这里维护。
 */
const DSH_BUILTIN_PROVIDERS = {
  "deepseek-account": {
    displayName: "DeepSeek Account",
    models: {
      "deepseek-flash": "DeepSeek V4.1 Flash",
      "deepseek-v4-pro": "DeepSeek V4 Pro",
    },
  },
  "deepseek-official": {
    displayName: "DeepSeek",
    models: {
      "deepseek-flash": "DeepSeek V4.1 Flash",
      "deepseek-v4-pro": "DeepSeek V4 Pro",
    },
  },
  "openai-codex": {
    displayName: "Codex (ChatGPT)",
    models: {
      "gpt-6-astra": "GPT-6 Astra",
      "gpt-6.1-sol": "GPT-6.1 Sol",
      "gpt-6-sol": "GPT-6 Sol",
      "gpt-6-luna": "GPT-6 Luna",
    },
  },
};

function parseArgs(argv) {
  const out = { check: false, piAi: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--check") out.check = true;
    else if (argv[i] === "--pi-ai") out.piAi = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return out;
}

function findPiAiRoot(explicit) {
  const candidates = [
    explicit,
    join(process.env.ProgramFiles ?? "C:/Program Files", "DSH NEXT", "resources", "app", "node_modules", "@earendil-works", "pi-ai"),
  ].filter(Boolean);
  for (const candidate of candidates) if (existsSync(join(candidate, "dist", "providers", "data"))) return candidate;
  throw new Error("pi-ai package not found; pass --pi-ai <package dir>");
}

function providerName(piAiRoot, provider) {
  const file = join(piAiRoot, "dist", "providers", `${provider}.js`);
  if (!existsSync(file)) return undefined;
  return /\bid:\s*"([^"]+)"[\s\S]*?\bname:\s*"([^"]+)"/u.exec(readFileSync(file, "utf8"))?.[2];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const piAiRoot = findPiAiRoot(args.piAi);
  const dataDir = join(piAiRoot, "dist", "providers", "data");
  const providers = {};
  const idLike = [];

  for (const file of readdirSync(dataDir)) {
    if (!file.endsWith(".json") || file.startsWith(".")) continue;
    const provider = file.slice(0, -".json".length);
    const raw = JSON.parse(readFileSync(join(dataDir, file), "utf8"));
    const models = {};
    for (const group of Object.values(raw)) {
      for (const [id, model] of Object.entries(group)) {
        if (id in models) continue;
        const exception = EXCEPTIONS[provider]?.[id];
        const catalogName = typeof model?.name === "string" && model.name.length > 0 ? model.name : undefined;
        if (exception) models[id] = exception;
        else if (catalogName) {
          models[id] = catalogName;
          if (catalogName === id) idLike.push(`${provider}/${id}`);
        } else {
          models[id] = id;
          idLike.push(`${provider}/${id}（目录缺 name）`);
        }
      }
    }
    providers[provider] = {
      displayName: PROVIDER_DISPLAY_NAMES[provider] ?? providerName(piAiRoot, provider) ?? provider,
      models,
    };
  }

  for (const [provider, entry] of Object.entries(DSH_BUILTIN_PROVIDERS)) {
    // 与 pi-ai 目录同名（如 openai-codex）时合并：目录模型的映射保留，
    // 内置路由登记的条目覆盖同名 id。
    providers[provider] = {
      displayName: entry.displayName ?? providers[provider]?.displayName ?? provider,
      models: { ...(providers[provider]?.models ?? {}), ...entry.models },
    };
  }

  const sorted = Object.fromEntries(Object.entries(providers).sort(([a], [b]) => a.localeCompare(b)));
  const text = `${JSON.stringify({ version: 1, source: "pi-ai builtin catalog + DSH builtin routes", providers: sorted }, null, 2)}\n`;
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : undefined;
  if (args.check) console.log(current === text ? "check: 已是最新" : "check: 需要重新构建");
  else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, text, "utf8");
    console.log(`written: ${OUT}`);
  }
  const providerCount = Object.keys(sorted).length;
  const modelCount = Object.values(sorted).reduce((sum, entry) => sum + Object.keys(entry.models).length, 0);
  console.log(`providers: ${providerCount}  models: ${modelCount}`);
  if (idLike.length > 0) {
    console.log(`仍是 id 风格（需要就在 EXCEPTIONS 登记可读名）：${idLike.length} 条`);
    for (const item of idLike) console.log(`  - ${item}`);
  }
}

main();
