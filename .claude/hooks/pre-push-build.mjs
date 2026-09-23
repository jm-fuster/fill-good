// Hook PreToolUse: ningún `git push` sale sin que `npm run build:check` pase.
//
// Por qué existe: `main` despliega a producción en Vercel al recibir el push, y
// `tsc` + `lint` no son el build — no ven el prerenderizado de las rutas, la
// configuración legal ni el presupuesto de bundle. Antes de esto, un build roto
// se descubría en Vercel; ahora se descubre aquí, donde todavía se puede
// arreglar sin un commit de más.
//
// Va en Node y no en shell porque este entorno NO tiene `jq` (comprobado), que
// es con lo que se leen los hooks en los ejemplos al uso. Node sí está: es un
// proyecto Next.
//
// Lee el JSON del hook por stdin y contesta por stdout:
//   - no es un push  → nada, código 0 (el comando sigue su camino)
//   - build:check ok → {systemMessage} para que se vea que la puerta existe
//   - build:check ko → permissionDecision "deny" con la cola de la salida
//
// Compila la carpeta DESDE LA QUE se empuja (ver `pushesDe`), no la del hook.
//
// Ojo: solo ve los comandos que lanza Claude Code. Un `git push` escrito por ti
// en tu terminal no pasa por aquí.

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Raíz del repo: este fichero vive en <raíz>/.claude/hooks/. */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Cuántos caracteres de la salida del build se devuelven al fallar. */
const MAX_SALIDA = 3000;

function responder(objeto) {
  process.stdout.write(JSON.stringify(objeto));
}

function denegar(motivo) {
  responder({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: motivo,
    },
  });
}

/**
 * Parte un tramo en palabras respetando comillas simples y dobles. Marca las
 * que llevan algo que solo el shell sabe expandir (`$W`, `$env:X`, `%X%`,
 * `~`, comillas invertidas): con ellas no se puede saber a qué carpeta
 * apuntan, y el hook no adivina.
 */
