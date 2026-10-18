import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { arch, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ACTIONLINT_VERSION = "1.7.12";
const ZIZMOR_VERSION = "1.30.1";

type Release = Readonly<{ asset: string; sha256: string }>;
type Tool = Readonly<{
  name: string;
  version: string;
  url: (asset: string) => string;
  releases: Readonly<Record<string, Release>>;
}>;

const actionlint: Tool = {
  name: "actionlint",
  version: ACTIONLINT_VERSION,
  url: (asset) =>
    `https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/${asset}`,
  // Published in the matching actionlint GitHub release's checksums asset.
  releases: {
    "darwin-arm64": {
      asset: `actionlint_${ACTIONLINT_VERSION}_darwin_arm64.tar.gz`,
      sha256: "aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f",
    },
    "darwin-x64": {
      asset: `actionlint_${ACTIONLINT_VERSION}_darwin_amd64.tar.gz`,
      sha256: "5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644",
    },
    "linux-arm64": {
      asset: `actionlint_${ACTIONLINT_VERSION}_linux_arm64.tar.gz`,
      sha256: "325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6",
    },
    "linux-x64": {
      asset: `actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz`,
      sha256: "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
    },
  },
};

const zizmor: Tool = {
  name: "zizmor",
  version: ZIZMOR_VERSION,
  url: (asset) =>
    `https://github.com/zizmorcore/zizmor/releases/download/v${ZIZMOR_VERSION}/${asset}`,
  // The asset digests GitHub records on the matching zizmor release.
  releases: {
    "darwin-arm64": {
      asset: "zizmor-aarch64-apple-darwin.tar.gz",
      sha256: "e28d22b087f9ebb8d99da6e740d348c930f559961c7c3f12badda54f882195a2",
    },
    "darwin-x64": {
      asset: "zizmor-x86_64-apple-darwin.tar.gz",
      sha256: "10e6b18b11ea07e515a16f0f0518c7b07527bc9977c1fd5698181ce7f3554202",
    },
    "linux-arm64": {
      asset: "zizmor-aarch64-unknown-linux-gnu.tar.gz",
      sha256: "7ff1dce33bdd18fd2a4affe63bdd47efcccca97b2cec1c1863ec26e9e2647540",
    },
    "linux-x64": {
      asset: "zizmor-x86_64-unknown-linux-gnu.tar.gz",
      sha256: "e65324f4430c2717591937edcec90ccbefaf14c174f8ec9415e03ca875b46e1a",
    },
  },
};

const repositoryRoot = resolve(import.meta.dirname, "../..");

type CommandResult = Readonly<{
  code: number;
  stderr: string;
  stdout: string;
}>;

function run(command: string, args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    child.stderr.setEncoding("utf8");
    child.stdout.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolveRun({ code: code ?? 1, stderr, stdout }));
  });
}

async function fileExists(path: string) {
  return readFile(path).then(
    () => true,
    () => false,
  );
}

