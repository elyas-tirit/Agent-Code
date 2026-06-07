// Diagnostic: run a tiny real query and dump the raw usage/account data the SDK
// exposes, so we can wire the Session % to the correct field. Uses your login.
import { query } from "@anthropic-ai/claude-agent-sdk";

const CLAUDE = "/opt/homebrew/bin/claude";

const q = query({
  prompt: "Rispondi con una sola parola: ok",
  options: {
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    pathToClaudeCodeExecutable: CLAUDE,
  },
});

let gotRate = false;
for await (const m of q) {
  if (m.type === "rate_limit_event") {
    gotRate = true;
    console.log("RATE_LIMIT_INFO =", JSON.stringify(m.rate_limit_info));
  } else if (m.type === "system" && m.subtype === "init") {
    console.log("INIT_KEYS =", Object.keys(m).join(","));
  } else if (m.type === "result") {
    console.log("RESULT_USAGE =", JSON.stringify(m.usage));
    console.log("RESULT_KEYS =", Object.keys(m).join(","));
    try {
      const acct = await q.accountInfo?.();
      console.log("ACCOUNT_INFO =", JSON.stringify(acct));
    } catch (e) {
      console.log("ACCOUNT_ERR =", e?.message);
    }
  }
}
console.log("GOT_RATE_EVENT =", gotRate);
