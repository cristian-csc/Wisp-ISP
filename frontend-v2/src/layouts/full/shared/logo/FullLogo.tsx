import Logo from "src/assets/logo-wisp.png";

// El logo de WISP viene con fondo claro sólido (no transparente), así que
// todavía no hay una versión separada para fondo oscuro — cuando exista,
// acá se agrega el mismo swap block/hidden dark:block que usa la plantilla
// de referencia. Por ahora se muestra igual en los dos modos.
const FullLogo = () => {
  return <img src={Logo} alt="WISP" className="rtl:scale-x-[-1]" />;
};

export default FullLogo;
