# Seguridad

Fill Good está en producción y guarda datos de hogares reales: qué tienen en
casa, qué compran, dónde y a qué precio. Si encuentras un fallo de seguridad,
avísame en privado antes de contarlo en ningún otro sitio.

## Cómo avisar

Desde la pestaña **Security** de este repositorio, con el botón
**Report a vulnerability**. El aviso llega en privado y solo lo vemos tú y yo.
Si no puedes usar GitHub, escribe al contacto que figura en la
[política de privacidad](https://fillgood.jorgemolinafuster.com/privacidad).

No abras un issue público ni lo comentes en una pull request.

Para poder reproducirlo, cuéntame:

- qué pantalla, ruta o fichero está afectado;
- los pasos, con las peticiones si las tienes;
- qué puede conseguir quien lo aproveche.

## Qué esperar

Es un proyecto de una sola persona: no hay nadie de guardia ni recompensas
económicas. Intento contestar en menos de una semana. Si el fallo se confirma,
lo arreglo según su gravedad y, cuando el arreglo esté desplegado, publico un
aviso en GitHub con tu nombre, si quieres que aparezca.

Solo se mantiene lo que está desplegado desde `main`. No hay versiones
publicadas ni ramas antiguas con soporte.

## Lo que más importa

Cada hogar está aislado con Row Level Security en Postgres. Salvo tres
excepciones de servidor (los dos crones, el webhook de Alexa y el contador de
cuota de IA, que usan la clave de servicio), todo el acceso a la base pasa por
esas políticas con el token de la persona. Lo más grave que se puede encontrar
es cualquier forma de leer o cambiar datos de un hogar al que no perteneces:
una política que se deja un caso, una función `SECURITY DEFINER` sin guarda o
una Server Action que se fía de un id que manda el navegador.

También interesan los endpoints que no pasan por la sesión de Clerk:
`/api/alexa` (lo protege la firma de Amazon), `/api/push/caducidades` y
`/api/push/resumen` (el secreto del cron) y `/api/csp-report`.

## Pautas para investigar

- Usa tus propias cuentas. Para probar el aislamiento entre hogares, crea dos.
- Si llegas a ver datos de otra persona, para ahí, no los guardes y avísame.
- Nada de pruebas de denegación de servicio, spam ni ingeniería social.
- No agotes la cuota de IA: la app usa el plan gratuito de Gemini, que
  comparten todos los hogares, y si se acaba deja de funcionar para todos.
- Dame tiempo a corregirlo antes de publicarlo: 90 días, o menos si ya está
  arreglado.

No emprenderé acciones legales contra quien investigue de buena fe dentro de
estas pautas y me avise en privado.

## Lo que no es un fallo

- Las claves que viajan al navegador (la publicable de Supabase, la de Clerk y
  la pública de VAPID) son públicas por diseño. La barrera es la RLS.
- La CSP permite `'unsafe-inline'` y `'unsafe-eval'` a sabiendas, porque hoy
  los necesitan next-themes y Clerk; está explicado en `next.config.ts`. Si
  encuentras la manera de aprovecharlo, eso sí es un fallo.
- Los fallos de Clerk, Supabase, Vercel, Google o Amazon se les avisan a ellos.

## In English

Please report security issues privately through **Security → Report a
vulnerability** in this repository, never in a public issue. Include the
affected route or file, steps to reproduce and the impact. This is a
one-person project with no bug bounty; expect a first answer within a week.
Test only with your own accounts, stop and report if you reach someone else's
data, and avoid denial of service and exhausting the shared AI quota.
