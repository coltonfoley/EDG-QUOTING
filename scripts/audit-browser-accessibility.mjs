import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const port = Number(process.env.RAINMAKER_ACCESSIBILITY_PORT || 4175);
const origin = `http://127.0.0.1:${port}`;
const showProgress = process.env.RAINMAKER_AUDIT_PROGRESS === "1";
const fixtureServer = spawn(process.execPath, ["scripts/serve-browser-fixtures.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, RAINMAKER_FIXTURE_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForFixtureServer() {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out starting the browser fixture server")), 10_000);
    const onData = (chunk) => {
      if (!String(chunk).includes("Rainmaker browser fixtures:")) return;
      clearTimeout(timeout);
      fixtureServer.stdout.off("data", onData);
      resolve();
    };
    fixtureServer.stdout.on("data", onData);
    fixtureServer.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Browser fixture server exited early with code ${code}`));
    });
    fixtureServer.stderr.on("data", (chunk) => process.stderr.write(chunk));
  });
}

const viewports = [
  { width: 390, height: 844 },
  { width: 512, height: 450, deviceScaleFactor: 2, zoomEquivalent: true, label: "1024x900 at 200% zoom equivalent" },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
];
const cases = [
  ...[
    ["profit-basic", "$500.00", "33.3%"],
    ["profit-discount", "$350.00", "25.9%"],
    ["profit-loss", "-$250.00", "-33.3%"],
    ["profit-free", "-$1,000.00", "N/A (no sales revenue)"],
  ].map(([scenario, expectedProfit, expectedMargin]) => ({
    name: scenario, scenario, path: "/quotes/9301/edit",
    readySelector: '[data-testid="text-gross-margin"]', expectedProfit, expectedMargin, widths: [390, 1024],
  })),
  { name: "dark profit loss", scenario: "profit-loss", path: "/quotes/9301/edit", readySelector: '[data-testid="text-gross-margin"]', expectedProfit: "-$250.00", expectedMargin: "-33.3%", theme: "dark", expectedTheme: "dark", widths: [390, 1024] },
  { name: "dashboard profit after discount", scenario: "profit-discount", path: "/", readySelector: "h1", expectedText: "25.9%", widths: [390, 1024] },
  { name: "admin delivery health", scenario: "admin", path: "/admin", readySelector: "h1" },
  { name: "admin delivery error", scenario: "admin-data-error", path: "/admin", readySelector: "h1" },
  { name: "lead inbox", scenario: "user", path: "/leads", readySelector: "h1" },
  { name: "quote editor", scenario: "admin", path: "/quotes/9301/edit", readySelector: "h1" },
  { name: "public approval", scenario: "public", path: "/sign/test-token", readySelector: "h1" },
  { name: "public incomplete package", scenario: "public", path: "/sign/incomplete-token", readySelector: "h1", expectedText: "not ready for approval", widths: [390, 1024] },
  { name: "public invalid link", scenario: "public", path: "/sign/invalid-token", readySelector: "body", expectedText: "Invalid Signing Link", minimumFocusStops: 2, widths: [390, 1024] },
  { name: "public expired link", scenario: "public", path: "/sign/expired-token", readySelector: "body", expectedText: "This signing link has expired", minimumFocusStops: 2, widths: [390, 1024] },
  { name: "public archived version", scenario: "public", path: "/sign/archived-token", readySelector: "body", expectedText: "quote version is archived", minimumFocusStops: 2, widths: [390, 1024] },
  { name: "public already approved", scenario: "signed", path: "/sign/test-token", readySelector: "[data-testid=\"button-download-signed-pdf\"]", expectedText: "Proposal Approved", widths: [390, 1024] },
  { name: "dark dashboard", scenario: "admin", path: "/", readySelector: "h1", theme: "dark", expectedTheme: "dark", widths: [390, 1024] },
  { name: "dark leads", scenario: "admin", path: "/leads", readySelector: "h1", theme: "dark", expectedTheme: "dark", widths: [390, 1024] },
  { name: "dark clients", scenario: "admin", path: "/accounts", readySelector: "h1", theme: "dark", expectedTheme: "dark", widths: [390, 1024] },
  { name: "dark quotes", scenario: "admin", path: "/quotes", readySelector: "h1", theme: "dark", expectedTheme: "dark", widths: [390, 1024] },
  { name: "dark pipeline", scenario: "admin", path: "/pipeline", readySelector: "h1", theme: "dark", expectedTheme: "dark", widths: [390, 1024] },
  { name: "dark products", scenario: "admin", path: "/products", readySelector: "h1", theme: "dark", expectedTheme: "dark", widths: [390, 1024] },
  { name: "dark product import", scenario: "admin", path: "/products", readySelector: "h1", setupTestId: "product-section-import", expectedText: "Product Import", theme: "dark", expectedTheme: "dark", widths: [1024] },
  { name: "dark admin", scenario: "admin", path: "/admin", readySelector: "h1", theme: "dark", expectedTheme: "dark", widths: [390, 1024] },
  { name: "dark quote editor", scenario: "admin", path: "/quotes/9301/edit", readySelector: "h1", theme: "dark", expectedTheme: "dark", widths: [390, 1024] },
  { name: "public approval ignores stored dark theme", scenario: "public", path: "/sign/test-token", readySelector: "h1", theme: "dark", expectedTheme: "light", widths: [390, 1024] },
  { name: "forced colors dashboard", scenario: "admin", path: "/", readySelector: "h1", forcedColors: true, widths: [1024] },
  { name: "forced colors clients", scenario: "admin", path: "/accounts", readySelector: "h1", forcedColors: true, widths: [1024] },
  { name: "forced colors pipeline", scenario: "admin", path: "/pipeline", readySelector: "h1", forcedColors: true, widths: [1024] },
  { name: "forced colors products", scenario: "admin", path: "/products", readySelector: "h1", forcedColors: true, widths: [1024] },
  { name: "forced colors quote editor", scenario: "admin", path: "/quotes/9301/edit", readySelector: "h1", forcedColors: true, widths: [1024] },
  { name: "forced colors public approval", scenario: "public", path: "/sign/test-token", readySelector: "h1", forcedColors: true, widths: [1024] },
  { name: "zoom-equivalent dashboard", scenario: "admin", path: "/", readySelector: "h1", widths: [512] },
  { name: "zoom-equivalent clients", scenario: "admin", path: "/accounts", readySelector: "h1", widths: [512] },
  { name: "zoom-equivalent pipeline", scenario: "admin", path: "/pipeline", readySelector: "h1", widths: [512] },
  { name: "zoom-equivalent products", scenario: "admin", path: "/products", readySelector: "h1", widths: [512] },
];
const dialogCases = [
  {
    name: "add lead",
    scenario: "admin",
    path: "/leads",
    actions: ['[data-testid="button-new-lead"]'],
    surface: '[role="dialog"]',
  },
  {
    name: "create client",
    scenario: "admin",
    path: "/accounts",
    actions: ['[data-testid="button-new-client"]'],
    surface: '[role="dialog"]',
  },
  {
    name: "delete client confirmation",
    scenario: "admin",
    path: "/accounts",
    actions: ['[data-testid="button-delete-client-9101"]'],
    surface: '[role="alertdialog"]',
  },
  {
    name: "create product",
    scenario: "admin",
    path: "/products",
    actions: ['[data-testid="button-new-product"]'],
    surface: '[role="dialog"]',
  },
  {
    name: "delete quote confirmation",
    scenario: "admin",
    path: "/quotes",
    actions: ['[data-testid="button-delete-quote-9301"]'],
    surface: '[role="alertdialog"]',
  },
  {
    name: "edit workspace access",
    scenario: "admin",
    path: "/admin",
    actions: ['[aria-label="Edit fixture-admin"]'],
    surface: '[role="dialog"]',
  },
  {
    name: "create client from quote",
    scenario: "user",
    path: "/quotes/new",
    actions: ['[data-testid="client-combobox-trigger"]', '[data-testid="create-client-option"]'],
    surface: '[data-testid="create-client-dialog"]',
  },
  {
    name: "customer package builder",
    scenario: "admin",
    path: "/quotes/9301/edit",
    actions: ['[data-testid="button-build-customer-package"]'],
    surface: '[role="dialog"]',
  },
];

async function focusByTab(page, testId, maximumTabs = 100) {
  for (let index = 0; index <= maximumTabs; index += 1) {
    const activeTestId = await page.evaluate(() => document.activeElement?.getAttribute?.("data-testid") || null);
    if (activeTestId === testId) return index;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Keyboard traversal did not reach ${testId}`);
}

