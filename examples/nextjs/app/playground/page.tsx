"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  API_SURFACES,
  COST_CURRENCIES,
  createEmptyFieldDraft,
  DEFAULT_CURRENCY,
  PLAYGROUND_FIXTURES,
  STRUCTURED_OUTPUT_METHODS,
} from "@/lib/playground/fixtures";
import type {
  PlaygroundFieldDraft,
  PlaygroundModelsResponse,
  PlaygroundRunResponse,
  ProviderConfigMetadata,
} from "@/lib/playground/types";
import styles from "./playground.module.css";

/**
 * Local PreCall development workbench.
 *
 * Configure a model, build an arbitrary dummy intake, run the public PreCall API, and inspect
 * exactly what happened: the brief, the real rendered email, the structured result, the
 * authoritative original request, the fields that reached the model, and local diagnostics.
 *
 * Developer tooling for localhost. No accounts, no persistence beyond the local provider file, and
 * no deployment story. The API key never comes back from the server.
 */

type RunError = { kind: string; title: string; message: string };

/** Builder rows carry a stable local id so React keys survive reordering and duplicate keys. */
type FieldRow = PlaygroundFieldDraft & { readonly id: string };

let fieldRowCounter = 0;
function toFieldRow(field: PlaygroundFieldDraft): FieldRow {
  fieldRowCounter += 1;
  return { ...field, id: `row-${fieldRowCounter}` };
}

const TABS = ["brief", "email", "structured", "original", "aiInput", "diagnostics"] as const;
type TabId = (typeof TABS)[number];

const TAB_LABELS: Record<TabId, string> = {
  brief: "Brief",
  email: "Email preview",
  structured: "Structured result",
  original: "Original request",
  aiInput: "AI input",
  diagnostics: "Diagnostics",
};

