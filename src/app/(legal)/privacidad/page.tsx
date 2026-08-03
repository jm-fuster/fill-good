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
    <LegalPage title="Política de privacidad" updated="3 de agosto de 2026">
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
          {LEGAL_OWNER.taxId ? (
            <li>
              <strong>NIF/CIF:</strong> {LEGAL_OWNER.taxId}
            </li>
          ) : null}
          {LEGAL_OWNER.address ? (
            <li>
              <strong>Dirección:</strong> {LEGAL_OWNER.address}
            </li>
          ) : null}
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
          aviso. Se elimina al desactivarlas o al salir del hogar.
        </p>
        <p>
          <strong>Vinculación con Alexa.</strong> Si vinculas un altavoz Amazon
          Echo para manejar el inventario y la lista por voz, guardamos el
          identificador opaco que Amazon asigna a tu cuenta en la skill, el
          hogar y el miembro a los que queda asociado, y las fechas de
          vinculación y de último uso. Es ese identificador —y no lo que dices—
          lo que nos permite saber a qué hogar aplicar cada orden. Para crear el
          vínculo se genera un código de seis dígitos válido diez minutos y de un
          solo uso.
        </p>
        <p>
          <strong>No recibimos grabaciones de tu voz.</strong> Del altavoz nos
          llega únicamente la transcripción que hace Amazon de tu orden (por
          ejemplo, «resta dos yogures»), y le devolvemos el texto que debe leerte
          en voz alta: nombres de producto, cantidades y avisos de caducidad de tu
          hogar. Durante un día conservamos el identificador de cada orden junto
          con la respuesta que dimos, para no aplicar dos veces el mismo
          movimiento si Amazon reenvía la petición.
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
            hogar, sincronizar el contenido entre miembros, calcular tendencias
            de precios): ejecución del contrato — art. 6.1.b del RGPD.
          </li>
          <li>
            <strong>Manejar la app por voz con Alexa</strong> (aplicar al
            inventario y a la lista del hogar vinculado lo que dictas al
            altavoz): ejecución del contrato — art. 6.1.b del RGPD. La
            vinculación es voluntaria y solo existe si generas un código y lo
            dictas al altavoz; puedes deshacerla en cualquier momento desde
            Ajustes.
          </li>
          <li>
            <strong>Leer tickets y generar menús con IA</strong>: tu
            consentimiento — art. 6.1.a del RGPD. Te lo pedimos antes de usar
            estas funciones por primera vez y puedes retirarlo cuando quieras en
            Ajustes (ver sección 5).
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
            <strong>Supabase</strong> (Supabase Inc., EE. UU.): base de datos
            donde vive el contenido de tu hogar. Los datos se alojan en centros
            de datos de la Unión Europea (Fráncfort).
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
          <strong>Con Amazon, solo si vinculas un altavoz.</strong> En ese caso
          Amazon no actúa por cuenta nuestra: es responsable de su propio
          tratamiento de la interacción por voz (la grabación, su reconocimiento
          y el historial de actividad de tu cuenta de Alexa), regido por el aviso
          de privacidad de Alexa de Amazon y por los ajustes de privacidad que
          tengas en la app de Alexa. Nosotros solo recibimos la transcripción de
          la orden y devolvemos el texto que el altavoz te lee. Si no vinculas
          ningún altavoz, no hay ningún intercambio con Amazon.
        </p>
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
          casar las líneas; para la segunda, la información de tu despensa, tus
          recetas, lo que tengas apuntado en la lista de la compra, los platos
          de las dos semanas anteriores y las preferencias y reglas que
          indiques. El archivo del ticket no se conserva
          después del procesado. Antes de que la imagen salga, eliminamos sus
          metadatos técnicos (por ejemplo, la geolocalización que algunas
          cámaras incrustan en la foto).
        </p>
        <p>
          <strong>Te pedimos tu consentimiento</strong> antes de usar estas
          funciones por primera vez, y puedes retirarlo cuando quieras desde
          Ajustes; mientras no lo hagas, no enviamos nada a la IA.
        </p>
        <p>
          El servicio se presta actualmente a través del nivel gratuito de la
          API de Gemini. Conforme a los términos de ese nivel, Google puede
          utilizar las entradas y salidas para mejorar sus productos y modelos,
          y ese uso puede incluir la revisión del contenido por personas. En ese
          nivel, Google no actúa como un mero proveedor por cuenta nuestra sino
          para sus propios fines. Por eso te recomendamos no incluir información
          personal que no sea necesaria: tapa la zona de la tarjeta del ticket
          antes de escanearlo y no escribas datos de salud en las preferencias
          del menú.
        </p>
      </LegalSection>

      <LegalSection title="6. Transferencias internacionales">
        <p>
          Algunos proveedores están establecidos en Estados Unidos (Clerk,
          Vercel, Google; Supabase, aunque estadounidense, aloja tus datos en la
          Unión Europea). Esas transferencias se amparan en el Marco de
          Privacidad de Datos UE-EE. UU. (Data Privacy Framework) cuando el
          proveedor está adherido y, en su defecto, en las cláusulas
          contractuales tipo aprobadas por la Comisión Europea. Puedes
          solicitarnos más detalle sobre la garantía aplicable a cada proveedor
          escribiendo a {LEGAL_OWNER.email}.
        </p>
      </LegalSection>

      <LegalSection title="7. Cuánto tiempo conservamos los datos">
        <p>
          Mientras tu cuenta exista. Puedes borrarla en cualquier momento
          desde Ajustes: se eliminan tus datos personales y tu cuenta de
          acceso. El contenido aportado a un hogar con más miembros
          (inventario, tickets, recetas…) pertenece al hogar y se conserva
          para el resto de miembros; desaparece definitivamente cuando el
          hogar se queda sin miembros.
        </p>
        <p>
          Además, algunos datos se depuran solos antes incluso de que borres
          nada: los tickets escaneados que no confirmas se eliminan a los 30
          días, el historial de consumo y reposición a los 90 días, los
          descartes a los 24 meses y los menús semanales pasadas 26 semanas. Los
          registros técnicos se conservan durante periodos breves.
        </p>
        <p>
          En cuanto a Alexa: los códigos de vinculación caducan a los diez
          minutos, y el identificador y la respuesta de cada orden de voz se
          borran al día siguiente. El vínculo con un altavoz dura mientras lo
          quieras: desaparece cuando lo revocas desde Ajustes, cuando cualquier
          miembro del hogar lo retira y cuando borras tu cuenta.
        </p>
        <p>
          Cuando borras datos, pueden permanecer un tiempo limitado en las
          copias de seguridad cifradas de nuestros proveedores hasta que estas
          se renuevan, tras lo cual desaparecen definitivamente.
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
          Solo usamos cookies técnicas imprescindibles, todas exentas de
          consentimiento, por lo que no verás un banner de cookies:
        </p>
        <ul>
          <li>
            Las de <strong>sesión</strong>, que gestiona Clerk para mantenerte
            conectado.
          </li>
          <li>
            Una cookie propia, <strong>«active_household»</strong> (dura un año),
            que recuerda qué hogar tienes activo si perteneces a varios.
          </li>
          <li>
            Una cookie propia, <strong>«sidebar_state»</strong> (dura una
            semana), que recuerda si el menú lateral está plegado en pantallas
            grandes.
          </li>
        </ul>
        <p>
          También usamos el almacenamiento local del dispositivo para
          preferencias (como el tema claro/oscuro) y para que la app funcione
          sin conexión (caché de la PWA). Al cerrar sesión borramos esa caché y
          el estado del hogar guardado en el dispositivo. No hay cookies de
          publicidad, de analítica ni de seguimiento.
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
