import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "../_components/legal-page";
import { LEGAL_OWNER } from "../legal-config";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Qué datos trata Fill Good, para qué, con qué base legal y cómo ejercer tus derechos.",
};

export default function PrivacidadPage() {
  return (
    <LegalPage title="Política de privacidad" updated="24 de julio de 2026">
      <p>
        Esta política explica qué datos personales tratamos cuando usas{" "}
        <strong>Fill Good</strong>, con qué finalidad, con qué base legal y qué
        derechos tienes. La resumimos en una frase: guardamos lo mínimo para
        que la app funcione, no vendemos tus datos y no usamos publicidad ni
        analítica de terceros.
      </p>

      <LegalSection title="1. Responsable del tratamiento">
        <ul>
          <li>
            <strong>Titular:</strong> {LEGAL_OWNER.name}
          </li>
          <li>
            <strong>NIF/CIF:</strong> {LEGAL_OWNER.taxId}
          </li>
          <li>
            <strong>Dirección:</strong> {LEGAL_OWNER.address}
          </li>
          <li>
            <strong>Contacto:</strong> {LEGAL_OWNER.email}
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Qué datos tratamos">
        <p>
          <strong>Datos de tu cuenta.</strong> Al registrarte, nuestro
          proveedor de identidad (Clerk) gestiona tu dirección de correo, tu
          nombre y, si la añades, tu foto de perfil, además de los
          identificadores técnicos de sesión necesarios para mantenerte
          conectado.
        </p>
        <p>
          <strong>Contenido de tu hogar.</strong> Lo que tú y los miembros de
          tu hogar introducís al usar la app: inventario y ubicaciones,
          fechas de caducidad, lista de la compra, recetas, menús semanales,
          presupuesto mensual y orden de pasillos de tu tienda.
        </p>
        <p>
          <strong>Tickets de compra.</strong> Cuando escaneas un ticket, el
          archivo (imagen o PDF) se procesa para extraer sus datos y{" "}
          <strong>no se almacena</strong> en nuestros servidores. Lo que se
          guarda es el resultado de la extracción: establecimiento, fecha,
          importes y líneas de producto con sus precios.
        </p>
        <p>
          <strong>Notificaciones push.</strong> Si las activas, guardamos la
          suscripción que genera tu navegador (dirección del servicio de
          notificaciones y claves de cifrado) junto con tus preferencias de
          aviso. Se elimina al desactivarlas.
        </p>
        <p>
          <strong>Datos técnicos.</strong> Nuestra infraestructura registra
          datos de conexión (como la dirección IP) en registros técnicos de
          corta duración, con fines de seguridad y diagnóstico.
        </p>
      </LegalSection>

      <LegalSection title="3. Para qué y con qué base legal">
        <ul>
          <li>
            <strong>Prestar el servicio</strong> (gestionar tu cuenta y tu
            hogar, sincronizar el contenido entre miembros, procesar tickets,
            calcular tendencias de precios, generar menús): ejecución del
            contrato — art. 6.1.b del RGPD.
          </li>
          <li>
            <strong>Enviarte notificaciones push</strong> (caducidades,
            subidas de precio, reposición): tu consentimiento — art. 6.1.a del
            RGPD. Puedes retirarlo en cualquier momento desactivándolas en
            Ajustes.
          </li>
          <li>
            <strong>Seguridad y prevención de abuso</strong> (registros
            técnicos, límites de peticiones): interés legítimo — art. 6.1.f
            del RGPD.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Con quién se comparten">
        <p>
          <strong>Con los miembros de tu hogar.</strong> Fill Good es una app
          compartida: el contenido del hogar (inventario, lista, tickets,
          recetas, menús, presupuesto) es visible para todos sus miembros,
          igual que tu nombre y tu foto de perfil como miembro.
        </p>
        <p>
          <strong>Con proveedores que nos prestan servicio</strong>{" "}
          (encargados del tratamiento), solo en la medida necesaria:
        </p>
        <ul>
          <li>
            <strong>Clerk</strong> (Clerk Inc., EE. UU.): registro, inicio de
            sesión y gestión de cuentas.
          </li>
          <li>
            <strong>Supabase</strong>: base de datos donde vive el contenido
            de tu hogar.
          </li>
          <li>
            <strong>Vercel</strong> (Vercel Inc., EE. UU.): alojamiento de la
            aplicación y registros técnicos.
          </li>
          <li>
            <strong>Google</strong> (API de Gemini): procesamiento con
            inteligencia artificial de tickets y menús (ver sección 5).
          </li>
          <li>
            <strong>El servicio de notificaciones de tu navegador</strong>{" "}
            (Google, Mozilla, Microsoft o Apple, según cuál uses): entrega de
            las notificaciones push que actives.
          </li>
        </ul>
        <p>
          No vendemos ni cedemos tus datos a terceros con fines comerciales,
          y no hay publicidad ni analítica de terceros en la app.
        </p>
      </LegalSection>

      <LegalSection title="5. Inteligencia artificial">
        <p>
          Dos funciones usan IA: la lectura de tickets y la generación de
          menús. Para la primera se envía a Google (API de Gemini) el archivo
          del ticket junto con los nombres de productos de tu catálogo, para
          casar las líneas; para la segunda, la información de tu despensa y
          las preferencias que indiques. El archivo del ticket no se conserva
          después del procesado.
        </p>
        <p>
          El servicio se presta actualmente a través del nivel gratuito de la
          API de Gemini. Conforme a los términos de ese nivel, Google puede
          utilizar las entradas y salidas para mejorar sus productos y
          modelos. Te recomendamos no incluir información personal que no sea
          necesaria en los archivos que subas.
        </p>
      </LegalSection>

      <LegalSection title="6. Transferencias internacionales">
        <p>
          Algunos de los proveedores anteriores están establecidos en Estados
          Unidos. Las transferencias se amparan en el Marco de Privacidad de
          Datos UE-EE. UU. (Data Privacy Framework) o en cláusulas
          contractuales tipo aprobadas por la Comisión Europea, según el
          proveedor.
        </p>
      </LegalSection>

      <LegalSection title="7. Cuánto tiempo conservamos los datos">
        <p>
          Mientras tu cuenta exista. Puedes borrarla en cualquier momento
          desde Ajustes: se eliminan tus datos personales y tu cuenta de
          acceso. El contenido aportado a un hogar con más miembros
          (inventario, tickets, recetas…) pertenece al hogar y se conserva
          para el resto de miembros; desaparece definitivamente cuando el
          hogar se queda sin miembros. Los registros técnicos se conservan
          durante periodos breves.
        </p>
      </LegalSection>

      <LegalSection title="8. Tus derechos">
        <p>
          Puedes ejercer tus derechos de acceso, rectificación, supresión,
          oposición, limitación del tratamiento y portabilidad, así como
          retirar tu consentimiento, escribiendo a {LEGAL_OWNER.email}. El
          borrado completo de la cuenta está disponible directamente en la
          app, en Ajustes.
        </p>
        <p>
          Si consideras que no hemos tratado tus datos correctamente, puedes
          reclamar ante la Agencia Española de Protección de Datos (
          <a
            href="https://www.aepd.es"
            target="_blank"
            rel="noopener noreferrer"
          >
            aepd.es
          </a>
          ).
        </p>
      </LegalSection>

      <LegalSection title="9. Menores de edad">
        <p>
          Fill Good no está dirigida a menores de 14 años. Si detectamos una
          cuenta de un menor de esa edad, la eliminaremos.
        </p>
      </LegalSection>

      <LegalSection title="10. Cookies y almacenamiento local">
        <p>
          Solo usamos cookies técnicas imprescindibles para mantener tu
          sesión iniciada (las gestiona Clerk) y almacenamiento local de tu
          dispositivo para preferencias como el tema claro/oscuro y para que
          la app funcione sin conexión (caché de la PWA). No hay cookies de
          publicidad, de analítica ni de seguimiento; por eso no verás un
          banner de cookies.
        </p>
      </LegalSection>

      <LegalSection title="11. Seguridad">
        <p>
          Toda la comunicación va cifrada (HTTPS). El contenido de cada hogar
          está aislado a nivel de base de datos: solo los miembros de un
          hogar pueden acceder a sus datos, y aplicamos límites anti-abuso a
          las operaciones sensibles.
        </p>
      </LegalSection>

      <LegalSection title="12. Cambios en esta política">
        <p>
          Si esta política cambia de forma relevante, actualizaremos la fecha
          de esta página y, cuando el cambio lo justifique, te lo avisaremos
          dentro de la app. Puedes consultar también los{" "}
          <Link href="/terminos">términos de uso</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