async function toolBinary(tool: Tool) {
  const target = `${platform()}-${arch()}`;
  const release = Object.hasOwn(tool.releases, target) ? tool.releases[target] : undefined;
  if (release === undefined) {
    throw new Error(`${tool.name} ${tool.version} is not pinned for ${target}`);
  }

  const installDirectory = resolve(
    repositoryRoot,
    ".artifacts/tools",
    tool.name,
    tool.version,
    target,
  );
  const binary = join(installDirectory, tool.name);
  if (!(await fileExists(binary))) {
    await mkdir(installDirectory, { recursive: true });
    const url = tool.url(release.asset);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not download ${url}: HTTP ${response.status}`);
    }
    const archive = Buffer.from(await response.arrayBuffer());
    const actualSha256 = createHash("sha256").update(archive).digest("hex");
    if (actualSha256 !== release.sha256) {
      throw new Error(
        `${release.asset} checksum mismatch: expected ${release.sha256}, got ${actualSha256}`,
      );
    }
    const archivePath = join(installDirectory, release.asset);
    await writeFile(archivePath, archive);
    const extracted = await run("tar", ["-xzf", archivePath, "-C", installDirectory, tool.name]);
    if (extracted.code !== 0) {
      throw new Error(`Could not extract ${tool.name}:\n${extracted.stderr}${extracted.stdout}`);
    }
    await chmod(binary, 0o755);
  }

  const version = await run(binary, ["--version"]);
  if (version.code !== 0 || !version.stdout.includes(tool.version)) {
    throw new Error(`Unexpected ${tool.name} binary:\n${version.stderr}${version.stdout}`);
  }
  return binary;
}

// Offline: the online audits need a token and the network, and the pin check
// above already covers what they would add for this repository.
const zizmorArguments = ["--offline", "--no-progress", "--format", "plain"] as const;

async function workflowPaths() {
  const directory = resolve(repositoryRoot, ".github/workflows");
  return (await readdir(directory))
    .filter((path) => /\.ya?ml$/.test(path))
    .toSorted()
    .map((path) => join(".github/workflows", path));
}

async function checkPinnedUses(paths: readonly string[]) {
  const failures: string[] = [];
  for (const path of paths) {
    const source = await readFile(resolve(repositoryRoot, path), "utf8");
    for (const [index, line] of source.split("\n").entries()) {
      if (!/^\s*(?:-\s*)?uses:/.test(line)) continue;
      const match = /^\s*(?:-\s*)?uses:\s*["']?([^\s"'#]+)["']?(?:\s+#.*)?$/.exec(line);
      const reference = match?.[1];
      if (reference === undefined) {
        failures.push(`${path}:${index + 1}: unsupported action reference syntax`);
        continue;
      }
      if (reference.startsWith("./")) continue;
      const revision = reference.slice(reference.lastIndexOf("@") + 1);
      if (!/^[0-9a-f]{40}$/.test(revision)) {
        failures.push(
          `${path}:${index + 1}: external uses reference is not pinned to a full commit SHA: ${reference}`,
        );
      }
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

async function proveFailureControls(actionlintPath: string, zizmorPath: string) {
  const directory = await mkdtemp(join(tmpdir(), "workflow-controls-"));
  const invalid = join(directory, "invalid.yml");
  const injection = join(directory, "injection.yml");
  try {
    await writeFile(
      invalid,
      `name: Deliberately invalid actionlint control\n` +
        `on: push\n` +
        `jobs:\n` +
        `  broken:\n` +
        `    needs: missing-job\n` +
        `    runs-on: ubuntu-latest\n` +
        `    steps:\n` +
        `      - run: echo control\n`,
    );
    const invalidResult = await run(actionlintPath, [invalid]);
    const invalidOutput = `${invalidResult.stderr}${invalidResult.stdout}`;
    if (invalidResult.code === 0 || !invalidOutput.includes('job "missing-job"')) {
      throw new Error(
        `actionlint did not reject the controlled missing-job dependency:\n${invalidOutput}`,
      );
    }

    await writeFile(
      injection,
      `name: Deliberately unsafe zizmor control\n` +
        `on: pull_request\n` +
        `permissions: {}\n` +
        `jobs:\n` +
        `  unsafe:\n` +
        `    runs-on: ubuntu-latest\n` +
        `    steps:\n` +
        `      - run: echo "\${{ github.event.pull_request.title }}"\n`,
    );
    const injectionResult = await run(zizmorPath, [...zizmorArguments, "--no-config", injection]);
    const injectionOutput = `${injectionResult.stderr}${injectionResult.stdout}`;
    if (injectionResult.code === 0 || !injectionOutput.includes("template-injection")) {
      throw new Error(
        `zizmor did not reject the controlled template injection:\n${injectionOutput}`,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const paths = await workflowPaths();
await checkPinnedUses(paths);
const actionlintPath = await toolBinary(actionlint);
const actionlintResult = await run(actionlintPath, paths);
if (actionlintResult.code !== 0) {
  throw new Error(
    `actionlint rejected repository workflows:\n${actionlintResult.stderr}${actionlintResult.stdout}`,
  );
}
const zizmorPath = await toolBinary(zizmor);
const zizmorResult = await run(zizmorPath, [
  ...zizmorArguments,
  "--config",
  ".github/zizmor.yml",
  ...paths,
]);
if (zizmorResult.code !== 0) {
  throw new Error(
    `zizmor found security problems in repository workflows:\n${zizmorResult.stderr}${zizmorResult.stdout}`,
  );
}
await proveFailureControls(actionlintPath, zizmorPath);

console.log(
  `PASS · actionlint ${ACTIONLINT_VERSION} accepted ${paths.length} workflows; every external uses reference has a full commit SHA`,
);
console.log(
  `PASS · zizmor ${ZIZMOR_VERSION} found no security problems in ${paths.length} workflows`,
);
console.log("PASS · a deliberate missing-job dependency and a template injection are rejected");
