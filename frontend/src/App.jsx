import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Clientes from './components/Clientes'
import ClienteDetalle from './components/ClienteDetalle'
import NuevoCliente from './components/NuevoCliente'
import Zonas from './components/Zonas'
import Pagos from './components/Pagos'
import Gastos from './components/Gastos'
import WhatsApp from './components/WhatsApp'
import Configuracion from './components/Configuracion'

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1F2937',
            color: '#F9FAFB',
            border: '1px solid #374151',
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="clientes/nuevo" element={<NuevoCliente />} />
          <Route path="clientes/:id" element={<ClienteDetalle />} />
          <Route path="zonas" element={<Zonas />} />
          <Route path="pagos" element={<Pagos />} />
          <Route path="gastos" element={<Gastos />} />
          <Route path="whatsapp" element={<WhatsApp />} />
          <Route path="configuracion" element={<Configuracion />} />
        </Route>
      </Routes>
    </>
  )
}
