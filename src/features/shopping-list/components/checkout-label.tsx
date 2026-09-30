/**
 * El texto de «Finalizar compra», compartido por /lista y el modo compra. La
 * flecha es de la vista: un lector de pantalla leía «flecha a la derecha» en
 * mitad de la frase, así que se esconde y en su lugar se oye «y pasar al».
 */
export function CheckoutLabel({ count }: { count: number }) {
  return (
    <>
      Finalizar compra ({count}) <span aria-hidden>→</span>
      <span className="sr-only">y pasar al</span> inventario
    </>
  );
}