function palabrasDe(tramo) {
  const palabras = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(tramo))) {
    const valor = m[1] ?? m[2] ?? m[3];
    const literal = m[2] !== undefined;
    const opaca = !literal && /[$%`]|^~/.test(valor);
    palabras.push({ valor, opaca });
  }
  return palabras;
}

/** `/c/Users/...` (Git Bash) → `C:/Users/...`, para que Node lo entienda. */
function rutaNativa(ruta) {
  const m = /^\/([a-zA-Z])(\/.*)?$/.exec(ruta);
  return m && process.platform === "win32" ? `${m[1].toUpperCase()}:${m[2] ?? "/"}` : ruta;
}

function resolverDir(base, ruta) {
  if (base === null) return null;
  const dir = path.resolve(base, rutaNativa(ruta));
  return existsSync(dir) && statSync(dir).isDirectory() ? dir : null;
}

/**
 * Qué `git push` hay en el comando y en QUÉ CARPETA se hace cada uno.
 *
 * Se parte por separadores y se mira cada tramo en orden, llevando la cuenta
 * de la carpeta actual: un `cd <ruta>` (o `Set-Location`/`Push-Location`) la
 * mueve para los tramos siguientes, y un `git -C <ruta> push` empuja desde
 * `<ruta>`. Hasta sep-2026 el build se hacía SIEMPRE en la carpeta del hook,
 * así que un push desde un worktree aparte —dos sesiones en paralelo sobre el
 * mismo repo— compilaba la carpeta principal y dejaba pasar sin comprobar lo
 * que de verdad se subía.
 *
 * Lo que decide si un tramo es un push es el SUBCOMANDO: la primera palabra
 * tras `git` que no sea una opción global (`-C <ruta>`, `-c clave=valor`…).
 * Así `git log --grep=push` y `git help push` no cuentan, ni el ensayo
 * (`--dry-run`, `-n`), que por definición no publica. (Antes se descartaba el
 * tramo si contenía `log` o `help` en cualquier sitio, y una rama
 * `fix/help-page` se saltaba la puerta.)
 *
 * Devuelve una entrada por push: `{ dir }` con la carpeta ya resuelta, o
 * `{ dir: null, pista }` cuando no se puede saber (una variable, un `cd -`):
 * eso se deniega, porque dejarlo pasar sería decir «build ok» sin saber qué
 * se ha compilado.
 */
export function pushesDe(comando, cwd) {
  const tramos = comando.split(/;|&&|\|\||\||\n/);
  let actual = cwd;
  const pushes = [];
  for (const tramo of tramos) {
    const palabras = palabrasDe(tramo);
    if (palabras.length === 0) continue;

    const orden = palabras[0].valor.toLowerCase();
    if (["cd", "set-location", "push-location", "pushd", "sl"].includes(orden)) {
      const destino = palabras.slice(1).find((p) => !p.valor.startsWith("-"));
      actual =
        !destino || destino.opaca || destino.valor === "-"
          ? null
          : resolverDir(actual, destino.valor);
      continue;
    }

    const i = palabras.findIndex((p) => /(^|[\\/])git(\.exe)?$/i.test(p.valor));
    if (i === -1) continue;
    let dir = actual;
    let pista = tramo.trim();
    let j = i + 1;
    while (j < palabras.length && palabras[j].valor.startsWith("-")) {
      const opcion = palabras[j].valor;
      // Opciones globales que llevan su valor en la palabra siguiente.
      if (["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(opcion)) {
        const valor = palabras[j + 1];
        if (opcion === "-C" && valor) {
          dir = valor.opaca ? null : resolverDir(dir, valor.valor);
          if (valor.opaca) pista = valor.valor;
        }
        j += 1;
      }
      j += 1;
    }
    if (palabras[j]?.valor !== "push") continue;
    if (palabras.slice(j + 1).some((p) => p.valor === "--dry-run" || p.valor === "-n")) {
      continue;
    }
    pushes.push(dir === null ? { dir: null, pista } : { dir });
  }
  return pushes;
}

/** ¿Este comando empuja al remoto? (La carpeta da igual aquí.) */
export function esPush(comando) {
  return pushesDe(comando, process.cwd()).length > 0;
}

/** Raíz del repo o worktree que contiene `dir`, o null si no es un repo. */
function raizDe(dir) {
  const r = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  return r.status === 0 ? path.resolve(r.stdout.trim()) : null;
}

async function leerStdin() {
  const trozos = [];
  for await (const trozo of process.stdin) trozos.push(trozo);
  return Buffer.concat(trozos).toString("utf8");
}

async function main() {
  const crudo = await leerStdin();

  let entrada;
  try {
    entrada = JSON.parse(crudo);
  } catch {
    // Sin poder leer la entrada no se sabe si esto era un push, así que no se
    // bloquea: un fallo del propio hook no debe dejar el repo sin empujar.
    return;
  }

  const comando = entrada?.tool_input?.command;
  if (typeof comando !== "string") return;
  // La carpeta desde la que corre el comando la manda Claude Code en `cwd`;
  // sin ella, la del repo del hook, que es lo que se hacía antes.
  const cwd = typeof entrada?.cwd === "string" ? entrada.cwd : REPO;
  const pushes = pushesDe(comando, cwd);
  if (pushes.length === 0) return;

  const opaco = pushes.find((p) => p.dir === null);
  if (opaco) {
    denegar(
      `No sé desde qué carpeta se hace este push (\`${opaco.pista}\`): lleva ` +
        `una variable o un \`cd\` que el hook no puede resolver, así que no ` +
        `puede compilar lo que se va a subir. Repite el push con la ruta ` +
        `escrita tal cual (\`git -C <ruta> push …\`).`,
    );
    return;
  }

  const raices = [];
  for (const { dir } of pushes) {
    const raiz = raizDe(dir);
    if (!raiz) {
      denegar(`\`${dir}\` no es un repositorio git: no hay nada que compilar ni que empujar.`);
      return;
    }
    if (!raices.includes(raiz)) raices.push(raiz);
  }

  for (const raiz of raices) {
    if (!existsSync(path.join(raiz, "node_modules"))) {
      denegar(
        `El push sale de \`${raiz}\`, que no tiene \`node_modules\`, así que ` +
          `no se puede comprobar el build. Instala las dependencias ahí con ` +
          `\`npm ci\` (un enlace a las de otra carpeta no vale: Turbopack lo ` +
          `rechaza) y vuelve a empujar.`,
      );
      return;
    }

    const resultado = spawnSync("npm run build:check", {
      cwd: raiz,
      // `shell: true` es obligatorio en Windows: `npm` es `npm.cmd` y sin shell
      // spawnSync no lo encuentra (ENOENT). El comando es fijo, no lleva nada
      // que venga de fuera; la carpeta va en `cwd`, no en el comando.
      shell: true,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });

    if (resultado.error || resultado.status === null) {
      // Si la comprobación no ha podido ni correr, tampoco se ha comprobado
      // nada: dejar pasar el push sería decir «build ok» sin haberlo mirado.
      denegar(
        `No se ha podido ejecutar \`npm run build:check\` en ${raiz}, así que ` +
          `el push queda bloqueado sin haber comprobado el build: ` +
          `${resultado.error?.message ?? "el proceso no devolvió código de salida"}. ` +
          `Cuéntaselo al usuario en vez de reintentar el push.`,
      );
      return;
    }

    if (resultado.status !== 0) {
      const salida = `${resultado.stdout ?? ""}${resultado.stderr ?? ""}`.trimEnd();
      denegar(
        `\`npm run build:check\` ha fallado en ${raiz} (código ${resultado.status}), ` +
          `así que el push queda bloqueado. Arregla el build y vuelve a ` +
          `intentarlo; no lo esquives. Cola de la salida:\n\n${salida.slice(-MAX_SALIDA)}`,
      );
      return;
    }
  }

  responder({
    systemMessage: `build:check OK en ${raices.join(", ")} — push permitido`,
  });
}

// Solo arranca al ejecutarse como script. Sin esta guarda, importar `esPush`
// para comprobarla se quedaría colgado esperando stdin.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
