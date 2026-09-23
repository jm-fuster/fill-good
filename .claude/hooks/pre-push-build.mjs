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
// Ojo: solo ve los comandos que lanza Claude Code. Un `git push` escrito por ti
// en tu terminal no pasa por aquí.

import { spawnSync } from "node:child_process";
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
 * ¿Este comando empuja al remoto?
 *
 * Se parte por separadores y se busca `git` y `push` en el MISMO tramo, en vez
 * de casar la forma exacta de la orden: así entran `git push`, `git -C <ruta>
 * push`, `git push --force-with-lease` y un `npm test && git push` (que un
 * filtro por prefijo se dejaría fuera, y es justo el caso en el que más duele).
 *
 * Lo que decide es el SUBCOMANDO: la primera palabra tras `git` que no sea una
 * opción global (`-C <ruta>`, `-c clave=valor`…). Así `git log --grep=push` y
 * `git help push` no cuentan, ni el ensayo (`--dry-run`, `-n`), que por
 * definición no publica. Antes se descartaba el tramo entero si contenía `log`
 * o `help` en cualquier sitio, así que `git push origin fix/help-page` o una
 * rama `log-rotacion` se saltaban la puerta sin que nadie lo pidiera.
 */
export function esPush(comando) {
  const tramos = comando.split(/;|&&|\|\||\||\n/);
  return tramos.some((tramo) => {
    const palabras = tramo.trim().split(/\s+/);
    const i = palabras.findIndex((p) => /(^|[\\/])git(\.exe)?$/.test(p));
    if (i === -1) return false;
    let j = i + 1;
    while (j < palabras.length && palabras[j].startsWith("-")) {
      // Opciones globales que llevan su valor en la palabra siguiente.
      if (["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(palabras[j])) {
        j += 1;
      }
      j += 1;
    }
    if (palabras[j] !== "push") return false;
    return !palabras.slice(j + 1).some((p) => p === "--dry-run" || p === "-n");
  });
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
  if (typeof comando !== "string" || !esPush(comando)) return;

  const resultado = spawnSync("npm run build:check", {
    cwd: REPO,
    // `shell: true` es obligatorio en Windows: `npm` es `npm.cmd` y sin shell
    // spawnSync no lo encuentra (ENOENT). El comando es fijo, no lleva nada
    // que venga de fuera.
    shell: true,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

  if (resultado.error || resultado.status === null) {
    // Si la comprobación no ha podido ni correr, tampoco se ha comprobado
    // nada: dejar pasar el push sería decir «build ok» sin haberlo mirado.
    denegar(
      `No se ha podido ejecutar \`npm run build:check\` en ${REPO}, así que ` +
        `el push queda bloqueado sin haber comprobado el build: ` +
        `${resultado.error?.message ?? "el proceso no devolvió código de salida"}. ` +
        `Cuéntaselo al usuario en vez de reintentar el push.`,
    );
    return;
  }

  if (resultado.status === 0) {
    responder({ systemMessage: "build:check OK — push permitido" });
    return;
  }

  const salida = `${resultado.stdout ?? ""}${resultado.stderr ?? ""}`.trimEnd();
  denegar(
    `\`npm run build:check\` ha fallado (código ${resultado.status}), así que ` +
      `el push queda bloqueado. Arregla el build y vuelve a intentarlo; no lo ` +
      `esquives. Cola de la salida:\n\n${salida.slice(-MAX_SALIDA)}`,
  );
}

// Solo arranca al ejecutarse como script. Sin esta guarda, importar `esPush`
// para comprobarla se quedaría colgado esperando stdin.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
