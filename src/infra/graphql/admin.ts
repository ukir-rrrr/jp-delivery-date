/**
 * Admin GraphQL for the one settings metafield and per-product lead times.
 * Routes stay thin and call these helpers. Merchant copy lives in the routes.
 *
 * Settings live on the current AppInstallation (app-data metafield).
 * Theme app extensions read `app.metafields.delivery.settings_v1`.
 * App-data metafields cannot be declared in shopify.app.toml, and this value
 * is not mirrored onto the shop.
 *
 * Lead times use the app-owned product metafield from shopify.app.toml.
 * GraphQL namespace is `$app` (Liquid: `product.metafields.app`).
 * metafieldsSet on a product needs the same access as mutating that product,
 * so the app requests `write_products`.
 */
import {
  DEFAULT_SETTINGS_V1,
  type SettingsV1,
} from "../../domain/delivery/settings";
import {
  isLeadTimeInput,
  MAX_LEAD_TIME_ROWS,
  type LeadTimeUpdate,
} from "../metafields/lead-time";
import { migrate } from "../metafields/settings";

export const SETTINGS_METAFIELD_NAMESPACE = "delivery";
export const SETTINGS_METAFIELD_KEY = "settings_v1";
export const LEAD_TIME_METAFIELD_NAMESPACE = "$app";
export const LEAD_TIME_METAFIELD_KEY = "lead_time_days";

export const PRODUCT_LEAD_PAGE_SIZE = 20;

export type AdminFailureCode = "unavailable" | "access_denied";

export interface AdminClient {
  graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<Response>;
}

export class AdminApiError extends Error {
  readonly code: AdminFailureCode;

  constructor(code: AdminFailureCode) {
    super(code === "access_denied" ? "access_denied" : "shopify_unavailable");
    this.name = "AdminApiError";
    this.code = code;
  }
}

export class MetafieldWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetafieldWriteError";
  }
}

export function classifySaveError(
  error: unknown,
):
  | { kind: "user_error"; message: string }
  | { kind: "access_denied" }
  | { kind: "unavailable" } {
  if (error instanceof MetafieldWriteError) {
    return { kind: "user_error", message: error.message };
  }
  if (error instanceof AdminApiError && error.code === "access_denied") {
    return { kind: "access_denied" };
  }
  return { kind: "unavailable" };
}

interface UserError {
  field?: string[] | null;
  message: string;
}

interface GraphQLErrorLike {
  extensions?: { code?: string };
}

export async function adminGraphql<T>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await admin.graphql(query, { variables });
  } catch (error) {
    if (error instanceof Response) throw error;
    const graphQLErrors = graphQLErrorsOf(error);
    if (graphQLErrors.length > 0) throw failureFromGraphQLErrors(graphQLErrors);
    throw error;
  }
  if (!response.ok) {
    throw new AdminApiError("unavailable");
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AdminApiError("unavailable");
  }
  const graphQLErrors = graphQLErrorsOf(body);
  if (graphQLErrors.length > 0) {
    throw failureFromGraphQLErrors(graphQLErrors);
  }
  if (!isRecord(body) || body.data == null) {
    throw new AdminApiError("unavailable");
  }
  return body.data as T;
}

function failureFromGraphQLErrors(errors: readonly GraphQLErrorLike[]): AdminApiError {
  const denied = errors.some((error) => error.extensions?.code === "ACCESS_DENIED");
  return new AdminApiError(denied ? "access_denied" : "unavailable");
}

function graphQLErrorsOf(value: unknown, depth = 0): GraphQLErrorLike[] {
  if (depth > 4 || !isRecord(value)) return [];
  const direct = errorsArray(value.errors);
  if (direct.length > 0) return direct;
  if ("body" in value) return graphQLErrorsOf(value.body, depth + 1);
  return [];
}

function errorsArray(errors: unknown): GraphQLErrorLike[] {
  if (Array.isArray(errors)) return errors.filter(isGraphQLErrorLike);
  if (isRecord(errors) && Array.isArray(errors.graphQLErrors)) {
    return errors.graphQLErrors.filter(isGraphQLErrorLike);
  }
  return [];
}

function isGraphQLErrorLike(value: unknown): value is GraphQLErrorLike {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

const SETTINGS_QUERY = `#graphql
  query DeliverySettings($namespace: String!, $key: String!) {
    currentAppInstallation {
      metafield(namespace: $namespace, key: $key) {
        value
      }
    }
  }
`;

const INSTALLATION_QUERY = `#graphql
  query CurrentAppInstallationId {
    currentAppInstallation {
      id
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation SetAppMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

const PRODUCTS_QUERY = `#graphql
  query ProductLeadTimes($first: Int!, $after: String, $query: String, $namespace: String!, $key: String!) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        metafield(namespace: $namespace, key: $key) { value }
      }
    }
  }
