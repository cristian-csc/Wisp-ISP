import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { ThemeProvider } from 'src/components/provider/theme-provider';
import { Toaster } from 'src/components/ui/sonner';
import BlankLayout from 'src/layouts/blank/BlankLayout';
import FullLayout from 'src/layouts/full/FullLayout';
import Login from 'src/views/auth/Login';
import Dashboard from 'src/views/dashboard/Dashboard';
import Clientes from 'src/views/clientes/Clientes';
import ClienteDetail from 'src/views/clientes/ClienteDetail';
import ClientesSatelital from 'src/views/clientes/ClientesSatelital';
import ClienteSatelitalDetail from 'src/views/clientes/ClienteSatelitalDetail';
import Zonas from 'src/views/zonas/Zonas';
import ZonaDetail from 'src/views/zonas/ZonaDetail';
import CajasNap from 'src/views/cajasnap/CajasNap';
import CajaNapZona from 'src/views/cajasnap/CajaNapZona';
import Onus from 'src/views/onus/Onus';
import Averias from 'src/views/averias/Averias';
import AveriaZonaDetail from 'src/views/averias/AveriaZonaDetail';
import Retiros from 'src/views/retiros/Retiros';
import RetiroZonaDetail from 'src/views/retiros/RetiroZonaDetail';
import Usuarios from 'src/views/usuarios/Usuarios';
import Planes from 'src/views/planes/Planes';
import Pagos from 'src/views/pagos/Pagos';
import Gastos from 'src/views/gastos/Gastos';
import GastoZonaDetail from 'src/views/gastos/GastoZonaDetail';
import ConfiguracionWhatsapp from 'src/views/configuracion/ConfiguracionWhatsapp';
import ReporteCaja from 'src/views/finanzas/ReporteCaja';
import { isAuthenticated } from 'src/lib/api';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="wisp-ui-theme">
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route element={<BlankLayout />}>
            <Route path="/login" element={<Login />} />
          </Route>

          <Route
            element={
              <ProtectedLayout>
                <FullLayout />
              </ProtectedLayout>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />

            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/pendientes" element={<Clientes initialFilter="pendiente_aprobacion" />} />
            <Route path="/clientes/:id" element={<ClienteDetail />} />
            <Route path="/clientes-satelital" element={<ClientesSatelital />} />
            <Route path="/clientes-satelital/:id" element={<ClienteSatelitalDetail />} />

            <Route path="/zonas" element={<Zonas />} />
            <Route path="/zonas/:id" element={<ZonaDetail />} />

            <Route path="/cajas-nap" element={<CajasNap />} />
            <Route path="/cajas-nap/zona/:zonaId" element={<CajaNapZona />} />

            <Route path="/onus" element={<Onus />} />
            <Route path="/averias" element={<Averias />} />
            <Route path="/averias/zona/:zonaId" element={<AveriaZonaDetail />} />
            <Route path="/ordenes-retiro" element={<Retiros />} />
            <Route path="/ordenes-retiro/zona/:zonaId" element={<RetiroZonaDetail />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/planes" element={<Planes />} />
            <Route path="/pagos" element={<Pagos />} />
            <Route path="/gastos" element={<Gastos />} />
            <Route path="/gastos/zona/:zonaId" element={<GastoZonaDetail />} />
            <Route path="/configuracion/whatsapp" element={<ConfiguracionWhatsapp />} />
            <Route path="/finanzas/reporte-caja" element={<ReporteCaja />} />
          </Route>

          <Route path="/" element={<Navigate to={isAuthenticated() ? '/dashboard' : '/login'} replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
