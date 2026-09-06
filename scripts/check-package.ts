import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PackageMetadata = {
  name?: unknown;
  version?: unknown;
  private?: unknown;
  description?: unknown;
  keywords?: unknown;
  license?: unknown;
  repository?: unknown;
  bugs?: unknown;
  homepage?: unknown;
  engines?: unknown;
  publishConfig?: unknown;
  exports?: unknown;
  files?: unknown;
  peerDependencies?: unknown;
  peerDependenciesMeta?: unknown;
};

const packageName = "@okazakee/precall";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageVersion = "0.1.0";
const description =
  "Provider-neutral TypeScript library for privacy-filtered service-intake pre-call briefs.";
const keywords = ["precall", "service-intake", "intake", "ai", "typescript", "email"];
const repository = "git+https://github.com/Okazakee/PreCall.git";
const bugs = "https://github.com/Okazakee/PreCall/issues";
const homepage = "https://github.com/Okazakee/PreCall#readme";

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error !== undefined || result.status !== 0) {
    const detail = [result.stdout, result.stderr, result.error?.message]
      .filter((value): value is string => value !== undefined && value.length > 0)
      .join("\n");
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout;
}

function parseJson<T>(value: string, parseDescription: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`${parseDescription} is not valid JSON`, { cause: error });
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertArchive(tarball: string, localDistEntries: readonly string[]): PackageMetadata {
  const entries = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const required = [
    "package/package.json",
    "package/README.md",
    "package/LICENSE",
    "package/dist/index.js",
    "package/dist/index.d.ts",
    "package/dist/langchain.js",
    "package/dist/langchain.d.ts",
    "package/dist/resend.js",
    "package/dist/resend.d.ts",
  ];
  const expected = new Set([
    ...required,
    ...localDistEntries.map((entry) => `package/dist/${entry}`),
  ]);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const entry of entries) {
    if (seen.has(entry)) duplicates.push(entry);
    else seen.add(entry);
  }
  assert(
    duplicates.length === 0,
    `packed artifact contains duplicate entries: ${duplicates.join(", ")}`,
  );
  const unexpected = entries.filter((entry) => !expected.has(entry));
  assert(
    unexpected.length === 0,
    `packed artifact contains unexpected entries: ${unexpected.join(", ")}`,
  );
  const missing = [...expected].filter((entry) => !seen.has(entry));
  assert(missing.length === 0, `packed artifact is missing ${missing.join(", ")}`);

  const forbidden =
    /(?:^|\/)(?:src|test|tests|docs|scripts|\.github|consumer|consumers|tmp|temp)(?:\/|$)|(?:^|\/)(?:\.env(?:\.|$)|.*(?:secret|credential|token).*)(?:$|\/)|\.(?:mp3|wav|flac|ogg|m4a|mp4|mov|mkv|avi|webm|png|jpg|jpeg|gif|webp|svg|ico)$/iu;
  const forbiddenEntries = entries.filter((entry) => forbidden.test(entry));
  assert(
    forbiddenEntries.length === 0,
    `packed artifact contains forbidden paths: ${forbiddenEntries.join(", ")}`,
  );
  const packageJson = execFileSync("tar", ["-xOzf", tarball, "package/package.json"], {
    encoding: "utf8",
  });
  const metadata = parseJson<PackageMetadata>(packageJson, "packed package metadata");
  assert(metadata.name === packageName, `packed package name must be ${packageName}`);
  assert(metadata.version === packageVersion, `packed package version must be ${packageVersion}`);
  assert(metadata.description === description, "packed description is incorrect");
  assert(
    JSON.stringify(metadata.keywords) === JSON.stringify(keywords),
    "packed keywords are incorrect",
  );
  assert(metadata.private !== true, "packed package must not be private");
  assert(metadata.license === "Apache-2.0", "packed package license must be Apache-2.0");
  assert(
    JSON.stringify(metadata.repository) === JSON.stringify({ type: "git", url: repository }),
    "packed repository metadata is incorrect",
  );
  assert(
    JSON.stringify(metadata.bugs) === JSON.stringify({ url: bugs }),
    "packed bugs metadata is incorrect",
  );
  assert(metadata.homepage === homepage, "packed homepage metadata is incorrect");
  assert(
    JSON.stringify(metadata.engines) === JSON.stringify({ node: ">=22.14.0", bun: ">=1.3.14" }),
    "packed runtime engines are incorrect",
  );
  assert(
    JSON.stringify(metadata.publishConfig) ===
      JSON.stringify({ access: "public", registry: "https://registry.npmjs.org" }),
    "packed publishConfig is incorrect",
  );
  assert(
    Array.isArray(metadata.files) && metadata.files.length === 1 && metadata.files[0] === "dist",
    "packed files metadata must contain only dist",
  );
  const peers = metadata.peerDependencies;
  assert(
    typeof peers === "object" &&
      peers !== null &&
      Object.keys(peers).length === 2 &&
      (peers as Record<string, unknown>)["@langchain/core"] === "1.2.9" &&
      (peers as Record<string, unknown>).langsmith === ">=0.5.0 <1.0.0",
    "packed optional peer dependencies are incorrect",
  );
  const peerMetadata = metadata.peerDependenciesMeta;
  assert(
    typeof peerMetadata === "object" &&
      peerMetadata !== null &&
      Object.keys(peerMetadata).length === 2 &&
      (peerMetadata as Record<string, { optional?: unknown }>)["@langchain/core"]?.optional ===
        true &&
      (peerMetadata as Record<string, { optional?: unknown }>).langsmith?.optional === true,
    "packed optional peer metadata is incorrect",
  );
  const exportsMap = metadata.exports;
  assert(
    typeof exportsMap === "object" && exportsMap !== null && !Array.isArray(exportsMap),
    "packed exports are missing",
  );
  const exportKeys = Object.keys(exportsMap as Record<string, unknown>);
  assert(
    exportKeys.length === 3 &&
      exportKeys.includes(".") &&
      exportKeys.includes("./langchain") &&
      exportKeys.includes("./resend"),
    "packed exports must expose only root, LangChain, and Resend entrypoints",
  );
  const expectedExports = {
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    "./langchain": { types: "./dist/langchain.d.ts", import: "./dist/langchain.js" },
    "./resend": { types: "./dist/resend.d.ts", import: "./dist/resend.js" },
  };
  assert(
    JSON.stringify(exportsMap) === JSON.stringify(expectedExports),
    "packed exports targets are incorrect",
  );
  return metadata;
}

