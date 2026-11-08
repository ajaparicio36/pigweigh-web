import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const source = readFileSync(new URL("../components/estimation-mode.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
const componentModule = { exports: {} };
runInNewContext(compiled, { exports: componentModule.exports, module: componentModule, require });

test("rendered mode group selects server processing and explains unavailable cloud", () => {
  const html = renderToStaticMarkup(React.createElement(componentModule.exports.EstimationMode));
  assert.match(html, /<fieldset\b[^>]*>\s*<legend>Estimation mode<\/legend>/);

  const inputs = [...html.matchAll(/<input\b[^>]*\/>/g)].map(([tag]) => tag);
  assert.equal(inputs.length, 2);
  const local = inputs.find((tag) => /\bvalue="local"/.test(tag));
  const cloud = inputs.find((tag) => /\bvalue="cloud"/.test(tag));
  assert.ok(local);
  assert.ok(cloud);
  for (const input of inputs) {
    assert.match(input, /\btype="radio"/);
    assert.match(input, /\bname="estimation-mode"/);
  }
  assert.match(local, /\bchecked=""/);
  assert.doesNotMatch(local, /\bdisabled=/);
  assert.match(cloud, /\bdisabled=""/);
  assert.doesNotMatch(cloud, /\bchecked=/);

  for (const [input, label, description] of [
    [local, "Local", /our server/i],
    [cloud, "Cloud", /unavailable.*verification/i],
  ]) {
    const describedBy = input.match(/\baria-describedby="([\w-]+)"/)?.[1];
    assert.ok(describedBy);
    const labelContents = [...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)]
      .map(([, contents]) => contents).find((contents) => contents.includes(input));
    assert.equal(labelContents?.replace(/<[^>]+>/g, "").trim(), label);
    const text = html.match(new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\bid="${describedBy}"[^>]*>([\\s\\S]*?)<\\/\\1>`))?.[2]
      .replace(/<[^>]+>/g, "").trim();
    assert.ok(text);
    assert.match(text, description);
  }
});
