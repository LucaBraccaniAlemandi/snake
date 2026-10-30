import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

export const JiraConnectionInput = z.object({
  baseUrl: z.string().url().transform((value) => value.replace(/\/$/, "")),
  email: z.string().email(),
  apiToken: z.string().min(1).max(4096).optional(),
  projectKey: z.string().trim().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_]*$/),
});

export type JiraConnectionInput = z.infer<typeof JiraConnectionInput>;
type StoredConnection = {
  workspace_id: string; base_url: string; email: string; project_key: string;
  encrypted_token: string; encryption_iv: string; encryption_tag: string;
  connected_at: string; last_validated_at: string;
};

export class JiraServiceError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = "JiraServiceError"; }
}

export type JiraTicket = {
  id: string; key: string; url: string; title: string; description: string;
  status: string; type: string; priority: string; assignee: string;
  updatedAt: string; parent?: string;
};

function encryptionKey() {
  const raw = process.env.JIRA_ENCRYPTION_KEY?.trim();
  if (!raw) throw new JiraServiceError("JIRA_ENCRYPTION_KEY no está configurada en el entorno del servidor.", 503);
  let key: Buffer;
  try { key = Buffer.from(raw, "base64"); } catch { key = Buffer.alloc(0); }
  if (key.length !== 32) {
    try { key = Buffer.from(raw, "hex"); } catch { key = Buffer.alloc(0); }
  }
  if (key.length !== 32) throw new JiraServiceError("JIRA_ENCRYPTION_KEY debe contener 32 bytes codificados en base64 o hexadecimal.", 503);
  return key;
}

function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { encrypted: encrypted.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

function decryptToken(row: StoredConnection) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(row.encryption_iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.encryption_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(row.encrypted_token, "base64")), decipher.final()]).toString("utf8");
}

async function stored(workspaceId: string): Promise<StoredConnection | null> {
  const { sql } = await import("./db");
  const [row] = await sql`SELECT * FROM jira_connections WHERE workspace_id = ${workspaceId}`;
  return (row as StoredConnection | undefined) ?? null;
}

function safeBaseUrl(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:" || !url.hostname.toLowerCase().endsWith(".atlassian.net") || url.username || url.password || url.search || url.hash) {
    throw new JiraServiceError("La URL debe ser un sitio Jira Cloud HTTPS de *.atlassian.net.");
  }
  return url.origin;
}

function userMessage(status: number) {
  if (status === 401) return "Jira rechazó el email o API token. Verifica las credenciales.";
  if (status === 403) return "La cuenta no tiene permiso para ver este proyecto o sus incidencias.";
  if (status === 404) return "No se encontró el sitio o proyecto indicado en Jira.";
  if (status === 429) return "Jira limitó temporalmente las consultas. Inténtalo de nuevo en unos segundos.";
  return `Jira respondió con HTTP ${status}.`;
}

