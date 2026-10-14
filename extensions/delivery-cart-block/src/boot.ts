import { readCartItems, resolveLeadTimes } from "@domain/delivery/cart-items";
import type { CartItem } from "@domain/delivery/earliest-date";
import {
  DEFAULT_SETTINGS_V1,
  readSettingsV1,
  type SettingsV1,
} from "@domain/delivery/settings";
import {
  choiceFromAttributes,
  sameAttributes,
} from "../../../src/storefront/cart-attributes";
import {
  planDeliveryView,
  type DeliveryPlan,
  type PlanIssueCode,
} from "../../../src/storefront/plan-delivery-view";

const CART_EVENTS = ["cart:updated", "cart:update", "cart:refresh", "cart:change"];

const ISSUE_ATTR: Record<PlanIssueCode, string> = {
  settings_invalid: "data-msg-settings",
  lead_time_unknown: "data-msg-lead",
  no_dates: "data-msg-empty",
  date_required: "data-msg-required",
  slot_required: "data-msg-slot",
  date_not_selectable: "data-msg-date",
  slot_not_offered: "data-msg-slot",
};

const ISSUE_FALLBACK: Record<PlanIssueCode, string> = {
  settings_invalid: "配達日を計算できません。アプリの設定を確認してください。",
  lead_time_unknown: "商品の出荷リードタイムを確認できないため、日付を表示できません。",
  no_dates: "指定できる配達日がありません。",
  date_required: "配達希望日を選択してください。",
  slot_required: "配達時間帯を選択してください。",
  date_not_selectable: "選択した日付は指定できません。別の日付を選んでください。",
  slot_not_offered: "選択した時間帯は利用できません。",
};

interface CartPayload {
  items?: { product_id?: number | string }[];
  attributes?: Record<string, string>;
}

let writing = 0;
let dirty = false;
let choice = { date: "", slot: "", prefecture: "" };
let settings: SettingsV1 | null = DEFAULT_SETTINGS_V1;
let refreshTimer = 0;
let lastPlan: DeliveryPlan | null = null;
let refreshChain: Promise<void> = Promise.resolve();
let holdCheckout = false;
let writeFailures = 0;

export function boot(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (typeof document.querySelectorAll !== "function") return;
  const flag = window as Window & { __jpDeliveryBooted?: boolean };
  if (flag.__jpDeliveryBooted) return;
  flag.__jpDeliveryBooted = true;

  document.addEventListener("change", onChange);
  document.addEventListener("submit", onSubmit, true);
  document.addEventListener("click", onCheckoutClick, true);
  for (const name of CART_EVENTS) {
    document.addEventListener(name, () => scheduleRefresh());
  }
  watchCartFetches();
  watchDom();
  remountEmbeds();
  if (anyRequired()) applyCheckoutLock(true);
  scheduleRefresh();
}

function onChange(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  const root = target.closest<HTMLElement>("[data-jp-delivery]");
  if (!root) return;
  dirty = true;
  if (target.hasAttribute("data-jp-delivery-prefecture")) {
    choice.prefecture = target.value;
  } else {
    choice.date =
      root.querySelector<HTMLSelectElement>("[data-jp-delivery-date]")?.value ?? "";
    choice.slot =
      root.querySelector<HTMLSelectElement>("[data-jp-delivery-slot]")?.value ?? "";
  }
  applyCheckoutLock(true);
  enqueue(true);
}

function onCheckoutClick(event: MouseEvent): void {
  if (!checkoutHeld()) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const control = target.closest(
    "button[name='checkout'], input[name='checkout'], a[href='/checkout'], a[href$='/checkout']",
  );
  if (!control) return;
  event.preventDefault();
  event.stopPropagation();
}

function onSubmit(event: SubmitEvent): void {
  if (!checkoutHeld()) return;
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.action.includes("/cart")) return;
  if (event.submitter?.getAttribute("name") !== "checkout") return;
  event.preventDefault();
}

function scheduleRefresh(): void {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => enqueue(false), 200);
}

function enqueue(keepChoice: boolean): void {
  refreshChain = refreshChain.then(() => refresh(keepChoice)).catch(() => undefined);
}

async function refresh(keepChoice: boolean): Promise<void> {
  remountEmbeds();
  let snapshot = readSnapshot(document);
  const cart = await fetchCart();
  if (!keepChoice && !dirty && cart) {
    const saved = choiceFromAttributes(cart.attributes);
    choice = { ...choice, ...saved };
  }
  const resolved = await itemsForCart(cart, snapshot);
  snapshot = resolved.snapshot;
  settings = snapshot.settings;
  const plan = planDeliveryView({
    now: { epochMs: Date.now(), timeZone: "Asia/Tokyo" },
    settings,
    items: resolved.items,
    prefecture: activePrefecture(),
    required: anyRequired(),
    locale: localeOf(),
    date: choice.date,
    slot: choice.slot,
  });
  choice = { ...choice, date: plan.date, slot: plan.slot };
  lastPlan = plan;
  const attributes = plan.attributes;
  const mustWrite = Boolean(
    cart && attributes && !sameAttributes(cart.attributes, attributes),
  );
  paint(plan, plan.checkoutLocked || mustWrite);
  if (!mustWrite || !attributes) {
    writeFailures = 0;
    return;
  }
  const wrote = await persist(attributes);
  if (!wrote) {
    writeFailures += 1;
    applyCheckoutLock(true);
    if (writeFailures < 3) scheduleRefresh();
    return;
  }
  writeFailures = 0;
  applyCheckoutLock(plan.checkoutLocked);
}

