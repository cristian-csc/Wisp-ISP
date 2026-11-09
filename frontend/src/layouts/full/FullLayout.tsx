import { FC } from 'react';
import { Outlet } from 'react-router';
import Sidebar from './vertical/sidebar/Sidebar';
import Header from './vertical/header/Header';
import RutaPermitida from 'src/components/shared/RutaPermitida';

const FullLayout: FC = () => {
  return (
    <>
      <div className="flex w-full min-h-screen">
        <div className="page-wrapper flex w-full ">
          <div className="xl:block hidden">
            <Sidebar />
          </div>
          <div className="body-wrapper w-full bg-background">
            <Header />
            <div className={'container mx-auto px-4 py-6 sm:px-6 sm:py-8'}>
              {/* El menú y la cabecera se ven siempre; lo que se protege por
                  rol es la pantalla de dentro. */}
              <main className="grow">
                <RutaPermitida>
                  <Outlet />
                </RutaPermitida>
              </main>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default FullLayout;
