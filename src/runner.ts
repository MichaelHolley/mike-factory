import { execFile } from "node:child_process";
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExecutionEnv } from "@earendil-works/pi-durable/env";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { acceptHostKey, connectSsh, RemoteExecutionEnv, scanHostKey, type SshTarget } from "@earendil-works/pi-env";

const execFileAsync = promisify(execFile);

/** On the volume both containers mount; the runner's `docker/sshd_config` reads it. */
const AUTHORIZED_KEYS = "/ssh/authorized_keys";

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** Where the agent's tools, and every command on its repos, run. */
export interface Workspace {
  env: (cwd: string) => ExecutionEnv;
  close: () => void;
}

/** In the runner container over SSH when `runnerHost` is set, otherwise in this process. */
export async function openWorkspace(opts: {
  runnerHost?: string;
  dataDir: string;
  gitIdentity: { name: string; email: string };
}): Promise<Workspace> {
  const { name, email } = opts.gitIdentity;
  // Env instead of `git config --global`, so local dev never rewrites the developer's git identity.
  const shellEnv: Record<string, string> = {
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
  };
  // Runner commands see only sshd's minimal environment, not the image's `ENV`. `NODE_ENV` stays out so checks
  // install devDependencies.
  for (const key of ["pnpm_config_store_dir", "COREPACK_HOME"]) {
    const value = process.env[key];
    if (value) shellEnv[key] = value;
  }

  if (!opts.runnerHost) return { env: (cwd) => new NodeExecutionEnv({ cwd, shellEnv }), close: () => {} };
  // Connects now, so a changed host key fails startup; the connection reconnects by itself after that.
  const { connection } = await connectSsh(await trustRunner(opts.runnerHost, join(opts.dataDir, "ssh")));
  return {
    env: (cwd) => new RemoteExecutionEnv({ connection, id: "pi-env:runner", cwd, shellEnv }),
    close: () => connection.close(),
  };
}

/** Keeps the private key and the trusted host key with the server; only the public key reaches the runner. */
async function trustRunner(host: string, sshDir: string): Promise<SshTarget> {
  const target = {
    host,
    user: "agent",
    port: 2222,
    identityFile: join(sshDir, "id_ed25519"),
    knownHostsFile: join(sshDir, "known_hosts"),
    hostKeyAlias: "mike-factory-runner",
  } satisfies SshTarget;
  const publicKey = `${target.identityFile}.pub`;
  if (!(await exists(publicKey))) {
    await mkdir(sshDir, { recursive: true, mode: 0o700 });
    // A crash between the two key files would leave a private key that `ssh-keygen` refuses to overwrite.
    await rm(target.identityFile, { force: true });
    await execFileAsync("ssh-keygen", [
      "-q",
      "-t",
      "ed25519",
      "-N",
      "",
      "-C",
      "mike-factory",
      "-f",
      target.identityFile,
    ]);
  }
  await writeFile(AUTHORIZED_KEYS, await readFile(publicKey));
  // sshd refuses a key file others can write, and `writeFile`'s mode only applies when it creates the file.
  await chmod(AUTHORIZED_KEYS, 0o600);
  // Trust on first use: the runner holds no secrets and sits on the stack's private network.
  if (!(await exists(target.knownHostsFile))) await acceptHostKey(target, (await scanHostKey(target)).lines);
  return target;
}
