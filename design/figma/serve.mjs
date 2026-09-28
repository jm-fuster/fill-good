// Servidor local para el bridge de figma-console. Figma no lee el disco: el
// plugin hace fetch a http://localhost:9232 (su manifiesto permite localhost en
// los puertos 9223-9232) y ejecuta lo que recibe. Solo sirve plugin/*.js y
// data/*.json de esta carpeta, y solo en 127.0.0.1.
//
//   npm run figma:serve
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const PORT = 9232;
const ALLOWED = { plugin: ".js", data: ".json" };

createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const [folder, file] = req.url.split("?")[0].replace(/^\/+/, "").split("/");
  const ext = ALLOWED[folder];
  const path = ext && file && file.endsWith(ext) ? join(DIR, folder, basename(file)) : null;
  if (!path || !existsSync(path)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "Content-Type": ext === ".js" ? "text/javascript" : "application/json" });
  res.end(readFileSync(path));
}).listen(PORT, "127.0.0.1", () => console.log(`Sirviendo design/figma en http://localhost:${PORT}`));
