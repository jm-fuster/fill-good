import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "../_components/legal-page";
import { LEGAL_OWNER } from "../legal-config";

export const metadata: Metadata = {
  title: "Términos de uso",
  description:
    "Condiciones que rigen el uso de Fill Good: cuentas, hogares compartidos, funciones de IA y responsabilidad.",
};

export default function TerminosPage() {
  return (
    <LegalPage title="Términos de uso" updated="24 de julio de 2026">
      <p>
        Estos términos regulan el uso de <strong>Fill Good</strong>, la
        aplicación para gestionar la despensa del hogar, la lista de la
        compra, los tickets, los precios y los menús semanales. Al crear una
        cuenta o usar la app aceptas estos términos y la{" "}
        <Link href="/privacidad">política de privacidad</Link>.
      </p>

      <LegalSection title="1. Quién presta el servicio">
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

      <LegalSection title="2. El servicio">
        <p>
          Fill Good permite llevar el inventario de casa, compartir la lista
          de la compra con tu hogar, digitalizar tickets con ayuda de
          inteligencia artificial, seguir la evolución de tus precios y
          planificar menús semanales. Es un servicio gratuito en su forma
          actual; si en el futuro se añaden funciones de pago, se comunicarán
          con claridad antes de que te afecten.
        </p>
      </LegalSection>

      <LegalSection title="3. Tu cuenta">
        <p>
          Para usar la app necesitas una cuenta. Debes tener al menos 14
          años, facilitar información veraz y custodiar tus credenciales: lo
          que ocurra desde tu sesión se entiende hecho por ti. Si sospechas
          que alguien ha accedido a tu cuenta, cambia la contraseña y
          avísanos.
        </p>
      </LegalSection>

      <LegalSection title="4. Hogares compartidos">
        <p>
          El contenido de Fill Good se organiza por hogares. Al unirte a un
          hogar (o invitar a alguien con el código de invitación) compartes
          con sus miembros el inventario, la lista, los tickets, las recetas,
          los menús y el presupuesto. No invites a personas con las que no
          quieras compartir esa información, y trata el código de invitación
          como algo privado.
        </p>
        <p>
          Quien crea el hogar es su propietario y puede gestionar miembros.
          Para borrar su cuenta, un propietario con más miembros en el hogar
          debe transferir antes la propiedad a otro miembro.
        </p>
      </LegalSection>

      <LegalSection title="5. Tu contenido">
        <p>
          El contenido que introduces (tickets, recetas, inventario, menús)
          es tuyo. Nos concedes únicamente la licencia imprescindible para
          almacenarlo, procesarlo y mostrarlo a los miembros de tu hogar, que
          es lo que hace funcionar el servicio. Eres responsable de lo que
          subes: no subas contenido ilegal ni datos de terceros sin su
          permiso.
        </p>
      </LegalSection>

      <LegalSection title="6. Funciones de inteligencia artificial">
        <p>
          La lectura de tickets y la generación de menús usan modelos de IA,
          y los modelos de IA se equivocan: una línea del ticket puede
          extraerse mal, un precio puede quedar descuadrado y un menú puede
          proponer algo que no encaje contigo. La app te pide revisar los
          resultados antes de confirmarlos, y esa revisión es tu
          responsabilidad.
        </p>
        <p>
          <strong>
            Los menús y recetas no son consejo médico ni nutricional.
          </strong>{" "}
          Si tienes alergias, intolerancias o necesidades dietéticas,
          comprueba siempre los ingredientes y el etiquetado real de los
          productos: no confíes esa comprobación a la app.
        </p>
      </LegalSection>

      <LegalSection title="7. Caducidades, avisos y precios">
        <p>
          Las fechas de caducidad son las que tú registras, y los avisos
          (incluidas las notificaciones push) son recordatorios que pueden
          fallar o retrasarse. Nada de esto sustituye a comprobar el estado
          real de un alimento antes de consumirlo.{" "}
          <strong>
            No uses Fill Good como única referencia de seguridad alimentaria.
          </strong>
        </p>
        <p>
          Las tendencias y comparativas de precios se calculan a partir de
          tus propios tickets: son orientativas y pueden contener errores o
          quedar desactualizadas.
        </p>
      </LegalSection>

      <LegalSection title="8. Uso aceptable">
        <p>Te comprometes a no:</p>
        <ul>
          <li>
            intentar acceder a datos de otros hogares o cuentas, ni sondear o
            vulnerar las medidas de seguridad;
          </li>
          <li>
            usar la app de forma automatizada o masiva (scraping, fuerza
            bruta sobre códigos de invitación, abuso de las funciones de IA);
          </li>
          <li>
            interferir con el funcionamiento del servicio o revenderlo sin
            autorización;
          </li>
          <li>usar el servicio para fines ilegales.</li>
        </ul>
        <p>
          Podemos suspender o cerrar cuentas que incumplan estas normas de
          forma grave o reiterada.
        </p>
      </LegalSection>

      <LegalSection title="9. Disponibilidad y cambios del servicio">
        <p>
          Fill Good se presta «tal cual» y en la medida en que la tecnología
          lo permite: no garantizamos disponibilidad ininterrumpida ni
          ausencia de errores, y las funciones pueden cambiar, mejorar o
          retirarse. Intentaremos avisar con antelación razonable de los
          cambios que te afecten de forma significativa.
        </p>
      </LegalSection>

      <LegalSection title="10. Propiedad intelectual">
        <p>
          El software, el diseño, la marca y los contenidos propios de Fill
          Good pertenecen a su titular o a sus licenciantes. Estos términos
          no te ceden ninguno de esos derechos más allá del uso normal de la
          app.
        </p>
      </LegalSection>

      <LegalSection title="11. Baja del servicio">
        <p>
          Puedes dejar de usar Fill Good cuando quieras y borrar tu cuenta
          desde Ajustes. El efecto del borrado sobre tus datos y sobre el
          contenido compartido del hogar se describe en la{" "}
          <Link href="/privacidad">política de privacidad</Link>.
        </p>
      </LegalSection>

      <LegalSection title="12. Responsabilidad">
        <p>
          En la máxima medida permitida por la ley, no respondemos de daños
          derivados de decisiones tomadas confiando exclusivamente en la
          información de la app (extracciones de tickets, precios,
          caducidades, menús), de la pérdida de datos por causas ajenas a
          nuestro control razonable ni de interrupciones del servicio. Nada
          en estos términos limita derechos que la legislación de consumo te
          reconozca de forma irrenunciable.
        </p>
      </LegalSection>

      <LegalSection title="13. Cambios en estos términos">
        <p>
          Si modificamos estos términos de forma relevante, actualizaremos la
          fecha de esta página y te lo comunicaremos dentro de la app con
          antelación razonable. Seguir usando el servicio tras la entrada en
          vigor de los cambios supone aceptarlos.
        </p>
      </LegalSection>

      <LegalSection title="14. Ley aplicable y jurisdicción">
        <p>
          Estos términos se rigen por la legislación española. Cualquier
          controversia se someterá a los juzgados y tribunales que
          correspondan conforme a la normativa aplicable; si actúas como
          consumidor, los de tu domicilio.
        </p>
      </LegalSection>

      <LegalSection title="15. Contacto">
        <p>
          Para cualquier duda sobre estos términos puedes escribir a{" "}
          {LEGAL_OWNER.email}.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
