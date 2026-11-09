import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import Logo from 'src/assets/logo-wisp.png';
import { toast } from 'sonner';
import { login, isAuthenticated, getMe } from 'src/lib/api';
import { ROL_LABEL } from 'src/lib/permisos';

/**
 * Login administrativo, portado desde el modal de la web pública
 * (la carpeta `web/` del proyecto) conservando su diseño exacto: mismos colores, tamaños,
 * degradados, resplandor naranja y animación de entrada.
 *
 * Los colores van escritos a mano a propósito: esta pantalla es SIEMPRE oscura
 * y no debe seguir el tema claro/oscuro del panel, que arrancaría en claro y
 * rompería la identidad de la marca.
 */
const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  // A dónde volver tras entrar: la ruta que se intentó abrir sin sesión.
  const destino = (location.state as { desde?: string } | null)?.desde ?? '/dashboard';

  useEffect(() => {
    if (isAuthenticated()) navigate(destino, { replace: true });
  }, []);

  async function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setAviso('Verificando…');
    try {
      await login(usuario.trim(), password);
      setPassword('');
      // Quién entró, dicho en voz alta: en una PC compartida evita que alguien
      // trabaje toda la tarde con la sesión de otra persona.
      try {
        const yo = await getMe();
        toast.success(`Bienvenido, ${yo.nombre}`, { description: ROL_LABEL[yo.rol] });
      } catch {
        // Si no se pudo leer el perfil, igual se entra: el saludo no es crítico
      }
      navigate(destino, { replace: true });
    } catch (err: unknown) {
      const estado = (err as { response?: { status?: number } })?.response?.status;
      setAviso(
        estado === 401
          ? 'Usuario o contraseña incorrectos.'
          : 'El sistema no responde. Vuelve a intentarlo en un momento.',
      );
      setEnviando(false);
    }
  }

  return (
    <div
      className="grid min-h-dvh place-items-center p-[18px]"
      style={{ background: 'rgba(3, 6, 12, 0.98)' }}
    >
      {/* La animación de entrada y el relleno en móvil replican el original */}
      <style>{`
        @keyframes loginUp {
          from { opacity: 0; transform: translateY(22px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .login-card { animation: loginUp 0.3s ease; }
        @media (max-width: 680px) {
          .login-card { padding: 27px 22px; }
          .login-card .login-marca { width: 190px; }
          .login-card h2 { font-size: 29px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .login-card { animation: none; }
        }
      `}</style>

      <section
        className="login-card relative max-h-[calc(100dvh-36px)] w-[min(100%,470px)] overflow-y-auto rounded-[28px] border border-[#ffffff25] px-[39px] pb-[30px] pt-[34px] text-white"
        style={{
          background: 'linear-gradient(145deg, #1b2230, #0b101a 70%)',
          boxShadow: '0 35px 100px #000b, 0 0 60px #ff760019',
        }}
        aria-labelledby="loginTitle"
      >
        {/* Volver al sitio público: ocupa el lugar del botón de cerrar del modal */}
        <button
          type="button"
          onClick={() => window.location.replace('/')}
          aria-label="Volver al sitio web"
          title="Volver al sitio web"
          className="absolute right-[18px] top-[15px] z-[2] size-[37px] cursor-pointer rounded-full border border-[#ffffff25] bg-[#ffffff12] text-[26px] leading-none text-white transition-[background-color] duration-[180ms] hover:bg-[#ffffff22]"
        >
          ×
        </button>

        {/* Resplandor naranja de la esquina */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-[170px] -top-[210px] size-[320px] opacity-45"
          style={{ background: '#ff7800', filter: 'blur(95px)' }}
        />

        <div className="relative mb-[23px] flex flex-col items-center">
          <img
            src={Logo}
            alt="WISP"
            className="login-marca w-[230px] max-w-[78%] object-contain"
          />
          <span className="text-[12px] uppercase tracking-[3px] text-[#ffc27e]">
            internet para todos
          </span>
        </div>

        <div className="relative mx-auto mb-[13px] text-center text-[10px] font-extrabold tracking-[2px] text-[#ffb45d]">
          ● ACCESO INTERNO SEGURO
        </div>

        {/* El color va explícito: globals.css aplica `h2 { color: var(--foreground) }`
            a todo el panel, y en tema claro eso pintaría el título de azul
            oscuro sobre esta tarjeta oscura. */}
        <h2
          id="loginTitle"
          className="relative mb-[10px] text-center text-[35px] font-[850] leading-[1.12] !text-white"
        >
          Bienvenido <em className="not-italic text-[#ff891d]">de nuevo.</em>
        </h2>

        <p className="relative mb-[28px] text-center text-[13px] leading-[1.5] text-[#aab5c5]">
          Portal de colaboradores · Administración y atención al cliente
        </p>

        <form onSubmit={alEnviar} autoComplete="on" className="relative">
          <label
            htmlFor="staffUser"
            className="mb-2 mt-4 block text-[12px] font-[750] text-[#dce2ec]"
          >
            Usuario o correo institucional
          </label>
          <div className="flex items-center gap-[10px] rounded-[13px] border border-[#ffffff22] bg-[#0a0f19] px-[14px] transition-[border-color,box-shadow] duration-200 focus-within:border-[#ff8518] focus-within:shadow-[0_0_0_3px_#ff851822]">
            <span aria-hidden="true" className="text-[21px] text-[#ff922d]">
              ♙
            </span>
            {/* type="text": la columna `usuarios.email` guarda nombres de
                usuario como `admin`, no correos — validar formato de email
                impediría entrar. */}
            <input
              id="staffUser"
              name="username"
              type="text"
              autoComplete="username"
              required
              autoFocus
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="Tu usuario de WISP"
              className="min-w-0 flex-1 border-0 bg-transparent py-[15px] text-[14px] text-white outline-0 placeholder:text-[#6b7686]"
            />
          </div>

          <label
            htmlFor="staffPassword"
            className="mb-2 mt-4 block text-[12px] font-[750] text-[#dce2ec]"
          >
            Contraseña
          </label>
          <div className="flex items-center gap-[10px] rounded-[13px] border border-[#ffffff22] bg-[#0a0f19] px-[14px] transition-[border-color,box-shadow] duration-200 focus-within:border-[#ff8518] focus-within:shadow-[0_0_0_3px_#ff851822]">
            <span aria-hidden="true" className="text-[21px] text-[#ff922d]">
              ⌑
            </span>
            <input
              id="staffPassword"
              name="password"
              type={verPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Introduce tu contraseña"
              className="min-w-0 flex-1 border-0 bg-transparent py-[15px] text-[14px] text-white outline-0 placeholder:text-[#6b7686]"
            />
            <button
              type="button"
              onClick={() => setVerPassword((v) => !v)}
              aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="cursor-pointer border-0 bg-none text-[20px] text-[#c5cad3] hover:text-white"
            >
              ◉
            </button>
          </div>

          <p
            role="status"
            aria-live="polite"
            className="mt-[10px] min-h-[14px] text-[12px] text-[#ffbf78]"
          >
            {aviso}
          </p>

          <button
            type="submit"
            disabled={enviando}
            className="mt-[19px] flex w-full cursor-pointer items-center justify-center gap-5 rounded-[13px] border-0 p-[17px] text-[15px] font-[850] text-white transition-[filter] duration-[180ms] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            style={{
              background: 'linear-gradient(110deg, #ff9b20, #ff5606)',
              boxShadow: '0 12px 35px #ff630036',
            }}
          >
            Acceder al sistema <span aria-hidden="true">→</span>
          </button>
        </form>

        <div className="relative mt-[25px] border-t border-[#ffffff15] pt-[18px] text-center text-[11px] text-[#8c99a9]">
          Acceso exclusivo para personal autorizado de WISP
        </div>
      </section>
    </div>
  );
};

export default Login;