function consumerSource(name: string): string {
  return `
const { createPrecall } = await import(${JSON.stringify(name)});
const analysis = {
  summary: "A useful summary",
  clarity: { level: "high", reason: "The request is clear" },
  facts: [], inferences: [], assumptions: [], unknowns: [], risks: [], discoveryQuestions: [],
  roadmap: { status: "available", phases: [{ name: "Next", purpose: "Proceed" }] },
  confidence: { level: "high", reason: "Enough information" },
};
const ai = { generateAnalysis: async ({ input }) => {
  if (input.fields.length !== 1 || input.fields[0].value !== "hello") throw new Error("unexpected input");
  return analysis;
} };
const precall = createPrecall({ ai, fields: [{ key: "message", label: "Message" }] });
const result = await precall.process({ submission: { message: "hello" } });
if (result.analysis.status !== "succeeded") throw new Error("processing did not succeed");
let sent = false;
const outcome = await precall.deliver({
  result, recipient: "consumer@example.com",
  transport: { send: async (request) => {
    if (request.recipient !== "consumer@example.com") throw new Error("wrong recipient");
    if (request.email.subject !== "Pre-Call Brief") throw new Error("wrong subject");
    sent = true;
  } },
});
if (!sent || outcome.status !== "sent") throw new Error("delivery did not succeed");
`;
}

function typeConsumerSource(name: string): string {
  return `
import type { PrecallConfig, AIAdapter, EmailTransport, PreCallResult, DeliveryOutcome } from ${JSON.stringify(name)};
const ai: AIAdapter = { generateAnalysis: async () => ({}) };
const transport: EmailTransport = { send: async (request) => { request.recipient; request.email.subject; } };
const config: PrecallConfig = { ai, fields: [{ key: "message", label: "Message" }] };
function consume(result: PreCallResult, outcome: DeliveryOutcome): void {
  result.analysis; outcome.status; config.fields; transport.send;
}
consume;
`;
}

function langchainConsumerSource(name: string): string {
  return `
const { createLangChainAIAdapter } = await import(${JSON.stringify(`${name}/langchain`)});
if (typeof createLangChainAIAdapter !== "function") throw new Error("LangChain export missing");
`;
}

function langchainTypeConsumerSource(name: string): string {
  return `
import { fakeModel } from "@langchain/core/testing";
import { createLangChainAIAdapter, type LangChainAIAdapterOptions } from ${JSON.stringify(`${name}/langchain`)};
const options: LangChainAIAdapterOptions = { model: fakeModel() };
createLangChainAIAdapter(options).generateAnalysis;
`;
}

function resendConsumerSource(name: string): string {
  return `
const { createResendEmailTransport } = await import(${JSON.stringify(`${name}/resend`)});
const transport = createResendEmailTransport({ apiKey: "test-key", from: "briefs@example.test" });
if (typeof transport.send !== "function") throw new Error("Resend export is unusable");
`;
}