function activePrefecture(): string {
  const shown = [...document.querySelectorAll<HTMLElement>("[data-jp-delivery]")].some(
    (root) => root.dataset.showPrefecture === "true",
  );
  return shown ? choice.prefecture : "";
}

async function itemsForCart(
  cart: CartPayload | null,
  snapshot: Snapshot,
): Promise<{ items: CartItem[] | null; snapshot: Snapshot }> {
  if (!cart?.items) return { items: null, snapshot };
  const productIds = cart.items.map((item) => String(item.product_id ?? ""));
  if (snapshot.items) {
    const resolved = resolveLeadTimes(productIds, snapshot.items);
    if (resolved) return { items: resolved, snapshot };
  }
  const refreshed = await refetchSnapshot();
  if (!refreshed?.items) return { items: null, snapshot: refreshed ?? snapshot };
  return {
    items: resolveLeadTimes(productIds, refreshed.items),
    snapshot: refreshed,
  };
}

async function refetchSnapshot(): Promise<Snapshot | null> {
  try {
    const response = await fetch(`${window.location.pathname}${window.location.search}`, {
      headers: { Accept: "text/html" },
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    return readSnapshot(doc);
  } catch {
    return null;
  }
}

interface Snapshot {
  settings: SettingsV1 | null;
  items: CartItem[] | null;
}

function readSnapshot(root: ParentNode): Snapshot {
  return {
    settings: settingsFromEmbedded(embeddedText(root, "[data-jp-delivery-settings]")),
    items: itemsFromEmbedded(embeddedText(root, "[data-jp-delivery-items]")),
  };
}

function settingsFromEmbedded(text: string): SettingsV1 | null {
  const parsed = parseEmbedded(text);
  if (parsed.status === "missing") return DEFAULT_SETTINGS_V1;
  if (parsed.status === "invalid") return null;
  return readSettingsV1(parsed.value);
}

function itemsFromEmbedded(text: string): CartItem[] | null {
  const parsed = parseEmbedded(text);
  if (parsed.status !== "ok") return null;
  return readCartItems(parsed.value);
}

function embeddedText(root: ParentNode, selector: string): string {
  const live = root.querySelector(selector);
  if (live?.textContent?.trim()) return live.textContent;
  const template = root.querySelector<HTMLTemplateElement>(
    "template[data-jp-delivery-template]",
  );
  return template?.content.querySelector(selector)?.textContent ?? "";
}

function parseEmbedded(
  text: string,
): { status: "missing" } | { status: "invalid" } | { status: "ok"; value: unknown } {
  const trimmed = text.trim();
  if (!trimmed) return { status: "missing" };
  try {
    let value = JSON.parse(trimmed) as unknown;
    if (typeof value === "string") {
      try {
        value = JSON.parse(value) as unknown;
      } catch {
        return { status: "invalid" };
      }
    }
    if (value === null) return { status: "missing" };
    return { status: "ok", value };
  } catch {
    return { status: "invalid" };
  }
}

function paint(plan: DeliveryPlan, locked = plan.checkoutLocked): void {
  for (const root of document.querySelectorAll<HTMLElement>("[data-jp-delivery]")) {
    const showPrefecture = root.dataset.showPrefecture === "true";
    const prefectureField = root.querySelector<HTMLElement>(
      "[data-jp-delivery-prefecture-field]",
    );
    if (prefectureField) prefectureField.hidden = !showPrefecture;

    fillSelect(root, "[data-jp-delivery-date]", plan.dates, plan.date);
    fillSelect(root, "[data-jp-delivery-slot]", plan.slots, plan.slot);
    if (showPrefecture) {
      fillSelect(root, "[data-jp-delivery-prefecture]", plan.prefectures, choice.prefecture);
    }

    const dateSelect = root.querySelector<HTMLSelectElement>("[data-jp-delivery-date]");
    if (dateSelect) dateSelect.required = root.dataset.required === "true" && plan.dates.length > 0;

    const error = root.querySelector<HTMLElement>("[data-jp-delivery-error]");
    const message = plan.issues[0] ? messageFor(root, plan.issues[0].code) : "";
    if (error) {
      if (error.textContent !== message) error.textContent = message;
      error.hidden = message === "";
    }
    root.dataset.ready = "true";
    root.dataset.jpDeliveryReasons = JSON.stringify(plan.reasons);
  }
  applyCheckoutLock(locked);
}

function checkoutHeld(): boolean {
  return holdCheckout || Boolean(lastPlan?.checkoutLocked);
}

function fillSelect(
  root: ParentNode,
  selector: string,
  options: { value: string; label: string }[],
  value: string,
): void {
  const select = root.querySelector<HTMLSelectElement>(selector);
  if (!select) return;
  const signature = options.map((option) => `${option.value}=${option.label}`).join("|");
  if (select.dataset.sig !== signature) {
    const blankLabel = select.querySelector("option[value='']")?.textContent ?? "";
    select.replaceChildren();
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = blankLabel;
    select.append(blank);
    for (const option of options) {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      select.append(node);
    }
    select.dataset.sig = signature;
  }
  const known = value === "" || options.some((option) => option.value === value);
  select.value = known ? value : "";
  select.disabled = options.length === 0 && !select.hasAttribute("data-jp-delivery-prefecture");
}

function messageFor(root: HTMLElement, code: PlanIssueCode): string {
  return root.getAttribute(ISSUE_ATTR[code]) || ISSUE_FALLBACK[code];
}

function applyCheckoutLock(locked: boolean): void {
  holdCheckout = locked;
  const nodes = document.querySelectorAll(
    "button[name='checkout'], input[name='checkout'], a[href='/checkout'], a[href$='/checkout']",
  );
  nodes.forEach((node) => {
    if (locked) {
      node.setAttribute("data-jp-delivery-locked", "true");
      node.setAttribute("aria-disabled", "true");
      if (node instanceof HTMLButtonElement || node instanceof HTMLInputElement) {
        node.disabled = true;
      }
      if (node instanceof HTMLAnchorElement && !node.hasAttribute("data-jp-delivery-tabindex")) {
        node.setAttribute("data-jp-delivery-tabindex", node.getAttribute("tabindex") ?? "");
        node.tabIndex = -1;
      }
      return;
    }
    if (node.getAttribute("data-jp-delivery-locked") !== "true") return;
    node.removeAttribute("data-jp-delivery-locked");
    node.removeAttribute("aria-disabled");
    if (node instanceof HTMLButtonElement || node instanceof HTMLInputElement) {
      node.disabled = false;
    }
    if (node instanceof HTMLAnchorElement && node.hasAttribute("data-jp-delivery-tabindex")) {
      const previous = node.getAttribute("data-jp-delivery-tabindex") ?? "";
      node.removeAttribute("data-jp-delivery-tabindex");
      if (previous) node.setAttribute("tabindex", previous);
      else node.removeAttribute("tabindex");
    }
  });
}

function anyRequired(): boolean {
  return [...document.querySelectorAll<HTMLElement>("[data-jp-delivery]")].some(
    (root) => root.dataset.required === "true",
  );
}

function localeOf(): string {
  const root = document.querySelector<HTMLElement>("[data-jp-delivery]");
  return root?.dataset.locale || document.documentElement.lang || "ja";
}

function cartUrl(path: string): string {
  const root =
    (window as Window & { Shopify?: { routes?: { root?: string } } }).Shopify?.routes?.root ??
    "/";
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return `${prefix}${path.replace(/^\//, "")}`;
}

async function fetchCart(): Promise<CartPayload | null> {
  try {
    const response = await fetch(cartUrl("cart.js"), {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    return (await response.json()) as CartPayload;
  } catch {
    return null;
  }
}

async function persist(attributes: Record<string, string>): Promise<boolean> {
  writing += 1;
  try {
    const response = await fetch(cartUrl("cart/update.js"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ attributes }),
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    writing -= 1;
  }
}

/** Dawn updates the cart with fetch and does not always emit a DOM event. */
function watchCartFetches(): void {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init);
    if (writing === 0 && isCartMutation(input)) {
      applyCheckoutLock(true);
      scheduleRefresh();
    }
    return response;
  };
}

function isCartMutation(input: RequestInfo | URL): boolean {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return /\/cart\/(add|change|update|clear)(\.js)?([?#]|$)/.test(url);
}

function watchDom(): void {
  let lastCount = countText();
  const observer = new MutationObserver(() => {
    const inserted = remountEmbeds();
    if (inserted && lastPlan) paint(lastPlan, checkoutHeld());
    const next = countText();
    if (next !== lastCount) {
      lastCount = next;
      scheduleRefresh();
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function remountEmbeds(): boolean {
  let inserted = false;
  for (const template of document.querySelectorAll<HTMLTemplateElement>(
    "template[data-jp-delivery-template]",
  )) {
    const selector = template.getAttribute("data-cart-drawer-selector") || "cart-drawer";
    let drawers: NodeListOf<Element>;
    try {
      drawers = document.querySelectorAll(selector);
    } catch {
      continue;
    }
    for (const drawer of drawers) {
      if (drawer.querySelector("[data-jp-delivery]")) continue;
      const checkout = drawer.querySelector("[name='checkout']");
      const fragment = template.content.cloneNode(true);
      if (checkout?.parentNode) checkout.parentNode.insertBefore(fragment, checkout);
      else drawer.append(fragment);
      inserted = true;
    }
  }
  return inserted;
}

function countText(): string {
  const bubble = document.querySelector(
    ".cart-count-bubble, [data-cart-count], .cart-count",
  );
  return bubble?.textContent?.trim() ?? "";
}
