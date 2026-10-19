// Datos del menú del header — adaptado del demo de la plantilla a lo que
// existe de verdad en el sistema (sin apps de ejemplo tipo Notes/Blog).
interface ProfileType {
  title: string;
  subtitle: string;
  url: string;
  icon: string;
}

const profileDD: ProfileType[] = [
  {
    title: 'Mi perfil',
    subtitle: 'Configuración de la cuenta',
    icon: 'tabler:user',
    url: '/perfil',
  },
];

export { profileDD };