function describeError(code: string, message: string): RunError {
  switch (code) {
    case "invalid_json":
    case "invalid_request":
      return { kind: "Invalid intake", title: "Invalid intake", message };
    case "invalid_submission":
    case "invalid_configuration":
    case "limit_exceeded":
      return { kind: "PreCall validation", title: "PreCall rejected the submission", message };
    case "live_not_configured":
      return { kind: "Configuration", title: "No live provider is configured", message };
    case "config_write_failed":
      return {
        kind: "Configuration",
        title: "The local configuration could not be written",
        message,
      };
    case "timeout":
      return { kind: "Timeout", title: "The provider did not answer in time", message };
    case "not_local":
      return { kind: "Local only", title: "The playground only serves localhost", message };
    default:
      return { kind: "Server failure", title: "The playground could not run this", message };
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function Chips({ items }: { items: readonly string[] }) {
  return (
    <div className="chips">
      {items.map((item) => (
        <span className="chip" key={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export default function PlaygroundPage() {
  const [mode, setMode] = useState<"fake" | "live">("fake");
  const [fields, setFields] = useState<FieldRow[]>(() =>
    (PLAYGROUND_FIXTURES[0]?.fields ?? []).map(toFieldRow),
  );
  const [fixtureId, setFixtureId] = useState<string>("detailed");
  const [costEnabled, setCostEnabled] = useState(
    PLAYGROUND_FIXTURES[0]?.costEstimation?.enabled ?? false,
  );
  const [currency, setCurrency] = useState(
    PLAYGROUND_FIXTURES[0]?.costEstimation?.currency ?? DEFAULT_CURRENCY,
  );
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [useDefaultFlags, setUseDefaultFlags] = useState(false);
  const [useRaw, setUseRaw] = useState(false);
  const [rawSubmission, setRawSubmission] = useState("{}");

  const [config, setConfig] = useState<ProviderConfigMetadata | null>(null);
  const [configForm, setConfigForm] = useState({
    baseUrl: "",
    model: "",
    apiKey: "",
    api: "chat-completions" as string,
    structuredOutput: "functionCalling" as string,
    extraHeaders: "{}",
  });
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<PlaygroundRunResponse | null>(null);
  const [error, setError] = useState<RunError | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("brief");

  const loadConfig = useCallback(async () => {
    try {
      const metadata = await readJson<ProviderConfigMetadata>(
        await fetch("/api/playground/config"),
      );
      setConfig(metadata);
      setConfigForm((current) => ({
        ...current,
        baseUrl: metadata.baseUrl ?? current.baseUrl,
        model: metadata.model ?? current.model,
        api: metadata.api ?? current.api,
        structuredOutput: metadata.structuredOutput ?? current.structuredOutput,
      }));
    } catch {
      setConfigError("The local configuration could not be read.");
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  function updateField(id: string, patch: Partial<PlaygroundFieldDraft>) {
    setFields((current) =>
      current.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );
  }

  function loadFixture(id: string) {
    setFixtureId(id);
    setLocalError(null);
    const fixture = PLAYGROUND_FIXTURES.find((entry) => entry.id === id);
    if (fixture === undefined) return;
    setFields(fixture.fields.map(toFieldRow));
    setCostEnabled(fixture.costEstimation?.enabled ?? false);
    setCurrency(fixture.costEstimation?.currency ?? DEFAULT_CURRENCY);
  }

  async function saveConfig() {
    setConfigMessage(null);
    setConfigError(null);

    let extraHeaders: unknown;
    if (configForm.extraHeaders.trim().length > 0) {
      try {
        extraHeaders = JSON.parse(configForm.extraHeaders);
      } catch {
        setConfigError("Extra headers must be a JSON object, for example {}.");
        return;
      }
    }

    try {
      const httpResponse = await fetch("/api/playground/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai-compatible",
          baseUrl: configForm.baseUrl,
          model: configForm.model,
          apiKey: configForm.apiKey,
          api: configForm.api,
          structuredOutput: configForm.structuredOutput,
          ...(extraHeaders === undefined ? {} : { extraHeaders }),
        }),
      });
      const payload: unknown = await httpResponse.json();
      if (!httpResponse.ok) {
        const record = (payload ?? {}) as Record<string, unknown>;
        setConfigError(
          describeError(
            String(record.code ?? "internal_error"),
            String(record.error ?? "The configuration was rejected."),
          ).message,
        );
        return;
      }
      setConfig(payload as ProviderConfigMetadata);
      setConfigForm((current) => ({ ...current, apiKey: "" }));
      setConfigMessage("Configuration saved locally. The key stays on the server.");
    } catch {
      setConfigError("The configuration could not be saved.");
    }
  }

  async function fetchModels() {
    setConfigMessage(null);
    setConfigError(null);
    try {
      const httpResponse = await fetch("/api/playground/models", { method: "POST" });
      const payload = await readJson<PlaygroundModelsResponse & { error?: string; code?: string }>(
        httpResponse,
      );
      if (!httpResponse.ok) {
        setConfigError(payload.error ?? "The model list could not be fetched.");
        return;
      }
      setModelOptions([...payload.models]);
      setConfigMessage(
        payload.note ??
          `${payload.models.length} model${payload.models.length === 1 ? "" : "s"} listed by the provider.`,
      );
    } catch {
      setConfigError("The model list could not be fetched. Enter the model id manually.");
    }
  }

  async function run() {
    setError(null);
    setLocalError(null);

    let raw: unknown;
    if (useRaw) {
      try {
        raw = JSON.parse(rawSubmission);
      } catch (parseError) {
        setLocalError(
          parseError instanceof Error
            ? parseError.message
            : "The raw submission must be valid JSON.",
        );
        return;
      }
    }

    setRunning(true);
    try {
      const httpResponse = await fetch("/api/playground/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          fields: fields.map(({ id: _rowId, ...draft }) => draft),
          costEstimation: { enabled: costEnabled, currency },
          simulateAdapterFailure: simulateFailure,
          useDefaultFlags,
          ...(useRaw ? { rawSubmission: raw } : {}),
        }),
      });
      const payload: unknown = await httpResponse.json().catch(() => null);

      if (!httpResponse.ok) {
        const record = (payload ?? {}) as Record<string, unknown>;
        setResponse(null);
        setError(
          describeError(
            String(record.code ?? "internal_error"),
            String(record.error ?? "Unexpected response."),
          ),
        );
        return;
      }
      setResponse(payload as PlaygroundRunResponse);
      setTab("brief");
    } catch {
      setResponse(null);
      setError(describeError("internal_error", "The playground server could not be reached."));
    } finally {
      setRunning(false);
    }
  }

  const liveReady = config?.configured === true;

  return (
    <main className={styles.layout}>
      <header className={styles.header}>
        <div>
          <h1>PreCall workbench</h1>
          <p className="muted">
            Local development tooling: configure a model, build a dummy intake, run the public
            PreCall API, and inspect the brief, the rendered email, the structured result, and the
            exact fields that reached the model. Localhost only, no accounts, no persistence beyond
            the local provider file.
          </p>
        </div>
        <a className={styles.link} href="/">
          ← Example form
        </a>
      </header>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <h2>Execution</h2>

          <div className={styles.field}>
            <span className={styles.label}>Execution mode</span>
            <label className={styles.radio}>
              <input
                type="radio"
                name="mode"
                checked={mode === "fake"}
                onChange={() => setMode("fake")}
              />
              Deterministic fake — no network, no credential, fast
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="mode"
                checked={mode === "live"}
                onChange={() => setMode("live")}
              />
              Live configured model
            </label>
            {mode === "live" && (
              <p className={styles.warn}>
                Live mode sends the dummy intake to the configured external provider. Use test data
                only, and expect the provider to bill the request.
              </p>
            )}
            {mode === "live" && !liveReady && (
              <p className={styles.localError}>
                No provider is configured yet. Save the configuration below first — live mode never
                falls back to the deterministic adapter.
              </p>
            )}
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Model configuration</span>
            <p className="muted">
              Stored in <code>{config?.configFile ?? ".precall-playground/config.json"}</code> with
              restrictive permissions. The key is sent to this localhost server only and is never
              returned to the browser.
            </p>
            <p className="muted">
              Status:{" "}
              {config === null
                ? "unknown"
                : config.configured
                  ? `configured — ${config.provider} · ${config.baseUrl} · ${config.model} · key stored`
                  : "not configured"}
            </p>

            <label className={styles.label} htmlFor="provider">
              Provider type
            </label>
            <input id="provider" className={styles.input} value="openai-compatible" readOnly />

            <label className={styles.label} htmlFor="baseUrl">
              Base URL
            </label>
            <input
              id="baseUrl"
              className={styles.input}
              placeholder="https://api.example.com/v1 or http://127.0.0.1:8080/v1"
              value={configForm.baseUrl}
              onChange={(event) => setConfigForm((c) => ({ ...c, baseUrl: event.target.value }))}
            />

            <label className={styles.label} htmlFor="apiKey">
              API key {config?.hasApiKey === true ? "(stored — leave empty to keep it)" : ""}
            </label>
            <input
              id="apiKey"
              className={styles.input}
              type="password"
              autoComplete="off"
              placeholder={config?.hasApiKey === true ? "•••••••• stored locally" : "sk-…"}
              value={configForm.apiKey}
              onChange={(event) => setConfigForm((c) => ({ ...c, apiKey: event.target.value }))}
            />

            <label className={styles.label} htmlFor="model">
              Model
            </label>
            <div className={styles.row}>
              <input
                id="model"
                className={styles.input}
                list="playground-models"
                placeholder="model id"
                value={configForm.model}
                onChange={(event) => setConfigForm((c) => ({ ...c, model: event.target.value }))}
              />
              <button type="button" className={styles.secondary} onClick={fetchModels}>
                Fetch models
              </button>
            </div>
            <datalist id="playground-models">
              {modelOptions.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
            {modelOptions.length > 0 && (
              <select
                className={styles.select}
                value=""
                onChange={(event) => {
                  if (event.target.value.length === 0) return;
                  setConfigForm((c) => ({ ...c, model: event.target.value }));
                }}
              >
                <option value="">Pick from {modelOptions.length} listed models…</option>
                {modelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            )}

            <details className={styles.details}>
              <summary>Advanced provider options</summary>
              <p className="muted">
                Escape hatches for OpenAI-compatible gateways that differ in surface or structured
                output handling. Most providers need none of them.
              </p>
              <label className={styles.label} htmlFor="api">
                API surface
              </label>
              <select
                id="api"
                className={styles.select}
                value={configForm.api}
                onChange={(event) => setConfigForm((c) => ({ ...c, api: event.target.value }))}
              >
                {API_SURFACES.map((surface) => (
                  <option key={surface.id} value={surface.id}>
                    {surface.label} — {surface.detail}
                  </option>
                ))}
              </select>
              <label className={styles.label} htmlFor="structuredOutput">
                Structured output method
              </label>
              <select
                id="structuredOutput"
                className={styles.select}
                value={configForm.structuredOutput}
                onChange={(event) =>
                  setConfigForm((c) => ({ ...c, structuredOutput: event.target.value }))
                }
              >
                {STRUCTURED_OUTPUT_METHODS.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.label} — {method.detail}
                  </option>
                ))}
              </select>
              <label className={styles.label} htmlFor="extraHeaders">
                Extra request headers (JSON, stored server-side)
              </label>
              <textarea
                id="extraHeaders"
                className={styles.textareaSmall}
                value={configForm.extraHeaders}
                onChange={(event) =>
                  setConfigForm((c) => ({ ...c, extraHeaders: event.target.value }))
                }
              />
            </details>

            <button type="button" className={styles.secondary} onClick={saveConfig}>
              Save configuration
            </button>
            {configMessage !== null && <p className="muted">{configMessage}</p>}
            {configError !== null && <p className={styles.localError}>{configError}</p>}
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Dummy intake</span>
            <div className={styles.fixtureRow}>
              {PLAYGROUND_FIXTURES.map((fixture) => (
                <button
                  key={fixture.id}
                  type="button"
                  aria-pressed={fixtureId === fixture.id}
                  className={fixtureId === fixture.id ? styles.fixtureActive : styles.fixture}
                  onClick={() => loadFixture(fixture.id)}
                  title={fixture.summary}
                >
                  {fixture.label}
                </button>
              ))}
            </div>

            {fields.map((field, index) => (
              <div className={styles.fieldCard} key={field.id}>
                <div className={styles.row}>
                  <input
                    className={styles.input}
                    aria-label={`field ${index + 1} key`}
                    placeholder="key"
                    value={field.key}
                    onChange={(event) => updateField(field.id, { key: event.target.value })}
                  />
                  <input
                    className={styles.input}
                    aria-label={`field ${index + 1} label`}
                    placeholder="label"
                    value={field.label}
                    onChange={(event) => updateField(field.id, { label: event.target.value })}
                  />
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() =>
                      setFields((current) => current.filter((row) => row.id !== field.id))
                    }
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  className={styles.textareaSmall}
                  aria-label={`field ${index + 1} value`}
                  placeholder="value"
                  value={field.value}
                  onChange={(event) => updateField(field.id, { value: event.target.value })}
                />
                <div className={styles.row}>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={field.sensitive}
                      onChange={(event) =>
                        updateField(field.id, { sensitive: event.target.checked })
                      }
                    />
                    sensitive
                  </label>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={field.sendToAI}
                      onChange={(event) =>
                        updateField(field.id, { sendToAI: event.target.checked })
                      }
                    />
                    sendToAI
                  </label>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={field.includeInOutput}
                      onChange={(event) =>
                        updateField(field.id, { includeInOutput: event.target.checked })
                      }
                    />
                    includeInOutput
                  </label>
                </div>
              </div>
            ))}

            <button
              type="button"
              className={styles.secondary}
              onClick={() =>
                setFields((current) => [
                  ...current,
                  toFieldRow(createEmptyFieldDraft(current.length + 1)),
                ])
              }
            >
              + Add field
            </button>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>PreCall configuration</span>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={costEnabled}
                onChange={(event) => setCostEnabled(event.target.checked)}
              />
              Preliminary cost estimation
            </label>
            {costEnabled && (
              <select
                className={styles.select}
                aria-label="cost currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {COST_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            )}
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={simulateFailure}
                onChange={(event) => setSimulateFailure(event.target.checked)}
              />
              Simulate an adapter failure (exercises the AI-unavailable path)
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={useDefaultFlags}
                onChange={(event) => setUseDefaultFlags(event.target.checked)}
              />
              Use PreCall defaults for the flags (sendToAI follows sensitive)
            </label>
          </div>

          <details className={styles.details}>
            <summary>Advanced: raw JSON submission</summary>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={useRaw}
                onChange={(event) => setUseRaw(event.target.checked)}
              />
              Send this JSON instead of the builder values
            </label>
            <textarea
              className={styles.textareaSmall}
              value={rawSubmission}
              onChange={(event) => setRawSubmission(event.target.value)}
            />
            <p className="muted">
              Keys still have to match the builder fields, because the builder defines the field
              configuration PreCall validates against.
            </p>
          </details>

          <button type="button" className={styles.run} onClick={run} disabled={running}>
            {running ? "Running…" : "Run PreCall"}
          </button>
          {localError !== null && <p className={styles.localError}>{localError}</p>}
        </section>

        <section className={styles.panel}>
          <h2>Result</h2>

          {error !== null && (
            <div className={styles.error}>
              <strong>
                {error.title} · {error.kind}
              </strong>
              <p>{error.message}</p>
              <p className="muted">
                The playground stays usable: fix the input or configuration and run again.
              </p>
            </div>
          )}

          {response === null ? (
            <p className="muted">
              {error === null
                ? "Build an intake, pick a mode, and run PreCall."
                : "No result for this run."}
            </p>
          ) : (
            <>
              <div className={styles.status}>
                <Chips
                  items={[
                    response.diagnostics.mode === "live" ? "live provider" : "deterministic fake",
                    response.diagnostics.externalProvider
                      ? "data leaves this machine"
                      : "no external calls",
                    `analysis: ${response.result.analysis.status}`,
                    `delivery: ${response.delivery?.status ?? "not attempted"}`,
                    `${response.diagnostics.elapsedMs} ms`,
                  ]}
                />
                {response.result.analysis.status === "succeeded" && (
                  <Chips
                    items={[
                      `facts: ${response.result.analysis.result.facts.length}`,
                      `inferences: ${response.result.analysis.result.inferences.length}`,
                      `unknowns: ${response.result.analysis.result.unknowns.length}`,
                      `risks: ${response.result.analysis.result.risks.length}`,
                      `questions: ${response.result.analysis.result.discoveryQuestions.length}`,
                      `phases: ${response.result.analysis.result.roadmap.phases.length}`,
                    ]}
                  />
                )}
                {response.emailError !== null && (
                  <p className={styles.localError}>
                    The deterministic renderer failed for this run, so no email is shown. The
                    structured result is still complete.
                  </p>
                )}
              </div>

              <div className={styles.tabs} role="tablist">
                {TABS.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    role="tab"
                    aria-selected={tab === entry}
                    className={tab === entry ? styles.tabActive : styles.tab}
                    onClick={() => setTab(entry)}
                  >
                    {TAB_LABELS[entry]}
                  </button>
                ))}
              </div>

              {tab === "brief" && <Brief response={response} />}

              {tab === "email" &&
                (response.email === null ? (
                  <p className="muted">
                    No email was rendered for this run
                    {response.emailError === null ? " (delivery was not attempted)." : "."}
                  </p>
                ) : (
                  <>
                    <Chips
                      items={[
                        `to: ${response.email.recipient}`,
                        `subject: ${response.email.subject}`,
                        `attachments: ${response.email.attachments.map((item) => item.filename).join(", ")}`,
                      ]}
                    />
                    <p className="muted">
                      The exact HTML the deterministic renderer produced, isolated in a sandboxed
                      frame with scripts disabled.
                    </p>
                    <iframe
                      className={styles.frame}
                      title="Rendered PreCall email"
                      sandbox=""
                      srcDoc={response.email.html}
                    />
                    <Section title="Text version">
                      <pre className={styles.pre}>{response.email.text}</pre>
                    </Section>
                    {response.email.attachments.map((attachment) => (
                      <Section key={attachment.filename} title={attachment.filename}>
                        <pre className={styles.pre}>{attachment.content}</pre>
                      </Section>
                    ))}
                  </>
                ))}

              {tab === "structured" && (
                <pre className={styles.pre}>{JSON.stringify(response.result, null, 2)}</pre>
              )}

              {tab === "original" && (
                <>
                  <p className="muted">
                    The authoritative submission, preserved separately from the AI interpretation,
                    with the privacy policy PreCall resolved for each field.
                  </p>
                  <Section title="Field policy applied">
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>sendToAI</th>
                          <th>includeInOutput</th>
                          <th>sensitive</th>
                        </tr>
                      </thead>
                      <tbody>
                        {response.result.request.fields.map((field) => (
                          <tr key={field.key}>
                            <td>{field.key}</td>
                            <td>{field.sendToAI ? "yes" : "no"}</td>
                            <td>{field.includeInOutput ? "yes" : "no"}</td>
                            <td>{field.sensitive ? "yes" : "no"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Section>
                  <Section title="Original values">
                    <pre className={styles.pre}>
                      {JSON.stringify(response.result.request.original, null, 2)}
                    </pre>
                  </Section>
                </>
              )}

              {tab === "aiInput" && (
                <>
                  <p className="muted">
                    Exactly the normalized fields PreCall sent to the adapter. Keys, labels, and
                    values only: no credential, authorization header, or provider payload is part of
                    this payload.
                  </p>
                  <Section title={`Sent to AI: ${response.aiInput.fields.length} fields`}>
                    {response.aiInput.fields.length === 0 ? (
                      <p className="muted">No field was permitted for AI processing.</p>
                    ) : (
                      <ul>
                        {response.aiInput.fields.map((field) => (
                          <li key={field.key}>
                            <strong>{field.key}</strong> — {field.label}
                            <pre className={styles.pre}>{JSON.stringify(field.value, null, 2)}</pre>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                  <Section title="Withheld from AI">
                    {response.result.request.fields.filter((field) => field.sendToAI !== true)
                      .length === 0 ? (
                      <p className="muted">No configured field is withheld in this run.</p>
                    ) : (
                      <ul>
                        {response.result.request.fields
                          .filter((field) => field.sendToAI !== true)
                          .map((field) => (
                            <li key={field.key}>
                              <strong>{field.key}</strong> — sendToAI=false
                              {field.sensitive ? ", sensitive" : ""}; retained for the professional
                            </li>
                          ))}
                      </ul>
                    )}
                  </Section>
                </>
              )}

              {tab === "diagnostics" && (
                <>
                  <Section title="Execution">
                    <table className={styles.table}>
                      <tbody>
                        <tr>
                          <th>Mode</th>
                          <td>{response.diagnostics.mode}</td>
                        </tr>
                        <tr>
                          <th>External provider</th>
                          <td>
                            {response.diagnostics.externalProvider
                              ? "yes — data left this machine"
                              : "no"}
                          </td>
                        </tr>
                        <tr>
                          <th>Provider</th>
                          <td>
                            {response.diagnostics.provider === undefined
                              ? "deterministic local adapter"
                              : `${response.diagnostics.provider.baseUrl} · ${response.diagnostics.provider.model}`}
                          </td>
                        </tr>
                        <tr>
                          <th>Elapsed</th>
                          <td>
                            {response.diagnostics.elapsedMs} ms (timeout{" "}
                            {response.diagnostics.timeoutMs} ms)
                          </td>
                        </tr>
                        <tr>
                          <th>Analysis status</th>
                          <td>{response.diagnostics.analysisStatus}</td>
                        </tr>
                        <tr>
                          <th>Adapter failure</th>
                          <td>{response.diagnostics.adapterFailure ?? "none"}</td>
                        </tr>
                        <tr>
                          <th>Rendering</th>
                          <td>{response.emailError ?? "ok"}</td>
                        </tr>
                        <tr>
                          <th>Delivery</th>
                          <td>{response.delivery?.status ?? "not attempted"}</td>
                        </tr>
                        <tr>
                          <th>AI invocations</th>
                          <td>{response.aiInput.invocations}</td>
                        </tr>
                      </tbody>
                    </table>
                  </Section>
                  <p className="muted">
                    Credentials, authorization headers, and provider response bodies are never part
                    of diagnostics. Provider failures are reported as adapter errors on the result
                    rather than as PreCall defects.
                  </p>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Brief({ response }: { response: PlaygroundRunResponse }) {
  const { analysis } = response.result;
  const cost = response.result.costEstimate;
  const sections = response.result.sections;

  if (analysis.status !== "succeeded") {
    const explanation =
      analysis.reason === "adapter_error"
        ? "The configured AI implementation raised an error, so the analysis is unavailable while the inquiry and the email are preserved. In live mode this is usually a provider, credential, or model-id problem — check Diagnostics."
        : analysis.reason === "invalid_output"
          ? "The AI implementation returned a value that did not satisfy the analysis contract, so it was not included."
          : "No submitted field was permitted for AI processing, so no analysis was attempted.";
    return (
      <div className="notice">
        <strong>Analysis unavailable ({analysis.reason})</strong>
        <p className="muted">{explanation}</p>
      </div>
    );
  }

  const result = analysis.result;
  return (
    <>
      <Section title="Summary">
        <p>{result.summary}</p>
        <Chips
          items={[`clarity: ${result.clarity.level}`, `confidence: ${result.confidence.level}`]}
        />
        <p className="muted">{result.clarity.reason}</p>
        <p className="muted">{result.confidence.reason}</p>
      </Section>

      {result.facts.length > 0 && (
        <Section title={`Facts (${result.facts.length})`}>
          <ul>
            {result.facts.map((fact) => (
              <li key={fact.text}>
                {fact.text}
                <Chips items={fact.sourceFieldKeys.map((key) => `from ${key}`)} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.inferences.length > 0 && (
        <Section title={`Inferences (${result.inferences.length})`}>
          <ul>
            {result.inferences.map((inference) => (
              <li key={inference.text}>
                {inference.text}
                <Chips
                  items={[
                    `${inference.confidence} confidence`,
                    ...inference.basedOnFieldKeys.map((key) => `based on ${key}`),
                  ]}
                />
                <p className="muted">{inference.reason}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.assumptions.length > 0 && (
        <Section title={`Assumptions (${result.assumptions.length})`}>
          <ul>
            {result.assumptions.map((assumption) => (
              <li key={assumption.text}>
                {assumption.text}
                {assumption.impact !== undefined && (
                  <Chips items={[`${assumption.impact} impact`]} />
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.unknowns.length > 0 && (
        <Section title={`Unknowns (${result.unknowns.length})`}>
          <ul>
            {result.unknowns.map((unknown) => (
              <li key={unknown.text}>
                {unknown.text}
                <Chips items={[unknown.priority]} />
                <p className="muted">{unknown.whyItMatters}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.risks.length > 0 && (
        <Section title={`Risks (${result.risks.length})`}>
          <ul>
            {result.risks.map((risk) => (
              <li key={risk.text}>
                {risk.text}
                {risk.severity !== undefined && <Chips items={[`${risk.severity} severity`]} />}
                <p className="muted">{risk.reason}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.discoveryQuestions.length > 0 && (
        <Section title={`Discovery questions (${result.discoveryQuestions.length})`}>
          <ul>
            {result.discoveryQuestions.map((question) => (
              <li key={question.question}>
                {question.question}
                <Chips items={[question.priority]} />
                <p className="muted">{question.reason}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Roadmap">
        <Chips items={[`status: ${result.roadmap.status}`]} />
        {result.roadmap.note !== undefined && <p className="muted">{result.roadmap.note}</p>}
        <ul>
          {result.roadmap.phases.map((phase) => (
            <li key={phase.name}>
              <strong>{phase.name}</strong>
              <p className="muted">{phase.purpose}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Cost estimate">
        {cost === undefined ? (
          <p className="muted">Cost estimation is disabled for this run.</p>
        ) : cost.status === "estimated" ? (
          <>
            <Chips
              items={[
                "status: estimated",
                `${cost.currency} ${cost.total.minAmount}–${cost.total.maxAmount} (core-summed)`,
              ]}
            />
            <ul>
              {cost.items.map((item) => (
                <li key={item.name}>
                  <strong>{item.name}</strong>: {item.minAmount}–{item.maxAmount}
                  <p className="muted">{item.reason}</p>
                </li>
              ))}
            </ul>
            <p className="muted">{cost.rationale}</p>
            <p className="muted">
              Confidence: {cost.confidence.level} — {cost.confidence.reason}
            </p>
          </>
        ) : cost.status === "insufficient_information" ? (
          <>
            <Chips items={["status: insufficient_information"]} />
            <p className="muted">{cost.reason}</p>
            <ul>
              {cost.missingInformation.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        ) : (
          <Chips items={[`status: unavailable (${cost.reason})`]} />
        )}
      </Section>

      <Section title="Custom sections">
        {sections === undefined ? (
          <p className="muted">
            No custom section is configured in this workbench. The result already carries a sections
            record whenever a consumer configures one.
          </p>
        ) : (
          <ul>
            {Object.entries(sections).map(([key, state]) => (
              <li key={key}>
                <strong>{key}</strong>{" "}
                {state.status === "succeeded" ? (
                  <pre className={styles.pre}>{JSON.stringify(state.value, null, 2)}</pre>
                ) : (
                  <span className="muted">unavailable: {state.reason}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
