/**
 * Reports what is deployed and whether it is healthy, without needing Vercel access.
 *
 * Vercel's dashboard belongs to the repository owner, but Vercel publishes every build to
 * GitHub's deployments API, and production is reachable over HTTP. Between them these
 * cover what the dashboard would show: which commit is live, whether its build passed,
 * and whether the site is actually serving.
 *
 *   npm run deploy:status
 */
import { execFileSync } from "node:child_process";

const REPO = "ralphgmorente/fair-tips";
const SITE = "https://fair-tips.vercel.app";

function gh(path: string): unknown {
  const out = execFileSync("gh", ["api", path], { encoding: "utf8" });
  return JSON.parse(out);
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

async function probe(path: string) {
  try {
    const response = await fetch(`${SITE}${path}`, { redirect: "follow" });
    const body = await response.text();
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: String(error) };
  }
}

async function main() {
  const deployments = gh(`repos/${REPO}/deployments?per_page=1`) as Array<{
    id: number;
    sha: string;
    created_at: string;
  }>;

  if (!deployments.length) {
    console.log("No deployments found.");
    return;
  }

  const [latest] = deployments;
  const statuses = gh(`repos/${REPO}/deployments/${latest.id}/statuses`) as Array<{
    state: string;
    description: string;
    created_at: string;
  }>;
  const state = statuses[0]?.state ?? "unknown";

  let subject = "(unknown commit)";
  try {
    subject = git("log", "-1", "--format=%s", latest.sha);
  } catch {
    // The commit may not exist locally yet; the sha alone is still useful.
  }

  const localHead = git("rev-parse", "HEAD");
  const inSync = localHead === latest.sha;

  console.log(`deployed commit : ${latest.sha.slice(0, 7)}  ${subject}`);
  console.log(`build state     : ${state}`);
  console.log(`deployed at     : ${latest.created_at}`);
  console.log(`local HEAD      : ${localHead.slice(0, 7)}${inSync ? "  (in sync)" : "  (AHEAD — not deployed yet)"}`);

  const home = await probe("/");
  const login = await probe("/login");
  const keepalive = await probe("/api/keepalive");

  const homeOk = home.status === 200;
  const loginOk = login.status === 200 && login.body.includes("Manager sign in");
  const dbOk = keepalive.status === 200;

  console.log(`\nproduction      : HTTP ${home.status} ${homeOk ? "ok" : "FAILING"}`);
  console.log(`login page      : ${loginOk ? "renders the sign-in form" : "NOT rendering the form"}`);
  console.log(`database        : ${dbOk ? "reachable (project awake)" : "unreachable or paused"}`);

  if (!homeOk || !loginOk || !dbOk) {
    console.log("\nTo roll back without Vercel access:  git revert <bad sha> && git push");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