`;

export interface SettingsLoad {
  ok: true;
  status: "missing" | "ok" | "invalid";
  settings: SettingsV1;
}

export interface SettingsUnavailable {
  ok: false;
  reason: "unavailable" | "access_denied";
}

export async function loadSettings(
  admin: AdminClient,
): Promise<SettingsLoad | SettingsUnavailable> {
  try {
    const data = await adminGraphql<{
      currentAppInstallation: { metafield: { value: string } | null } | null;
    }>(admin, SETTINGS_QUERY, {
      namespace: SETTINGS_METAFIELD_NAMESPACE,
      key: SETTINGS_METAFIELD_KEY,
    });
    const installation = data.currentAppInstallation;
    if (!installation) return { ok: false, reason: "unavailable" };
    const raw = installation.metafield?.value;
    if (raw == null || raw === "") {
      return { ok: true, status: "missing", settings: DEFAULT_SETTINGS_V1 };
    }
    return readStoredSettings(raw);
  } catch (error) {
    if (error instanceof AdminApiError) return { ok: false, reason: error.code };
    throw error;
  }
}

function readStoredSettings(raw: string): SettingsLoad {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return invalidSettings();
  }
  if (!parsed || typeof parsed !== "object") return invalidSettings();
  try {
    return { ok: true, status: "ok", settings: migrate(parsed) };
  } catch {
    return invalidSettings();
  }
}

function invalidSettings(): SettingsLoad {
  return {
    ok: true,
    status: "invalid",
    settings: DEFAULT_SETTINGS_V1,
  };
}

export async function saveSettingsMetafield(
  admin: AdminClient,
  settings: SettingsV1,
): Promise<void> {
  const validated = migrate(settings);
  const ownerId = await appInstallationId(admin);
  await writeMetafields(admin, [
    {
      ownerId,
      namespace: SETTINGS_METAFIELD_NAMESPACE,
      key: SETTINGS_METAFIELD_KEY,
      type: "json",
      value: JSON.stringify(validated),
    },
  ]);
}

export interface ProductLeadRow {
  id: string;
  title: string;
  leadTimeDays: string;
  originalLead: string;
  invalid: boolean;
}

export interface ProductLeadPage {
  ok: true;
  query: string;
  after: string | null;
  products: ProductLeadRow[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

export interface ProductLeadUnavailable {
  ok: false;
  query: string;
  reason: "unavailable" | "access_denied" | "bad_cursor";
}

export async function loadProductLeadTimes(
  admin: AdminClient,
  input: { query: string; after: string | null },
): Promise<ProductLeadPage | ProductLeadUnavailable> {
  const query = input.query.trim().slice(0, 200);
  const after = input.after?.trim() ? input.after.trim() : null;
  if (after && after.length > 2000) {
    return { ok: false, query, reason: "bad_cursor" };
  }
  try {
    const data = await adminGraphql<{
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: { id: string; title: string; metafield: { value: string } | null }[];
      };
    }>(admin, PRODUCTS_QUERY, {
      first: PRODUCT_LEAD_PAGE_SIZE,
      after,
      query: query || null,
      namespace: LEAD_TIME_METAFIELD_NAMESPACE,
      key: LEAD_TIME_METAFIELD_KEY,
    });
    return {
      ok: true,
      query,
      after,
      products: data.products.nodes.map(leadRow),
      pageInfo: data.products.pageInfo,
    };
  } catch (error) {
    if (error instanceof AdminApiError) {
      return { ok: false, query, reason: error.code };
    }
    throw error;
  }
}

function leadRow(node: {
  id: string;
  title: string;
  metafield: { value: string } | null;
}): ProductLeadRow {
  const stored = node.metafield?.value ?? null;
  if (stored == null || stored === "") {
    return {
      id: node.id,
      title: node.title,
      leadTimeDays: "0",
      originalLead: "0",
      invalid: false,
    };
  }
  return {
    id: node.id,
    title: node.title,
    leadTimeDays: stored,
    originalLead: stored,
    invalid: !isLeadTimeInput(stored),
  };
}

export async function saveProductLeadTimes(
  admin: AdminClient,
  updates: readonly LeadTimeUpdate[],
): Promise<void> {
  if (updates.length === 0) return;
  // metafieldsSet accepts at most 25 inputs. The form rejects this first.
  if (updates.length > MAX_LEAD_TIME_ROWS) {
    throw new AdminApiError("unavailable");
  }
  await writeMetafields(
    admin,
    updates.map((update) => ({
      ownerId: update.id,
      namespace: LEAD_TIME_METAFIELD_NAMESPACE,
      key: LEAD_TIME_METAFIELD_KEY,
      type: "number_integer",
      value: String(update.leadTimeDays),
    })),
  );
}

async function appInstallationId(admin: AdminClient): Promise<string> {
  const data = await adminGraphql<{ currentAppInstallation: { id: string } | null }>(
    admin,
    INSTALLATION_QUERY,
  );
  const id = data.currentAppInstallation?.id;
  if (!id) throw new AdminApiError("unavailable");
  return id;
}

async function writeMetafields(
  admin: AdminClient,
  metafields: readonly {
    ownerId: string;
    namespace: string;
    key: string;
    type: string;
    value: string;
  }[],
): Promise<void> {
  const data = await adminGraphql<{
    metafieldsSet: { userErrors: UserError[] } | null;
  }>(admin, METAFIELDS_SET, { metafields });
  const errors = data.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) {
    throw new MetafieldWriteError(errors.map((error) => error.message).join(" "));
  }
  if (!data.metafieldsSet) {
    throw new AdminApiError("unavailable");
  }
}
