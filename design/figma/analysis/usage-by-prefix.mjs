// Cómo usa el código cada token de color (prefijo de la utilidad), para derivar
// los scopes de Figma del uso real y no del nombre.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, extname } from "node:path";
const ROOT = fileURLToPath(new URL("../../../src/", import.meta.url));
const tokens = ["background","foreground","card","card-foreground","popover","popover-foreground","primary","primary-foreground","secondary","secondary-foreground","muted","muted-foreground","accent","accent-foreground","destructive","destructive-foreground","success","success-foreground","warning","warning-foreground","border","input","ring","chart-1","chart-2","chart-3","chart-4","chart-5","price","sidebar","sidebar-foreground","sidebar-primary","sidebar-primary-foreground","sidebar-accent","sidebar-accent-foreground","sidebar-border","sidebar-ring"];
const prefixes = ["bg","text","border","border-t","border-b","border-l","border-r","ring","ring-offset","outline","fill","stroke","from","to","via","divide","placeholder","decoration","caret","accent","shadow"];
const walk = (d, a = []) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, a);
    else if ([".ts", ".tsx"].includes(extname(p))) a.push(p);
  }
  return a;
};
const usage = Object.fromEntries(tokens.map(t => [t, {}]));
const tokAlt = [...tokens].sort((a, b) => b.length - a.length).join("|");
const re = new RegExp(`(?<![\w-])(${prefixes.sort((a,b)=>b.length-a.length).join("|")})-(${tokAlt})(?:\/(\d+|\[[^\]]+\]))?(?![\w-])`, "g");
for (const f of walk(ROOT)) {
  if (f.includes("registry")) continue;
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(re)) {
    const [, pre, tok] = m;
    usage[tok][pre] = (usage[tok][pre] ?? 0) + 1;
  }
}
for (const [t, u] of Object.entries(usage)) console.log(t.padEnd(28), JSON.stringify(u));