function resendTypeConsumerSource(name: string): string {
  return `
import { createResendEmailTransport, type ResendEmailTransportOptions } from ${JSON.stringify(`${name}/resend`)};
const options: ResendEmailTransportOptions = { apiKey: "test-key", from: "briefs@example.test" };
createResendEmailTransport(options).send;
`;
}

async function localDistFiles(): Promise<string[]> {
  const files = await readdir(join(root, "dist"), { withFileTypes: true });
  assert(
    files.every((entry) => entry.isFile()),
    "dist must contain only flat runtime/declaration files",
  );
  return files.map((entry) => entry.name);
}

async function candidateTarball(packDirectory: string, supplied?: string): Promise<string> {
  if (supplied !== undefined) {
    const tarball = resolve(root, supplied);
    await readFile(tarball);
    return tarball;
  }
  const output = run(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", packDirectory],
    root,
  );
  const packed = parseJson<Array<{ filename?: unknown }>>(output, "npm pack output");
  assert(
    packed.length === 1 && typeof packed[0]?.filename === "string",
    "npm pack must create one tarball",
  );
  return resolve(packDirectory, packed[0].filename);
}

async function checkPackage(suppliedTarball?: string): Promise<void> {
  const distFiles = await localDistFiles();
  const temporaryRoot = await mkdtemp(join(tmpdir(), "precall-package-check-"));
  try {
    const packDirectory = join(temporaryRoot, "pack");
    const consumerDirectory = join(temporaryRoot, "consumer");
    const langchainConsumerDirectory = join(temporaryRoot, "langchain-consumer");
    const resendConsumerDirectory = join(temporaryRoot, "resend-consumer");
    await mkdir(packDirectory);
    await mkdir(consumerDirectory);
    await mkdir(langchainConsumerDirectory);
    await mkdir(resendConsumerDirectory);
    const tarball = await candidateTarball(packDirectory, suppliedTarball);
    const metadata = assertArchive(tarball, distFiles);
    const name = metadata.name as string;
    const tsc = resolve(root, "node_modules", ".bin", "tsc");

    await writeFile(
      join(consumerDirectory, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        dependencies: { [name]: `file:${relative(consumerDirectory, tarball)}` },
      }),
    );
    await writeFile(join(consumerDirectory, "consumer.mjs"), consumerSource(name));
    await writeFile(join(consumerDirectory, "types.ts"), typeConsumerSource(name));
    run("bun", ["install", "--offline", "--ignore-scripts"], consumerDirectory);
    run("node", ["consumer.mjs"], consumerDirectory);
    run("bun", ["consumer.mjs"], consumerDirectory);
    run(
      tsc,
      [
        "--noEmit",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        "--target",
        "ES2022",
        "--strict",
        "--skipLibCheck",
        "types.ts",
      ],
      consumerDirectory,
    );

    await writeFile(
      join(langchainConsumerDirectory, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        dependencies: {
          [name]: `file:${relative(langchainConsumerDirectory, tarball)}`,
          "@langchain/core": "1.2.9",
        },
      }),
    );
    await writeFile(
      join(langchainConsumerDirectory, "consumer.mjs"),
      langchainConsumerSource(name),
    );
    await writeFile(
      join(langchainConsumerDirectory, "types.ts"),
      langchainTypeConsumerSource(name),
    );
    run("bun", ["install", "--offline", "--ignore-scripts"], langchainConsumerDirectory);
    run("node", ["consumer.mjs"], langchainConsumerDirectory);
    run("bun", ["consumer.mjs"], langchainConsumerDirectory);
    run(
      tsc,
      [
        "--noEmit",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        "--target",
        "ES2022",
        "--strict",
        "--skipLibCheck",
        "types.ts",
      ],
      langchainConsumerDirectory,
    );

    await writeFile(
      join(resendConsumerDirectory, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        dependencies: { [name]: `file:${relative(resendConsumerDirectory, tarball)}` },
      }),
    );
    await writeFile(join(resendConsumerDirectory, "consumer.mjs"), resendConsumerSource(name));
    await writeFile(join(resendConsumerDirectory, "types.ts"), resendTypeConsumerSource(name));
    run("bun", ["install", "--offline", "--ignore-scripts"], resendConsumerDirectory);
    run("node", ["consumer.mjs"], resendConsumerDirectory);
    run("bun", ["consumer.mjs"], resendConsumerDirectory);
    run(
      tsc,
      [
        "--noEmit",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        "--target",
        "ES2022",
        "--strict",
        "--skipLibCheck",
        "types.ts",
      ],
      resendConsumerDirectory,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await checkPackage(process.argv[2]);
  process.stdout.write("Packed npm package contract passed.\n");
}

export { assertArchive, checkPackage };
