import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  appLocales,
  localePreferenceSchema,
  regionalFormatLocale,
  resolveSystemLocale,
  selectAppLocale,
} from "../../../apps/desktop/src/i18n/types";
import {
  applyInterfaceLocale,
  formatDateTime,
  formatNumber,
  i18n,
} from "../../../apps/desktop/src/i18n";
import { resources } from "../../../apps/desktop/src/i18n/resources";

function leaves(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  return Object.assign(
    {},
    ...Object.entries(value as Record<string, unknown>).map(([key, v]) =>
      leaves(v, prefix ? `${prefix}.${key}` : key),
    ),
  );
}

describe("interface locale policy", () => {
  it.each([
    ["zh-CN", "zh-CN"],
    ["zh_SG.UTF-8", "zh-CN"],
    ["zh-Hans-TW", "zh-CN"],
    ["zh-Hant-CN", "zh-TW"],
    ["zh-TW", "zh-TW"],
    ["zh-HK", "zh-TW"],
    ["zh-MO", "zh-TW"],
    ["en-GB", "en-US"],
    ["fr-FR", "en-US"],
    ["ja-JP", "en-US"],
    ["C", "en-US"],
    ["", "en-US"],
    ["bad tag", "en-US"],
  ])("resolves %s to %s", (source, expected) => expect(resolveSystemLocale(source)).toBe(expected));
  it("prioritizes explicit UI preference and validates persisted versions", () => {
    expect(selectAppLocale({ version: 1, localeMode: "manual", appLocale: "en-US" }, "zh-TW")).toBe(
      "en-US",
    );
    expect(selectAppLocale({ version: 1, localeMode: "system" }, "zh-TW")).toBe("zh-TW");
    expect(
      localePreferenceSchema.safeParse({ version: 2, localeMode: "manual", appLocale: "en-US" })
        .success,
    ).toBe(false);
    expect(
      localePreferenceSchema.safeParse({ version: 1, localeMode: "manual", appLocale: "fr-FR" })
        .success,
    ).toBe(false);
  });
  it("combines interface language with OS region for dates and numbers", () => {
    expect(regionalFormatLocale("en-US", "en-GB")).toBe("en-GB");
    applyInterfaceLocale("en-US", "en-IN");
    expect(formatNumber(1234567)).toBe(new Intl.NumberFormat("en-IN").format(1234567));
    applyInterfaceLocale("en-US", "en-GB");
    const date = new Date("2026-11-18T10:30:00Z");
    expect(formatDateTime(date)).toBe(
      new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "medium" }).format(date),
    );
    expect(formatDateTime("invalid")).toBe(i18n.t("common:dateUnavailable"));
  });
  it("ships every key and interpolation in all three real translations", () => {
    const english = leaves(resources["en-US"]);
    const unchanged = new Set(["AI", "v", "—"]);
    for (const locale of appLocales) {
      const translated = leaves(resources[locale]);
      expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
      for (const [key, value] of Object.entries(translated)) {
        expect(value.trim(), `${locale}:${key}`).not.toBe("");
        expect(
          [...value.matchAll(/{{\s*([^}]+)\s*}}/g)].map((m) => m[1]).sort(),
          `${locale}:${key}`,
        ).toEqual([...english[key]!.matchAll(/{{\s*([^}]+)\s*}}/g)].map((m) => m[1]).sort());
        if (key.startsWith("common.brand.")) expect(value, `${locale}:${key}`).toBe(english[key]);
        else if (locale !== "en-US" && /[a-z]{3}/i.test(value) && !unchanged.has(value.trim()))
          expect(value, `${locale}:${key}`).not.toBe(english[key]);
      }
    }
  });
  it("keeps visible JSX prose and display attributes in resources", () => {
    const root = path.resolve("apps/desktop/src");
    const failures: string[] = [];
    const english = leaves(resources["en-US"]);
    function scan(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          scan(file);
          continue;
        }
        if (!file.endsWith(".tsx")) continue;
        const source = ts.createSourceFile(
          file,
          readFileSync(file, "utf8"),
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );
        function visit(node: ts.Node) {
          if (
            ts.isCallExpression(node) &&
            node.expression.getText(source) === "t" &&
            node.arguments[0] &&
            ts.isStringLiteral(node.arguments[0])
          ) {
            const key = node.arguments[0].text.replace(":", ".");
            if (!(key in english)) failures.push(`${file}: missing resource ${key}`);
          }
          if (ts.isJsxText(node) && /[\p{L}]/u.test(node.text))
            failures.push(`${file}: ${node.text.trim()}`);
          if (
            ts.isJsxAttribute(node) &&
            ["aria-label", "title", "placeholder"].includes(node.name.getText(source)) &&
            node.initializer &&
            ts.isStringLiteral(node.initializer) &&
            /\p{L}/u.test(node.initializer.text)
          )
            failures.push(`${file}: ${node.initializer.text}`);
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
    scan(root);
    expect(failures).toEqual([]);
  });
});
