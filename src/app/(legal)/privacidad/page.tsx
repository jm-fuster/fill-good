import type { Metadata } from "next";
import Link from "next/link";

import { LegalEmail, LegalPage, LegalSection } from "../_components/legal-page";
import { LEGAL_OWNER } from "../legal-config";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Qué datos trata Fill Good, para qué, con qué base legal y cómo ejercer tus derechos.",
};

export default function PrivacidadPage() {
  return (
    <LegalPage title="Política de privacidad" updated="28 de septiembre de 2026">
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
            <strong>Contacto:</strong> <LegalEmail />
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
          hogar. Durante uno o dos días conservamos el identificador de cada
          orden que cambia algo, junto con la respuesta que dimos y lo necesario
          para deshacerla, para no aplicar dos veces el mismo movimiento si
          Amazon reenvía la petición.
        </p>
        <p>
          <strong>Uso de la app.</strong> Para saber qué partes de la app
          sirven y cuáles no, anotamos qué días la abres y unos pocos pasos
          concretos: cuándo abres, contestas, aplazas, desactivas o reactivas
          el repaso de despensa (qué respondes, no sobre qué producto; cuántos
          productos te ofrece y hasta cuándo lo aplazas), cuántos productos
          apuntas desde él en la lista, cuándo compartes o copias el enlace de
          invitación a tu hogar y, al crear un hogar, si nos dices que compartes
          la compra con alguien, que no o que ahora no (solo esa respuesta: ni
          con quién ni cuántos). Cada anotación va asociada a tu cuenta y a tu
          hogar. No registramos qué páginas visitas ni lo que escribes, y no se
          usa para publicidad ni se cede a terceros.
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
            <strong>Leer tickets, generar menús y escribir recetas con IA</strong>:
            tu consentimiento — art. 6.1.a del RGPD. Te lo pedimos antes de usar
            estas funciones por primera vez y puedes retirarlo cuando quieras en
            Ajustes (ver sección 5).
          </li>
          <li>
            <strong>Enviarte notificaciones push</strong> (caducidades,
            subidas de precio, resumen del mes): tu consentimiento — art. 6.1.a del
            RGPD. Puedes retirarlo en cualquier momento desactivándolas en
            Ajustes.
          </li>
          <li>
            <strong>Seguridad y prevención de abuso</strong> (registros
            técnicos, límites de peticiones): interés legítimo — art. 6.1.f
            del RGPD.
          </li>
          <li>
            <strong>Medir el uso para mejorar la app</strong> (qué días se abre
            y si funciones como el repaso de despensa o la invitación se usan):
            interés legítimo — art. 6.1.f del RGPD. Es una medición propia y
            mínima, sin publicidad ni perfiles. Puedes oponerte en Ajustes (Medición de uso) o escribiendo
            a <LegalEmail />: dejaremos de anotar tu uso y borraremos lo que
            ya esté anotado.
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
            sesión y gestión de cuentas. Su código se carga en todas las páginas
            de la web para saber si hay una sesión abierta.
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
            inteligencia artificial de tickets, menús y recetas (ver sección 5).
          </li>
          <li>
            <strong>Cloudflare</strong> (Cloudflare Inc., EE. UU.): reenvío del
            correo que escribes a nuestra dirección de contacto.
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
          Tres funciones usan IA, y en las tres se envía a Google (API de
          Gemini) solo lo necesario:
        </p>
        <ul>
          <li>
            <strong>Leer un ticket:</strong> el archivo (foto o PDF), los
            nombres de productos de tu catálogo y tus tiendas habituales, para
            casar las líneas. El archivo no se conserva después del procesado.
            A las fotos les quitamos antes sus metadatos técnicos (por ejemplo,
            la geolocalización que algunas cámaras incrustan); los PDF se envían
            tal como los subes.
          </li>
          <li>
            <strong>Generar menús:</strong> tu despensa, tus recetas (con su
            valoración, cuántas veces las habéis cocinado y su coste por ración
            según vuestros tickets), lo apuntado en la lista de la compra, los
            platos de esa semana y de las dos anteriores, el presupuesto semanal
            y las preferencias y reglas que indiques.
          </li>
          <li>
            <strong>Escribir una receta:</strong> su nombre, su descripción, las
            raciones y los ingredientes que ya tenga.
          </li>
        </ul>
        <p>
          Lo que se envía es contenido compartido del hogar: cuando un miembro
          usa estas funciones, viaja también lo que han apuntado los demás. A la
          IA no le llega tu nombre, tu email ni el nombre del hogar. Los platos
          y las recetas que propone la IA quedan marcados como tales, también en
          la exportación de tus datos.
        </p>
        <p>
          <strong>Te pedimos tu consentimiento</strong> antes de usar estas
          funciones por primera vez, y puedes retirarlo cuando quieras desde
          Ajustes. Sin él, no enviamos nada a la IA.
        </p>
        <p>
          Usamos la cuota gratuita de la API de Gemini. Los términos de Google
          establecen que, para quien la usa desde el Espacio Económico Europeo,
          se aplican las condiciones de datos de su servicio de pago: Google no
          utiliza lo enviado para mejorar sus productos, lo trata por cuenta
          nuestra conforme a su anexo de tratamiento de datos y conserva los
          registros durante un tiempo limitado, solo para detectar abusos. Aun
          así, no incluyas información personal que no haga falta: tapa la zona
          de la tarjeta del ticket antes de escanearlo.
        </p>
        <p>
          Entre las preferencias del menú puedes elegir una dieta «sin gluten».
          Si la eliges porque alguien del hogar lo necesita por salud, ese dato
          dice algo sobre su salud: solo lo usamos para generar vuestros menús,
          y lo cubre el consentimiento que das antes de usar la IA. No escribas
          otros datos de salud en las preferencias ni en las reglas del menú.
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
          escribiendo a <LegalEmail />.
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
          días, el historial de consumo y reposición a los 90 días, lo que
          marcas como tirado a los 24 meses, los menús semanales pasadas 26 semanas y las
          anotaciones de uso de la sección 2 a los 12 meses. De los menús
          borrados solo se guarda, por receta, cuántas veces la planificasteis
          y la cocinasteis y cuándo fue la última, para no proponeros lo que
          acabáis de comer; desaparece con la receta. Los registros
          técnicos se conservan durante periodos breves.
        </p>
        <p>
          En cuanto a Alexa: los códigos de vinculación caducan a los diez
          minutos, y el identificador y la respuesta de cada orden de voz se
          borran en uno o dos días. El vínculo con un altavoz dura mientras lo
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
          retirar tu consentimiento, escribiendo a <LegalEmail />. El
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
          Fill Good no está dirigida a menores de 18 años. Si detectamos una
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
            que recuerda qué hogar tienes activo. Se crea al entrar en tu primer
            hogar y solo guarda un identificador interno, que sin sesión no da
            acceso a nada.
          </li>
          <li>
            Una cookie propia, <strong>«sidebar_state»</strong> (dura una
            semana), que recuerda si el menú lateral está plegado en pantallas
            grandes.
          </li>
          <li>
            Cuatro cookies propias que recuerdan que has aplazado uno de los
            dos repasos, el de los platos de la semana o el de la despensa:{" "}
            <strong>«menu_checkin_snooze»</strong> y{" "}
            <strong>«pantry_review_snooze»</strong> (duran dos días) cuando
            cierras la tarjeta con «Recordármelo mañana», y{" "}
            <strong>«menu_checkin_silenced_week»</strong> y{" "}
            <strong>«pantry_review_silenced_week»</strong> (duran dos semanas)
            cuando eliges no volver a verla esa semana. Solo se crean si pulsas
            esos botones, y solo afectan a ese dispositivo.
          </li>
          <li>
            Una cookie propia, <strong>«fg_share_error»</strong> (dura un
            minuto), que solo aparece si falla un ticket que compartes con la
            app desde otra aplicación, para poder enseñarte el error.
          </li>
        </ul>
        <p>
          También usamos el almacenamiento local del dispositivo para
          preferencias (como el tema claro/oscuro o qué secciones tienes
          plegadas), para recordar por dónde vas (cómo agrupas la lista de la
          compra y la tienda en la que compras, o el paso de la receta que estás
          cocinando) y para que la app funcione sin conexión (caché de la PWA).
          Al cerrar sesión desde la app borramos esa caché y lo que guardaba de
          tu hogar; se quedan algunas preferencias del dispositivo, como el
          tema, y el registro técnico de la caché (qué direcciones se guardaron,
          sin su contenido). No hay
          cookies de
          publicidad, de analítica ni de seguimiento: la medición de uso de la
          sección 2 no guarda nada en tu dispositivo, se anota en nuestro
          servidor cuando usas la app.
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