async function accessibilitySequence(page) {
  const cdp = await page.createCDPSession();
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  await cdp.detach();
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const ordered = [];
  const visit = (node) => {
    if (!node) return;
    ordered.push(node);
    for (const childId of node.childIds || []) visit(byId.get(childId));
  };
  visit(nodes.find((node) => !node.parentId) || nodes[0]);
  return ordered
    .filter((node) => !node.ignored)
    .map((node) => ({
      role: String(node.role?.value || ""),
      name: String(node.name?.value || "").trim().replace(/\s+/g, " "),
    }))
    .filter((node) => node.role);
}

let browser;
let auditStage = "fixture startup";
try {
  await waitForFixtureServer();
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results = [];
  if (process.env.RAINMAKER_SKIP_PAGE_CASES !== "1") {
    for (const viewport of viewports) {
      for (const testCase of cases) {
      if (testCase.widths && !testCase.widths.includes(viewport.width)) continue;
      auditStage = `${testCase.name} at ${viewport.width}x${viewport.height}`;
      const page = await browser.newPage();
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor || 1,
      });
      if (testCase.forcedColors) {
        const cdp = await page.createCDPSession();
        await cdp.send("Emulation.setEmulatedMedia", {
          media: "screen",
          features: [{ name: "forced-colors", value: "active" }],
        });
      }
      await page.evaluateOnNewDocument((theme) => {
        if (theme) localStorage.setItem("rainmaker-theme", theme);
        else localStorage.removeItem("rainmaker-theme");
      }, testCase.theme || null);
      const next = encodeURIComponent(testCase.path);
      await page.goto(`${origin}/__fixture/${testCase.scenario}?next=${next}`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      try {
        await page.waitForSelector(testCase.readySelector, { timeout: 10_000 });
      } catch (error) {
        throw new Error(`Browser audit case \"${testCase.name}\" did not reach ${testCase.readySelector}`, { cause: error });
      }
      if (testCase.expectedProfit) {
        const profit = await page.$eval('[data-testid="text-gross-profit"]', node => node.textContent.trim());
        const margin = await page.$eval('[data-testid="text-gross-margin"]', node => node.textContent.trim());
        if (profit !== testCase.expectedProfit || margin !== testCase.expectedMargin) {
          throw new Error(`${auditStage}: expected ${testCase.expectedProfit} / ${testCase.expectedMargin}, got ${profit} / ${margin}`);
        }
      }
      if (testCase.setupTestId) {
        if (showProgress) process.stderr.write(`Opening ${auditStage}\n`);
        await page.evaluate((testId) => {
          const control = document.querySelector(`[data-testid="${testId}"]`);
          if (!(control instanceof HTMLElement)) throw new Error(`Missing setup control ${testId}`);
          control.click();
        }, testCase.setupTestId);
      }
      if (testCase.expectedText) {
        await page.waitForFunction(
          (expectedText) => document.body.innerText.toLowerCase().includes(String(expectedText).toLowerCase()),
          { timeout: 10_000 },
          testCase.expectedText,
        );
      }
      if (showProgress) process.stderr.write(`Scanning ${auditStage}\n`);
      await page.addScriptTag({ content: axeSource });

      const audit = await page.evaluate(async (expectedTheme) => {
        const axeResults = await Promise.race([
          globalThis.axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
            },
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("axe scan timed out")), 15_000)),
        ]);
        const severeViolations = axeResults.violations
          .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
          .map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            nodes: violation.nodes.slice(0, 5).map((node) => ({
              target: node.target,
              summary: node.failureSummary,
            })),
          }));
        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          h1Count: document.querySelectorAll("h1").length,
          severeViolations,
          renderedTheme: document.documentElement.classList.contains("dark")
            ? "dark"
            : document.documentElement.classList.contains("light")
              ? "light"
              : "unresolved",
          themeMatches: expectedTheme
            ? document.documentElement.classList.contains(expectedTheme)
            : true,
          forcedColorsActive: matchMedia("(forced-colors: active)").matches,
          devicePixelRatio: window.devicePixelRatio,
        };
      }, testCase.expectedTheme || null);

      await page.evaluate(() => document.activeElement?.blur());
      const focusStops = [];
      for (let index = 0; index < 20; index += 1) {
        await page.keyboard.press("Tab");
        focusStops.push(await page.evaluate(() => {
          const element = document.activeElement;
          const label = element?.labels?.[0]?.textContent?.trim();
          return {
            tag: element?.tagName ?? null,
            name: (
              element?.getAttribute?.("aria-label")
              || element?.getAttribute?.("title")
              || label
              || element?.textContent
              || ""
            ).trim().replace(/\s+/g, " ").slice(0, 120),
            focusVisible: element instanceof Element && element.matches(":focus-visible"),
            hasVisibleIndicator: (() => {
              if (!(element instanceof Element)) return false;
              const style = getComputedStyle(element);
              const outlineVisible = style.outlineStyle !== "none" && parseFloat(style.outlineWidth || "0") > 0;
              const shadowVisible = style.boxShadow !== "none" && style.boxShadow !== "";
              return outlineVisible || shadowVisible;
            })(),
          };
        }));
      }
      const namedFocusStops = focusStops.filter((stop) => stop.tag && stop.tag !== "BODY" && stop.name);
      const uniqueFocusStops = new Set(namedFocusStops.map((stop) => `${stop.tag}:${stop.name}`));
      const unnamedFocusStops = focusStops.filter((stop) => stop.tag && stop.tag !== "BODY" && !stop.name);
      const invisibleFocusStops = focusStops.filter((stop) => (
        stop.tag
        && stop.tag !== "BODY"
        && stop.name
        && (!stop.hasVisibleIndicator || (stop.tag !== "IFRAME" && !stop.focusVisible))
      ));
      const minimumFocusStops = testCase.minimumFocusStops || 3;

      results.push({
        case: testCase.name,
        viewport: viewport.label || `${viewport.width}x${viewport.height}`,
        pageOverflow: audit.documentWidth > audit.viewportWidth,
        documentWidth: audit.documentWidth,
        h1Count: audit.h1Count,
        severeViolations: audit.severeViolations,
        keyboardFocusMoves: uniqueFocusStops.size >= minimumFocusStops,
        unnamedFocusStops,
        invisibleFocusStops,
        renderedTheme: audit.renderedTheme,
        themeMatches: audit.themeMatches,
        forcedColorsActive: audit.forcedColorsActive,
        forcedColorsMatches: testCase.forcedColors ? audit.forcedColorsActive : true,
        zoomEquivalentMatches: viewport.zoomEquivalent
          ? audit.viewportWidth === 512 && audit.devicePixelRatio === 2
          : true,
      });
        await page.close();
        if (showProgress) process.stderr.write(`Completed ${auditStage}\n`);
      }
    }
  }

  const dialogResults = [];
  for (const dialogCase of dialogCases) {
    for (const variant of [
      { theme: "light", width: 1024, height: 900 },
      { theme: "dark", width: 390, height: 844 },
    ]) {
      auditStage = `${dialogCase.name} dialog in ${variant.theme}`;
      const page = await browser.newPage();
      await page.setViewport({ width: variant.width, height: variant.height });
      await page.evaluateOnNewDocument((theme) => localStorage.setItem("rainmaker-theme", theme), variant.theme);
      await page.goto(`${origin}/__fixture/${dialogCase.scenario}?next=${encodeURIComponent(dialogCase.path)}`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      await page.addStyleTag({
        content: "*,*::before,*::after{animation-delay:0s!important;animation-duration:0s!important;transition-delay:0s!important;transition-duration:0s!important}",
      });
      await page.waitForSelector("h1", { visible: true, timeout: 20_000 });
      for (const selector of dialogCase.actions) {
        await page.waitForSelector(selector, { visible: true, timeout: 20_000 });
        if (showProgress) process.stderr.write(`Activating ${selector} for ${auditStage}\n`);
        await page.evaluate((controlSelector) => {
          const control = document.querySelector(controlSelector);
          if (!(control instanceof HTMLElement)) throw new Error(`Missing dialog control ${controlSelector}`);
          control.click();
        }, selector);
      }
      await page.waitForSelector(dialogCase.surface, { visible: true, timeout: 10_000 });
      await page.addScriptTag({ content: axeSource });
      const dialogAudit = await page.evaluate(async (surfaceSelector, expectedTheme) => {
        const surface = document.querySelector(surfaceSelector);
        const labelledBy = surface?.getAttribute("aria-labelledby");
        const surfaceName = labelledBy ? document.getElementById(labelledBy)?.textContent?.trim() || "" : surface?.getAttribute("aria-label") || "";
        const axeResults = await Promise.race([
          globalThis.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("axe scan timed out")), 15_000)),
        ]);
        return {
          surfaceName,
          focusInsideSurface: Boolean(surface?.contains(document.activeElement)),
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          themeMatches: document.documentElement.classList.contains(expectedTheme),
          severeViolations: axeResults.violations
            .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
            .map((violation) => ({
              id: violation.id,
              nodes: violation.nodes.slice(0, 8).map((node) => ({ target: node.target, summary: node.failureSummary })),
            })),
        };
      }, dialogCase.surface, variant.theme);
      dialogResults.push({
        case: dialogCase.name,
        variant: `${variant.theme} ${variant.width}x${variant.height}`,
        ...dialogAudit,
      });
      await page.close();
      if (showProgress) process.stderr.write(`Completed ${auditStage}\n`);
    }
  }

  auditStage = "quote visual drag-and-drop rehearsal";
  const quoteVisualDropPage = await browser.newPage();
  let quoteVisualUploadTargetRequests = 0;
  let quoteVisualStoragePutRequests = 0;
  let quoteVisualFinalizeRequests = 0;
  let quoteVisualSaveRequests = 0;
  let quoteVisualDeleteRequests = 0;
  quoteVisualDropPage.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (request.method() === "POST" && requestUrl.pathname === "/api/images/upload-url") {
      quoteVisualUploadTargetRequests += 1;
    }
    if (request.method() === "PUT" && requestUrl.pathname === "/api/fixture-quote-visual-upload") {
      quoteVisualStoragePutRequests += 1;
    }
    if (request.method() === "POST" && requestUrl.pathname === "/api/images/finalize-upload") {
      quoteVisualFinalizeRequests += 1;
    }
    if (request.method() === "POST" && requestUrl.pathname === "/api/quotes/9301/product-rendering") {
      quoteVisualSaveRequests += 1;
    }
    if (request.method() === "DELETE" && requestUrl.pathname === "/api/quote-images/product-rendering/9701") {
      quoteVisualDeleteRequests += 1;
    }
  });
  await quoteVisualDropPage.setViewport({ width: 1024, height: 900 });
  await quoteVisualDropPage.goto(`${origin}/__fixture/admin?next=${encodeURIComponent("/quotes/9301/edit")}`, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  await quoteVisualDropPage.waitForSelector('[data-testid="button-build-customer-package"]', { visible: true, timeout: 20_000 });
  await quoteVisualDropPage.click('[data-testid="button-build-customer-package"]');
  await quoteVisualDropPage.waitForSelector('[data-testid="switch-esig-include-images"]', { visible: true, timeout: 10_000 });
  await quoteVisualDropPage.click('[data-testid="switch-esig-include-images"]');
  await quoteVisualDropPage.waitForSelector('[data-testid="quote-visuals-drop-zone"]', { visible: true, timeout: 10_000 });
  const dropResult = await quoteVisualDropPage.evaluate(() => {
    const dropZone = document.querySelector('[data-testid="quote-visuals-drop-zone"]');
    if (!(dropZone instanceof HTMLElement)) {
      return { dispatched: false, reason: "drop zone missing" };
    }
    const dataTransfer = new DataTransfer();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#244d37"/></svg>';
    dataTransfer.items.add(new File([svg], "TEST ONLY - Dragged Quote Visual.svg", { type: "image/svg+xml" }));
    dropZone.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
    dropZone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    return { dispatched: true, fileCount: dataTransfer.files.length };
  });
  await quoteVisualDropPage.waitForSelector('[data-testid="button-remove-rendering-9701"]', { visible: true, timeout: 15_000 });
  await quoteVisualDropPage.waitForFunction(
    () => document.body.innerText.includes("Image saved"),
    { timeout: 10_000 },
  );
  const quoteVisualPersisted = await quoteVisualDropPage.evaluate(() => ({
    thumbnailVisible: Boolean(document.querySelector('img[alt="Visual asset"]')),
    addMoreVisible: Boolean(document.querySelector('[data-testid="button-add-more-renderings"]')),
    uploadedNameVisible: document.body.innerText.includes("TEST ONLY"),
  }));
  await quoteVisualDropPage.click('[data-testid="button-remove-rendering-9701"]');
  await quoteVisualDropPage.waitForSelector('[data-testid="button-remove-rendering-9701"]', { hidden: true, timeout: 10_000 });
  await quoteVisualDropPage.waitForFunction(
    () => document.body.innerText.includes("Image removed"),
    { timeout: 10_000 },
  );
  const quoteVisualDropRehearsal = {
    ...dropResult,
    ...quoteVisualPersisted,
    localOnlyRequests: [
      quoteVisualUploadTargetRequests,
      quoteVisualStoragePutRequests,
      quoteVisualFinalizeRequests,
      quoteVisualSaveRequests,
      quoteVisualDeleteRequests,
    ].every((count) => count === 1),
    uploadTargetRequests: quoteVisualUploadTargetRequests,
    storagePutRequests: quoteVisualStoragePutRequests,
    finalizeRequests: quoteVisualFinalizeRequests,
    saveRequests: quoteVisualSaveRequests,
    deleteRequests: quoteVisualDeleteRequests,
    removedFromUi: await quoteVisualDropPage.evaluate(() => (
      !document.querySelector('[data-testid="button-remove-rendering-9701"]')
      && document.body.innerText.includes("Image removed")
    )),
  };
  await quoteVisualDropPage.close();

  auditStage = "public approval keyboard rehearsal";
  const keyboardPage = await browser.newPage();
  let signaturePostRequests = 0;
  let signaturePostRequestData = null;
  keyboardPage.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (request.method() === "POST" && /^\/api\/signatures\/[^/]+\/sign$/.test(requestUrl.pathname)) {
      signaturePostRequests += 1;
      signaturePostRequestData = { url: request.url(), postData: request.postData() || "{}" };
    }
  });
  await keyboardPage.setViewport({ width: 1024, height: 900 });
  await keyboardPage.goto(`${origin}/__fixture/public?next=${encodeURIComponent("/sign/test-token")}`, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  await keyboardPage.waitForSelector('[data-testid="button-proceed-to-sign"]:not([disabled])', { timeout: 15_000 });
  await keyboardPage.evaluate(() => document.activeElement?.blur());
  const tabsToSkipApprovalActions = await focusByTab(keyboardPage, "link-skip-to-approval-actions");
  await keyboardPage.keyboard.press("Enter");
  await keyboardPage.waitForFunction(
    () => document.activeElement?.id === "approval-actions",
    { timeout: 10_000 },
  );
  const skipApprovalTargetFocused = await keyboardPage.evaluate(
    () => document.activeElement?.id === "approval-actions",
  );
  const tabsToProceed = await focusByTab(keyboardPage, "button-proceed-to-sign");
  await keyboardPage.keyboard.press("Enter");
  await keyboardPage.waitForSelector('[data-testid="tab-type-signature"]', { timeout: 10_000 });
  await keyboardPage.waitForFunction(
    () => document.activeElement?.getAttribute?.("data-testid") === "heading-sign-approval",
    { timeout: 10_000 },
  );
  const tabsToSkipSignatureForm = await focusByTab(keyboardPage, "link-skip-to-signature-form");
  await keyboardPage.keyboard.press("Enter");
  await keyboardPage.waitForFunction(
    () => document.activeElement?.id === "signature-form",
    { timeout: 10_000 },
  );
  const skipSignatureTargetFocused = await keyboardPage.evaluate(
    () => document.activeElement?.id === "signature-form",
  );
  const tabsToTypeMode = await focusByTab(keyboardPage, "tab-draw-signature");
  await keyboardPage.keyboard.press("ArrowRight");
  await keyboardPage.waitForSelector('[data-testid="input-typed-signature"]', { visible: true, timeout: 10_000 });
  const tabsToTypedName = await focusByTab(keyboardPage, "input-typed-signature");
  await keyboardPage.keyboard.type("Fixture Keyboard Signer");
  const tabsToConsent = await focusByTab(keyboardPage, "checkbox-agree-terms");
  await keyboardPage.keyboard.press("Space");
  await keyboardPage.waitForSelector('[data-testid="button-submit-signature"]:not([disabled])', { timeout: 10_000 });
  const keyboardRehearsal = await keyboardPage.evaluate(() => ({
    currentStep: document.body.innerText.includes("Your Approval") ? "sign" : "unknown",
    typedName: document.querySelector('[data-testid="input-typed-signature"]')?.value || "",
    consentChecked: document.querySelector('[data-testid="checkbox-agree-terms"]')?.getAttribute("data-state") === "checked",
    submitEnabled: !document.querySelector('[data-testid="button-submit-signature"]')?.disabled,
  }));
  const signingAccessibilitySequence = await accessibilitySequence(keyboardPage);
  const accessibilityIndex = (role, name) => signingAccessibilitySequence.findIndex(
    (node) => node.role === role && node.name.includes(name),
  );
  const signingOrder = [
    accessibilityIndex("heading", "Your Approval"),
    accessibilityIndex("tab", "Draw"),
    accessibilityIndex("tab", "Type"),
    accessibilityIndex("textbox", "Type Your Full Legal Name"),
    accessibilityIndex("checkbox", "I confirm that I have reviewed this proposal"),
    accessibilityIndex("button", "Back"),
    accessibilityIndex("button", "Approve Proposal"),
  ];
  const actionableRoles = new Set(["button", "tab", "textbox", "checkbox", "link", "combobox", "radio", "switch"]);
  keyboardRehearsal.accessibilityTree = {
    expectedOrderFound: signingOrder.every((index) => index >= 0)
      && signingOrder.every((index, position) => position === 0 || index > signingOrder[position - 1]),
    unnamedActionableNodes: signingAccessibilitySequence.filter(
      (node) => actionableRoles.has(node.role) && !node.name,
    ),
    expectedOrder: signingOrder,
  };
  keyboardRehearsal.submitRequestSentBeforeActivation = signaturePostRequests > 0;
  const tabsToFinalApproval = await focusByTab(keyboardPage, "button-submit-signature");
  await keyboardPage.keyboard.press("Enter");
  await keyboardPage.waitForSelector('[data-testid="button-download-signed-pdf"]', { visible: true, timeout: 10_000 });
  let signaturePostPayload = {};
  try {
    signaturePostPayload = JSON.parse(signaturePostRequestData?.postData || "{}");
  } catch {
    signaturePostPayload = {};
  }
  keyboardRehearsal.submitRequestSent = signaturePostRequests === 1;
  keyboardRehearsal.localOnlyRequest = Boolean(signaturePostRequestData && new URL(signaturePostRequestData.url).origin === origin);
  keyboardRehearsal.signerNameSent = signaturePostPayload.signatureData?.name || "";
  keyboardRehearsal.signerTypeSent = signaturePostPayload.signerType || "";
  keyboardRehearsal.completionVisible = await keyboardPage.evaluate(() => document.body.innerText.includes("Proposal Approved"));
  keyboardRehearsal.emailClaim = await keyboardPage.evaluate(() => document.body.innerText.includes("We recommend downloading a copy"));
  await keyboardPage.close();

  auditStage = "new quote keyboard rehearsal";
  const newQuoteKeyboardPage = await browser.newPage();
  let quoteCreateRequests = 0;
  let quoteCreateRequestData = null;
  newQuoteKeyboardPage.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (request.method() === "POST" && requestUrl.pathname === "/api/quotes") {
      quoteCreateRequests += 1;
      quoteCreateRequestData = { url: request.url(), postData: request.postData() || "{}" };
    }
  });
  await newQuoteKeyboardPage.setViewport({ width: 1024, height: 900 });
  await newQuoteKeyboardPage.goto(`${origin}/__fixture/user?next=${encodeURIComponent("/quotes/new")}`, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  await newQuoteKeyboardPage.waitForSelector('[data-testid="button-submit-quote"]', { timeout: 10_000 });
  await newQuoteKeyboardPage.evaluate(() => document.activeElement?.blur());
  const tabsToCreateQuote = await focusByTab(newQuoteKeyboardPage, "button-submit-quote");
  await newQuoteKeyboardPage.keyboard.press("Enter");
  await newQuoteKeyboardPage.waitForFunction(
    () => document.activeElement?.getAttribute?.("data-testid") === "quote-form-error-summary",
    { timeout: 10_000 },
  );
  const emptyProjectBlocked = await newQuoteKeyboardPage.evaluate(() => (
    document.querySelector('[data-testid="quote-form-error-summary"]')?.textContent?.includes("Project name is required") === true
  ));
  const tabsToProjectName = await focusByTab(newQuoteKeyboardPage, "input-project-name");
  await newQuoteKeyboardPage.keyboard.type("TEST ONLY - Keyboard Quote Readiness");
  const newQuoteKeyboardRehearsal = await newQuoteKeyboardPage.evaluate(() => ({
    projectName: document.querySelector('[data-testid="input-project-name"]')?.value || "",
    createButtonEnabled: !document.querySelector('[data-testid="button-submit-quote"]')?.disabled,
  }));
  newQuoteKeyboardRehearsal.emptyProjectBlocked = emptyProjectBlocked;
  newQuoteKeyboardRehearsal.createRequestSentBeforeActivation = quoteCreateRequests > 0;
  const tabsToFinalCreateQuote = await focusByTab(newQuoteKeyboardPage, "button-submit-quote");
  await newQuoteKeyboardPage.keyboard.press("Enter");
  await newQuoteKeyboardPage.waitForFunction(() => location.pathname === "/quotes/9399/edit", { timeout: 10_000 });
  let quoteCreatePayload = {};
  try {
    quoteCreatePayload = JSON.parse(quoteCreateRequestData?.postData || "{}");
  } catch {
    quoteCreatePayload = {};
  }
  newQuoteKeyboardRehearsal.createRequestSent = quoteCreateRequests === 1;
  newQuoteKeyboardRehearsal.localOnlyRequest = Boolean(quoteCreateRequestData && new URL(quoteCreateRequestData.url).origin === origin);
  newQuoteKeyboardRehearsal.projectNameSent = quoteCreatePayload.projectName || "";
  newQuoteKeyboardRehearsal.fixtureQuoteOpened = await newQuoteKeyboardPage.evaluate(() => location.pathname === "/quotes/9399/edit");
  await newQuoteKeyboardPage.close();

  auditStage = "existing quote keyboard save rehearsal";
  const existingQuoteKeyboardPage = await browser.newPage();
  await existingQuoteKeyboardPage.setViewport({ width: 1024, height: 900 });
  await existingQuoteKeyboardPage.goto(`${origin}/__fixture/admin?next=${encodeURIComponent("/quotes/9301/edit")}`, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  await existingQuoteKeyboardPage.waitForSelector('[data-testid="input-project-name"]', { timeout: 10_000 });
  await existingQuoteKeyboardPage.evaluate(() => document.activeElement?.blur());
  const tabsToExistingProjectName = await focusByTab(existingQuoteKeyboardPage, "input-project-name");
  let localSaveRequestData = null;
  existingQuoteKeyboardPage.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (request.method() === "PUT"
      && requestUrl.origin === origin
      && requestUrl.pathname === "/api/quotes/9301") {
      localSaveRequestData = { url: request.url(), postData: request.postData() || "{}" };
    }
  });
  const selectAllModifier = process.platform === "darwin" ? "Meta" : "Control";
  await existingQuoteKeyboardPage.keyboard.down(selectAllModifier);
  await existingQuoteKeyboardPage.keyboard.press("a");
  await existingQuoteKeyboardPage.keyboard.up(selectAllModifier);
  await existingQuoteKeyboardPage.keyboard.type("TEST ONLY - Keyboard Edited Courtyard");
  await existingQuoteKeyboardPage.keyboard.press("Tab");
  await existingQuoteKeyboardPage.waitForFunction(
    () => document.querySelector('[data-testid="quote-save-status"]')?.textContent?.includes("Saved") === true,
    { timeout: 10_000 },
  );
  let localSavePayload = {};
  try {
    localSavePayload = JSON.parse(localSaveRequestData?.postData || "{}");
  } catch {
    localSavePayload = {};
  }
  const existingQuoteKeyboardRehearsal = {
    projectNameSent: localSavePayload.projectName || "",
    savedStatusVisible: await existingQuoteKeyboardPage.evaluate(() => (
      document.querySelector('[data-testid="quote-save-status"]')?.textContent?.includes("Saved") === true
    )),
    localOnlyRequest: Boolean(localSaveRequestData && new URL(localSaveRequestData.url).origin === origin),
    tabsToExistingProjectName,
  };
  await existingQuoteKeyboardPage.waitForNetworkIdle({ idleTime: 500, timeout: 5_000 }).catch(() => undefined);

  auditStage = "quote import no-write rehearsal";
  const quoteImportPage = await browser.newPage();
  let importBatchRequests = 0;
  quoteImportPage.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (request.method() === "POST" && requestUrl.pathname === "/api/quotes/import-batch") {
      importBatchRequests += 1;
    }
  });
  await quoteImportPage.setViewport({ width: 1024, height: 900 });
  await quoteImportPage.goto(`${origin}/__fixture/admin?next=${encodeURIComponent("/quotes")}`, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  await quoteImportPage.waitForSelector('[data-testid="button-import-pdf"]', { timeout: 10_000 });
  await quoteImportPage.click('[data-testid="button-import-pdf"]');
  const fileInput = await quoteImportPage.waitForSelector('[data-testid="input-file-upload"]', { timeout: 10_000 });
  await fileInput.uploadFile(resolve(process.cwd(), "docs/audits/rainmaker-app-audit-2026-07-10/fixtures/fictional-signed-quote.pdf"));
  await quoteImportPage.waitForSelector('[data-testid="input-customer-first-name"]', { visible: true, timeout: 45_000 });
  await quoteImportPage.waitForSelector('[data-testid="tab-import-options"]:not([disabled])', { timeout: 10_000 });
  await quoteImportPage.addScriptTag({ content: axeSource });
  const importPreviewAudit = await quoteImportPage.evaluate(async () => {
    const axeResults = await Promise.race([
      globalThis.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("axe scan timed out")), 15_000)),
    ]);
    return {
      firstName: document.querySelector('[data-testid="input-customer-first-name"]')?.value || "",
      lastName: document.querySelector('[data-testid="input-customer-last-name"]')?.value || "",
      projectDescription: document.querySelector('[data-testid="textarea-project-description"]')?.value || "",
      lineDescription: document.querySelector('[data-testid="input-import-line-description-0"]')?.value || "",
      lineQuantity: document.querySelector('[data-testid="input-import-line-quantity-0"]')?.value || "",
      linePrice: document.querySelector('[data-testid="input-import-line-price-0"]')?.value || "",
      severeViolations: axeResults.violations
        .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
        .map((violation) => ({
          id: violation.id,
          nodes: violation.nodes.slice(0, 8).map((node) => ({ target: node.target, summary: node.failureSummary })),
        })),
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  await quoteImportPage.click('[data-testid="tab-import-options"]');
  await quoteImportPage.waitForSelector('[data-testid="button-start-import"]', { visible: true, timeout: 10_000 });
  const defaultImportOptions = await quoteImportPage.evaluate(() => ({
    createNewQuote: document.querySelector('[data-testid="radio-create-new-quote"]')?.checked === true,
    createNewCustomer: document.querySelector('[data-testid="radio-create-new-customer"]')?.checked === true,
    priceMeaning: document.querySelector('[data-testid="select-import-price-meaning"]')?.textContent?.trim() || "",
    importEnabled: !document.querySelector('[data-testid="button-start-import"]')?.disabled,
  }));
  await quoteImportPage.click('[data-testid="radio-add-to-existing"]');
  await quoteImportPage.waitForSelector('[data-testid="select-existing-quote"]', { visible: true, timeout: 10_000 });
  const exactQuoteTargetRequired = await quoteImportPage.evaluate(() => document.querySelector('[data-testid="button-start-import"]')?.disabled === true);
  await quoteImportPage.click('[data-testid="radio-create-new-quote"]');
  await quoteImportPage.click('[data-testid="radio-use-existing-customer"]');
  await quoteImportPage.waitForSelector('[data-testid="select-existing-customer"]', { visible: true, timeout: 10_000 });
  const exactClientTargetRequired = await quoteImportPage.evaluate(() => document.querySelector('[data-testid="button-start-import"]')?.disabled === true);
  const importOptionsAudit = await quoteImportPage.evaluate(async () => {
    const axeResults = await Promise.race([
      globalThis.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("axe scan timed out")), 15_000)),
    ]);
    return {
      severeViolations: axeResults.violations
        .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
        .map((violation) => ({
          id: violation.id,
          nodes: violation.nodes.slice(0, 8).map((node) => ({ target: node.target, summary: node.failureSummary })),
        })),
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  const quoteImportRehearsal = {
    ...importPreviewAudit,
    defaultImportOptions,
    exactQuoteTargetRequired,
    exactClientTargetRequired,
    importOptionsSevereViolations: importOptionsAudit.severeViolations,
    importOptionsPageOverflow: importOptionsAudit.pageOverflow,
    importBatchRequestSent: importBatchRequests > 0,
  };
  await quoteImportPage.close();

  auditStage = "product catalog import rehearsal";
  const productImportPage = await browser.newPage();
  let productImportRequestData = null;
  let productImportRequestCount = 0;
  productImportPage.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (request.method() === "POST" && requestUrl.pathname === "/api/admin/import-csv-products") {
      productImportRequestCount += 1;
      productImportRequestData = { url: request.url(), postData: request.postData() || "{}" };
    }
  });
  await productImportPage.setViewport({ width: 1024, height: 900 });
  await productImportPage.goto(`${origin}/__fixture/admin?next=${encodeURIComponent("/products")}`, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  await productImportPage.waitForSelector('[data-testid="product-section-import"]', { visible: true, timeout: 10_000 });
  await productImportPage.evaluate(() => document.querySelector('[data-testid="product-section-import"]')?.click());
  await productImportPage.waitForSelector('[data-testid="product-import-tab-manual"]', { visible: true, timeout: 10_000 });
  await productImportPage.click('[data-testid="product-import-tab-manual"]');
  const productFileInput = await productImportPage.waitForSelector('[data-testid="input-csv-file"]', { timeout: 10_000 });
  await productFileInput.uploadFile(resolve(process.cwd(), "server/tests/fixtures/fictional-product-import.csv"));
  await productImportPage.waitForSelector('[data-testid="button-preview-data"]', { visible: true, timeout: 10_000 });
  await productImportPage.click('[data-testid="button-preview-data"]');
  await productImportPage.waitForSelector('[data-testid="row-preview-0"]', { visible: true, timeout: 10_000 });
  await productImportPage.click('[data-testid="button-import-products"]');
  await productImportPage.waitForFunction(
    () => document.body.innerText.includes("Import Successful"),
    { timeout: 10_000 },
  );
  let productImportPayload = {};
  try {
    productImportPayload = JSON.parse(productImportRequestData?.postData || "{}");
  } catch {
    productImportPayload = {};
  }
  const productImportRehearsal = {
    localOnlyRequest: Boolean(productImportRequestData && new URL(productImportRequestData.url).origin === origin),
    requestIdIsUuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productImportPayload.importRequestId || ""),
    requestCount: productImportRequestCount,
    productCount: Array.isArray(productImportPayload.products) ? productImportPayload.products.length : 0,
    product: productImportPayload.products?.[0] || null,
    completionVisible: await productImportPage.evaluate(() => document.body.innerText.includes("Import Successful")),
  };
  await productImportPage.close();

  auditStage = "Sundance Builder insertion rehearsal";
  const sundancePage = await browser.newPage();
  let sundanceRequestData = null;
  let sundanceRequestCount = 0;
  sundancePage.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (request.method() === "POST" && requestUrl.pathname === "/api/quotes/9301/configure-product") {
      sundanceRequestCount += 1;
      sundanceRequestData = { url: request.url(), postData: request.postData() || "{}" };
    }
  });
  await sundancePage.setViewport({ width: 1024, height: 900 });
  await sundancePage.goto(`${origin}/__fixture/admin?next=${encodeURIComponent("/quotes/9301/edit")}`, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  await sundancePage.waitForSelector('[data-testid="button-configure-product"]:not([disabled])', { visible: true, timeout: 15_000 });
  await sundancePage.click('[data-testid="button-configure-product"]');
  await sundancePage.waitForSelector('[data-testid="input-quantity-9403"]', { visible: true, timeout: 15_000 });
  await sundancePage.focus('[data-testid="input-quantity-9403"]');
  await sundancePage.keyboard.down(selectAllModifier);
  await sundancePage.keyboard.press("a");
  await sundancePage.keyboard.up(selectAllModifier);
  await sundancePage.keyboard.type("2");
  await sundancePage.waitForSelector('[data-testid="button-insert-config"]:not([disabled])', { visible: true, timeout: 10_000 });
  await sundancePage.click('[data-testid="button-insert-config"]');
  await sundancePage.waitForFunction(
    () => document.body.innerText.includes("Configuration inserted"),
    { timeout: 10_000 },
  );
  await sundancePage.waitForSelector('[role="dialog"]', { hidden: true, timeout: 10_000 });
  let sundancePayload = {};
  try {
    sundancePayload = JSON.parse(sundanceRequestData?.postData || "{}");
  } catch {
    sundancePayload = {};
  }
  const sundanceInsertionRehearsal = {
    localOnlyRequest: Boolean(sundanceRequestData && new URL(sundanceRequestData.url).origin === origin),
    requestIdIsUuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sundancePayload.requestId || ""),
    requestCount: sundanceRequestCount,
    itemCount: Array.isArray(sundancePayload.items) ? sundancePayload.items.length : 0,
    item: sundancePayload.items?.[0] || null,
    completionVisible: await sundancePage.evaluate(() => document.body.innerText.includes("Configuration inserted")),
    dialogClosed: await sundancePage.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return !dialog || !(dialog instanceof HTMLElement) || dialog.offsetParent === null;
    }),
  };
  await sundancePage.close();

  process.stdout.write(`${JSON.stringify({ results, dialogResults, quoteVisualDropRehearsal, keyboardRehearsal: {
    ...keyboardRehearsal,
    tabsToSkipApprovalActions,
    skipApprovalTargetFocused,
    tabsToProceed,
    tabsToSkipSignatureForm,
    skipSignatureTargetFocused,
    tabsToTypeMode,
    tabsToTypedName,
    tabsToConsent,
    tabsToFinalApproval,
  }, newQuoteKeyboardRehearsal: {
    ...newQuoteKeyboardRehearsal,
    tabsToCreateQuote,
    tabsToProjectName,
    tabsToFinalCreateQuote,
  }, existingQuoteKeyboardRehearsal, quoteImportRehearsal, productImportRehearsal, sundanceInsertionRehearsal }, null, 2)}\n`);
  const failed = results.some((result) => (
    result.pageOverflow
    || result.h1Count !== 1
    || result.severeViolations.length > 0
    || !result.keyboardFocusMoves
    || result.unnamedFocusStops.length > 0
    || result.invisibleFocusStops.length > 0
    || !result.themeMatches
    || !result.forcedColorsMatches
    || !result.zoomEquivalentMatches
  )) || dialogResults.some((result) => (
    !result.surfaceName
    || !result.focusInsideSurface
    || result.pageOverflow
    || !result.themeMatches
    || result.severeViolations.length > 0
  )) || (
    !quoteVisualDropRehearsal.dispatched
    || quoteVisualDropRehearsal.fileCount !== 1
    || !quoteVisualDropRehearsal.thumbnailVisible
    || !quoteVisualDropRehearsal.addMoreVisible
    || !quoteVisualDropRehearsal.uploadedNameVisible
    || !quoteVisualDropRehearsal.localOnlyRequests
    || quoteVisualDropRehearsal.uploadTargetRequests !== 1
    || quoteVisualDropRehearsal.storagePutRequests !== 1
    || quoteVisualDropRehearsal.finalizeRequests !== 1
    || quoteVisualDropRehearsal.saveRequests !== 1
    || quoteVisualDropRehearsal.deleteRequests !== 1
    || !quoteVisualDropRehearsal.removedFromUi
  ) || (
    keyboardRehearsal.currentStep !== "sign"
    || keyboardRehearsal.typedName !== "Fixture Keyboard Signer"
    || !keyboardRehearsal.consentChecked
    || !keyboardRehearsal.submitEnabled
    || keyboardRehearsal.submitRequestSentBeforeActivation
    || !keyboardRehearsal.submitRequestSent
    || !keyboardRehearsal.localOnlyRequest
    || keyboardRehearsal.signerNameSent !== "Fixture Keyboard Signer"
    || keyboardRehearsal.signerTypeSent !== "client"
    || !keyboardRehearsal.completionVisible
    || !keyboardRehearsal.emailClaim
    || !keyboardRehearsal.accessibilityTree.expectedOrderFound
    || keyboardRehearsal.accessibilityTree.unnamedActionableNodes.length > 0
    || tabsToSkipApprovalActions > 3
    || !skipApprovalTargetFocused
    || tabsToProceed > 3
    || tabsToSkipSignatureForm > 3
    || !skipSignatureTargetFocused
    || tabsToTypeMode > 3
    || tabsToTypedName > 3
    || tabsToConsent > 3
    || tabsToFinalApproval > 3
  ) || (
    !newQuoteKeyboardRehearsal.emptyProjectBlocked
    || newQuoteKeyboardRehearsal.projectName !== "TEST ONLY - Keyboard Quote Readiness"
    || !newQuoteKeyboardRehearsal.createButtonEnabled
    || newQuoteKeyboardRehearsal.createRequestSentBeforeActivation
    || !newQuoteKeyboardRehearsal.createRequestSent
    || !newQuoteKeyboardRehearsal.localOnlyRequest
    || newQuoteKeyboardRehearsal.projectNameSent !== "TEST ONLY - Keyboard Quote Readiness"
    || !newQuoteKeyboardRehearsal.fixtureQuoteOpened
    || tabsToCreateQuote > 20
    || tabsToProjectName > 8
    || tabsToFinalCreateQuote > 3
  ) || (
    existingQuoteKeyboardRehearsal.projectNameSent !== "TEST ONLY - Keyboard Edited Courtyard"
    || !existingQuoteKeyboardRehearsal.savedStatusVisible
    || !existingQuoteKeyboardRehearsal.localOnlyRequest
    || existingQuoteKeyboardRehearsal.tabsToExistingProjectName > 20
  ) || (
    quoteImportRehearsal.firstName !== "Avery"
    || quoteImportRehearsal.lastName !== "Example"
    || quoteImportRehearsal.projectDescription !== "TEST ONLY - Imported courtyard structure"
    || quoteImportRehearsal.lineDescription !== "Fictional imported shade structure"
    || quoteImportRehearsal.lineQuantity !== "2"
    || quoteImportRehearsal.linePrice !== "1250"
    || quoteImportRehearsal.severeViolations.length > 0
    || quoteImportRehearsal.pageOverflow
    || !quoteImportRehearsal.defaultImportOptions.createNewQuote
    || !quoteImportRehearsal.defaultImportOptions.createNewCustomer
    || !quoteImportRehearsal.defaultImportOptions.priceMeaning.includes("Customer unit price")
    || !quoteImportRehearsal.defaultImportOptions.importEnabled
    || !quoteImportRehearsal.exactQuoteTargetRequired
    || !quoteImportRehearsal.exactClientTargetRequired
    || quoteImportRehearsal.importOptionsSevereViolations.length > 0
    || quoteImportRehearsal.importOptionsPageOverflow
    || quoteImportRehearsal.importBatchRequestSent
  ) || (
    !productImportRehearsal.localOnlyRequest
    || !productImportRehearsal.requestIdIsUuid
    || productImportRehearsal.requestCount !== 1
    || productImportRehearsal.productCount !== 1
    || productImportRehearsal.product?.name !== "Fictional Browser Import"
    || productImportRehearsal.product?.manufacturer !== "Fixture Manufacturer"
    || productImportRehearsal.product?.retailPrice !== 125
    || productImportRehearsal.product?.cost !== 75
    || !productImportRehearsal.completionVisible
  ) || (
    !sundanceInsertionRehearsal.localOnlyRequest
    || !sundanceInsertionRehearsal.requestIdIsUuid
    || sundanceInsertionRehearsal.requestCount !== 1
    || sundanceInsertionRehearsal.itemCount !== 1
    || sundanceInsertionRehearsal.item?.productId !== 9403
    || sundanceInsertionRehearsal.item?.quantity !== 2
    || sundanceInsertionRehearsal.item?.productSnapshot?.name !== "Fictional Sundance Louver"
    || sundanceInsertionRehearsal.item?.productSnapshot?.manufacturer !== "Sundance"
    || sundanceInsertionRehearsal.item?.productSnapshot?.retailPrice !== "200.00"
    || sundanceInsertionRehearsal.item?.productSnapshot?.costPrice !== "80.00"
    || !sundanceInsertionRehearsal.completionVisible
    || !sundanceInsertionRehearsal.dialogClosed
  );
  if (failed) throw new Error("Responsive accessibility audit failed");
} catch (error) {
  throw new Error(`Browser audit failed during ${auditStage}`, { cause: error });
} finally {
  await browser?.close().catch(() => undefined);
  fixtureServer.kill("SIGTERM");
}
