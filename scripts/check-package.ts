import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PackageMetadata = {
  name?: unknown;
  private?: unknown;
  exports?: unknown;
  files?: unknown;
  peerDependencies?: unknown;
  peerDependenciesMeta?: unknown;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

function parseJson<T>(value: string, description: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`${description} is not valid JSON`, { cause: error });
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertArchive(tarball: string): PackageMetadata {
  const entries = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const required = [
    "package/package.json",
    "package/dist/index.js",
    "package/dist/index.d.ts",
    "package/dist/langchain.js",
    "package/dist/langchain.d.ts",
  ];
  for (const entry of required)
    assert(entries.includes(entry), `packed artifact is missing ${entry}`);

  const forbidden =
    /(?:^|\/)(?:src|test|tests|docs|consumer|consumers|tmp|temp)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:mp4|mov|mkv|avi|webm)$/iu;
  const unexpected = entries.filter((entry) => forbidden.test(entry));
  assert(
    unexpected.length === 0,
    `packed artifact contains forbidden paths: ${unexpected.join(", ")}`,
  );

  const packageJson = execFileSync("tar", ["-xOzf", tarball, "package/package.json"], {
    encoding: "utf8",
  });
  const metadata = parseJson<PackageMetadata>(packageJson, "packed package metadata");
  assert(metadata.private === true, "packed package must remain private");
  assert(
    typeof metadata.name === "string" && metadata.name.length > 0,
    "packed package name is missing",
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
  assert(
    typeof metadata.exports === "object" && metadata.exports !== null,
    "packed exports metadata is missing",
  );
  const exportsMap = metadata.exports as Record<string, unknown>;
  assert(
    Object.keys(exportsMap).length === 2 &&
      Object.hasOwn(exportsMap, ".") &&
      Object.hasOwn(exportsMap, "./langchain"),
    "packed exports must expose only the root and LangChain entrypoints",
  );
  const rootExport = exportsMap["."];
  assert(typeof rootExport === "object" && rootExport !== null, "packed root export is missing");
  const exportRecord = rootExport as Record<string, unknown>;
  assert(
    exportRecord.import === "./dist/index.js",
    "packed import export must target dist/index.js",
  );
  assert(
    exportRecord.types === "./dist/index.d.ts",
    "packed type export must target dist/index.d.ts",
  );
  const langchainExport = exportsMap["./langchain"];
  assert(
    typeof langchainExport === "object" && langchainExport !== null,
    "packed LangChain export is missing",
  );
  const langchainRecord = langchainExport as Record<string, unknown>;
  assert(
    langchainRecord.import === "./dist/langchain.js",
    "packed LangChain import export must target dist/langchain.js",
  );
  assert(
    langchainRecord.types === "./dist/langchain.d.ts",
    "packed LangChain type export must target dist/langchain.d.ts",
  );
  return metadata;
}

function consumerSource(packageName: string): string {
  return `
const { createPrecall } = await import(${JSON.stringify(packageName)});
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
  result,
  recipient: "consumer@example.com",
  transport: { send: async (request) => {
    if (request.recipient !== "consumer@example.com") throw new Error("wrong recipient");
    if (request.email.subject !== "Pre-Call Brief") throw new Error("wrong subject");
    sent = true;
  } },
});
if (!sent || outcome.status !== "sent") throw new Error("delivery did not succeed");
`;
}

function typeConsumerSource(packageName: string): string {
  return `
import type { PrecallConfig, AIAdapter, EmailTransport, PreCallResult, DeliveryOutcome } from ${JSON.stringify(packageName)};
const ai: AIAdapter = { generateAnalysis: async () => ({}) };
const transport: EmailTransport = { send: async (request) => { request.recipient; request.email.subject; } };
const config: PrecallConfig = { ai, fields: [{ key: "message", label: "Message" }] };
function consume(result: PreCallResult, outcome: DeliveryOutcome): void {
  result.analysis;
  outcome.status;
  config.fields;
  transport.send;
}
consume;
`;
}

function langchainConsumerSource(packageName: string): string {
  return `
const { createLangChainAIAdapter } = await import(${JSON.stringify(`${packageName}/langchain`)});
if (typeof createLangChainAIAdapter !== "function") throw new Error("LangChain export missing");
`;
}

function langchainTypeConsumerSource(packageName: string): string {
  return `
import { fakeModel } from "@langchain/core/testing";
import {
  createLangChainAIAdapter,
  type LangChainAIAdapterOptions,
} from ${JSON.stringify(`${packageName}/langchain`)};
const options: LangChainAIAdapterOptions = { model: fakeModel() };
const adapter = createLangChainAIAdapter(options);
adapter.generateAnalysis;
`;
}

async function checkPackage(): Promise<void> {
  const distFiles = [
    join(root, "dist", "index.js"),
    join(root, "dist", "index.d.ts"),
    join(root, "dist", "langchain.js"),
    join(root, "dist", "langchain.d.ts"),
  ];
  for (const file of distFiles) await readFile(file);

  const temporaryRoot = await mkdtemp(join(tmpdir(), "precall-package-check-"));
  try {
    const packDirectory = join(temporaryRoot, "pack");
    const consumerDirectory = join(temporaryRoot, "consumer");
    const langchainConsumerDirectory = join(temporaryRoot, "langchain-consumer");
    await mkdir(packDirectory);
    await mkdir(consumerDirectory);
    await mkdir(langchainConsumerDirectory);

    run("bun", ["pm", "pack", "--destination", packDirectory, "--ignore-scripts"], root);
    const packedFiles = (await readdir(packDirectory)).filter((file) => file.endsWith(".tgz"));
    assert(packedFiles.length === 1, "bun pm pack must create exactly one tarball");
    const tarball = join(packDirectory, packedFiles[0] as string);
    const metadata = assertArchive(tarball);
    const packageName = metadata.name as string;
    const dependencyPath = relative(consumerDirectory, tarball);
    await writeFile(
      join(consumerDirectory, "package.json"),
      JSON.stringify(
        {
          private: true,
          type: "module",
          dependencies: { [packageName]: `file:${dependencyPath}` },
        },
        null,
        2,
      ),
    );
    await writeFile(join(consumerDirectory, "consumer.mjs"), consumerSource(packageName));
    await writeFile(join(consumerDirectory, "types.ts"), typeConsumerSource(packageName));

    run("bun", ["install", "--offline", "--ignore-scripts"], consumerDirectory);
    run("node", ["consumer.mjs"], consumerDirectory);
    run("bun", ["consumer.mjs"], consumerDirectory);

    const tsc = resolve(root, "node_modules", ".bin", "tsc");
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
    const langchainDependencyPath = relative(langchainConsumerDirectory, tarball);
    await writeFile(
      join(langchainConsumerDirectory, "package.json"),
      JSON.stringify(
        {
          private: true,
          type: "module",
          dependencies: {
            [packageName]: `file:${langchainDependencyPath}`,
            "@langchain/core": "1.2.9",
          },
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(langchainConsumerDirectory, "consumer.mjs"),
      langchainConsumerSource(packageName),
    );
    await writeFile(
      join(langchainConsumerDirectory, "types.ts"),
      langchainTypeConsumerSource(packageName),
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
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await checkPackage();
  process.stdout.write("Packed package contract passed.\n");
}

export { checkPackage };
