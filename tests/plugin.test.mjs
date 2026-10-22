import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { apply, inject, name } from "../lib/index.js";

class FakeLlm {
  listProviders() {
    return [{ id: "opencode-go", name: "opencode-go" }, { id: "unlisted", name: "Unlisted" }];
  }
  listConfigurableProviders() {
    return [{ provider: "opencode-go", displayName: "opencode-go", settingsNs: "ns", settingsPath: ["a"] }];
  }
  async listModels(provider) {
    return [
      { provider, id: "longcat-2.0", name: "longcat-2.0" },
      { provider, id: "constructor", name: "constructor" },
      { provider, id: "__proto__", name: "__proto__" },
      { provider, id: "not-in-database", name: "Kept As-Is" },
    ];
  }
}

function mount() {
  const llm = new FakeLlm();
  const disposers = [];
  const ctx = { llm, logger: { info() {} }, effect: (execute) => void disposers.push(execute()) };
  apply(ctx);
  return { llm, dispose: () => disposers.splice(0).reverse().forEach((fn) => fn()) };
}

test("exports the plugin contract", () => {
  assert.equal(name, "model-names");
  assert.deepEqual(inject, ["llm"]);
});

test("overlays display names without touching ids or unknown entries", async () => {
  const { llm, dispose } = mount();
  assert.deepEqual(llm.listProviders().map((p) => [p.id, p.name]), [["opencode-go", "OpenCode Go"], ["unlisted", "Unlisted"]]);
  assert.equal(llm.listConfigurableProviders()[0].displayName, "OpenCode Go");
  const models = await llm.listModels("opencode-go");
  assert.equal(models[0].name, "LongCat 2.0");
  assert.deepEqual(models.map((m) => m.id), ["longcat-2.0", "constructor", "__proto__", "not-in-database"]);
  assert.equal(models[3].name, "Kept As-Is");
  dispose();
});

test("ids named like Object.prototype members never resolve to inherited values", async () => {
  const { llm, dispose } = mount();
  const models = await llm.listModels("opencode-go");
  assert.equal(models[1].name, "constructor");
  assert.equal(models[2].name, "__proto__");
  assert.equal((await llm.listModels("toString")).every((m) => typeof m.name === "string"), true);
  dispose();
});

test("dispose restores the prototype methods", async () => {
  const { llm, dispose } = mount();
  assert.equal(Object.hasOwn(llm, "listModels"), true);
  dispose();
  for (const key of ["listProviders", "listConfigurableProviders", "listModels"]) assert.equal(Object.hasOwn(llm, key), false);
  assert.equal(llm.listProviders()[0].name, "opencode-go");
  assert.equal((await llm.listModels("opencode-go"))[0].name, "longcat-2.0");
});

test("a wrapper layered on top by another plugin falls back to pass-through after dispose", async () => {
  const { llm, dispose } = mount();
  const inner = llm.listModels;
  llm.listModels = async (provider) => (await inner.call(llm, provider)).slice(0, 1);
  dispose();
  assert.equal((await llm.listModels("opencode-go"))[0].name, "longcat-2.0");
});

test("every database entry is a non-empty string", () => {
  const file = fileURLToPath(new URL("../data/model-names.json", import.meta.url));
  const { providers } = JSON.parse(readFileSync(file, "utf8"));
  for (const [provider, entry] of Object.entries(providers)) {
    assert.ok(typeof entry.displayName === "string" && entry.displayName.length > 0, `${provider} displayName`);
    for (const [id, label] of Object.entries(entry.models)) {
      assert.ok(typeof label === "string" && label.length > 0, `${provider}/${id}`);
    }
  }
});