async function jiraFetch(baseUrl: string, email: string, token: string, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { accept: "application/json", authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`, ...init?.headers },
    signal: init?.signal ?? AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new JiraServiceError(userMessage(response.status), response.status === 401 || response.status === 403 ? 401 : response.status === 429 ? 503 : 400);
  return response.status === 204 ? null : response.json() as Promise<any>;
}

export async function verifyJiraConnection(input: JiraConnectionInput, apiToken = input.apiToken) {
  if (!apiToken) throw new JiraServiceError("Ingresa el API token para probar la conexión.");
  const baseUrl = safeBaseUrl(input.baseUrl);
  await jiraFetch(baseUrl, input.email, apiToken, "/rest/api/3/myself");
  await jiraFetch(baseUrl, input.email, apiToken, `/rest/api/3/project/${encodeURIComponent(input.projectKey)}`);
  return { baseUrl, account: "Conexión autenticada", projectKey: input.projectKey };
}

export async function getJiraConnection(workspaceId: string) {
  const row = await stored(workspaceId);
  if (!row) return { configured: false as const, baseUrl: "", email: "", projectKey: "", connectedAt: null, lastValidatedAt: null };
  return { configured: true as const, baseUrl: row.base_url, email: row.email, projectKey: row.project_key, connectedAt: new Date(row.connected_at).toISOString(), lastValidatedAt: new Date(row.last_validated_at).toISOString() };
}

export async function saveJiraConnection(workspaceId: string, rawInput: JiraConnectionInput) {
  const current = await stored(workspaceId);
  const input = JiraConnectionInput.parse({ ...rawInput, apiToken: rawInput.apiToken?.trim() || undefined });
  const token = input.apiToken || (current && input.email === current.email && safeBaseUrl(input.baseUrl) === current.base_url ? decryptToken(current) : "");
  await verifyJiraConnection(input, token);
  const encrypted = encryptToken(token);
  const baseUrl = safeBaseUrl(input.baseUrl);
  const { sql } = await import("./db");
  await sql`INSERT INTO jira_connections (workspace_id, base_url, email, project_key, encrypted_token, encryption_iv, encryption_tag)
    VALUES (${workspaceId}, ${baseUrl}, ${input.email}, ${input.projectKey}, ${encrypted.encrypted}, ${encrypted.iv}, ${encrypted.tag})
    ON CONFLICT (workspace_id) DO UPDATE SET base_url = EXCLUDED.base_url, email = EXCLUDED.email,
    project_key = EXCLUDED.project_key, encrypted_token = EXCLUDED.encrypted_token, encryption_iv = EXCLUDED.encryption_iv,
    encryption_tag = EXCLUDED.encryption_tag, last_validated_at = now()`;
  return getJiraConnection(workspaceId);
}

export async function testJiraConnection(rawInput: JiraConnectionInput, workspaceId?: string) {
  const input = JiraConnectionInput.parse({ ...rawInput, apiToken: rawInput.apiToken?.trim() || undefined });
  let token = input.apiToken;
  if (!token && workspaceId) {
    const current = await stored(workspaceId);
    if (current && current.email === input.email && current.base_url === safeBaseUrl(input.baseUrl)) token = decryptToken(current);
  }
  await verifyJiraConnection(input, token);
  return { ok: true as const, projectKey: input.projectKey };
}

export async function deleteJiraConnection(workspaceId: string) {
  const { sql } = await import("./db");
  await sql`DELETE FROM jira_connections WHERE workspace_id = ${workspaceId}`;
}

export async function listJiraIssues(workspaceId: string, options: { query?: string; pageToken?: string; pageSize?: number } = {}) {
  const row = await stored(workspaceId);
  if (!row) throw new JiraServiceError("Jira no está conectado. Configura la integración para consultar tickets.", 409);
  const token = decryptToken(row);
  const searchTerm = options.query?.trim().slice(0, 100);
  const escapedTerm = searchTerm?.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const keyClause = searchTerm && /^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(searchTerm) ? `key = "${searchTerm}" OR ` : "";
  const clause = escapedTerm ? ` AND (${keyClause}text ~ "${escapedTerm}")` : "";
  const body: Record<string, unknown> = {
    jql: `project = "${row.project_key}"${clause} ORDER BY updated DESC`,
    maxResults: Math.max(1, Math.min(options.pageSize ?? 25, 50)),
    fields: ["summary", "description", "status", "issuetype", "priority", "assignee", "updated", "parent"],
  };
  if (options.pageToken) body.nextPageToken = options.pageToken;
  const result = await jiraFetch(row.base_url, row.email, token, "/rest/api/3/search/jql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return {
    issues: (result?.issues ?? []).map((issue: any) => mapIssue(row, issue)),
    nextPageToken: result?.nextPageToken ?? null,
    isLast: result?.isLast ?? !result?.nextPageToken,
  };
}

function adfText(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(adfText).filter(Boolean).join(value.some((item) => item?.type === "paragraph") ? "\n" : "");
  if (typeof value !== "object") return "";
  if (value.type === "text") return value.text ?? "";
  return adfText(value.content);
}

function mapIssue(row: StoredConnection, issue: any): JiraTicket {
  const fields = issue.fields ?? {};
  return {
    id: String(issue.id), key: String(issue.key), url: `${row.base_url}/browse/${encodeURIComponent(issue.key)}`,
    title: fields.summary ?? "(Sin resumen)", description: adfText(fields.description),
    status: fields.status?.name ?? "Sin estado", type: fields.issuetype?.name ?? "Sin tipo",
    priority: fields.priority?.name ?? "Sin prioridad", assignee: fields.assignee?.displayName ?? "Sin asignar",
    updatedAt: fields.updated ?? "", parent: fields.parent?.key,
  };
}

export async function getJiraIssue(workspaceId: string, issueKey: string) {
  const row = await stored(workspaceId);
  if (!row) throw new JiraServiceError("Jira no está conectado.", 409);
  if (!issueKey.toUpperCase().startsWith(`${row.project_key.toUpperCase()}-`)) throw new JiraServiceError("El ticket no pertenece al proyecto configurado.", 404);
  const issue = await jiraFetch(row.base_url, row.email, decryptToken(row), `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,description,status,issuetype,priority,assignee,updated,parent`);
  return mapIssue(row, issue);
}
