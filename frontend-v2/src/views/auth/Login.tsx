import CardBox from 'src/components/shared/CardBox';
import FullLogo from 'src/layouts/full/shared/logo/FullLogo';
import AuthLogin from 'src/views/authentication/authforms/AuthLogin';
import SocialButtons from 'src/views/authentication/authforms/SocialButtons';

const Login = () => {
  return (
    <>
      <div className="relative overflow-hidden h-screen bg-lightprimary">
        <div className="flex h-full justify-center items-center px-4">
          <CardBox className="md:w-[450px] w-full border-none">
            <div className="mx-auto mb-6 w-40">
              <FullLogo />
            </div>
            <SocialButtons title="o inicia sesión con" />
            <AuthLogin />
            <div className="flex gap-2 text-base text-ld font-medium mt-6 items-center justify-center">
              <p className="text-sm text-muted-foreground">¿Problemas para ingresar? Contacta al administrador.</p>
            </div>
          </CardBox>
        </div>
      </div>
    </>
  );
};

export default Login;
