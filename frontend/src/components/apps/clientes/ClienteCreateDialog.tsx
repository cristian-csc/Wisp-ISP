import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '@iconify/react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Label } from 'src/components/ui/label';
import { Input } from 'src/components/ui/input';
import { Textarea } from 'src/components/ui/textarea';
import {
  FieldIcon,
  FormActions,
  FormCallout,
  FormDialog,
  FormField,
  FormGrid,
  FormSection,
  SegmentedChoice,
} from 'src/components/shared/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import { consultarDocumento, type ConsultaDocumento, createCliente, listZonas, listPlanes, type Zona, type Plan } from 'src/lib/clientes';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  /** Preselecciona el tipo de conexión según la sección desde la que se abre */
  tipoInicial?: 'fibra_optica' | 'inalambrico';
}

const ClienteCreateDialog = ({ open, onOpenChange, onCreated, tipoInicial }: Props) => {
  const navigate = useNavigate();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [tipoDocumento, setTipoDocumento] = useState<'dni' | 'ruc'>('dni');
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [ruc, setRuc] = useState('');
  const [responsableNombre, setResponsableNombre] = useState('');
  // Resultado de la consulta automática de nombre: nunca bloquea el alta
  const [consultaDni, setConsultaDni] = useState<ConsultaDocumento | null>(null);
  const [consultaRuc, setConsultaRuc] = useState<ConsultaDocumento | null>(null);
  const [buscando, setBuscando] = useState<'dni' | 'ruc' | null>(null);
  // Si el nombre lo trajo la consulta, al cambiar el documento se reemplaza.
  // Si lo escribió el operador, se respeta y no se pisa.
  const [nombreAuto, setNombreAuto] = useState(false);
  const [responsableAuto, setResponsableAuto] = useState(false);
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [zonaId, setZonaId] = useState<string>('');
  const [planId, setPlanId] = useState<string>('');
  const [cantidadTv, setCantidadTv] = useState('0');
  const [notas, setNotas] = useState('');
  const [tipoConexion, setTipoConexion] = useState<'fibra_optica' | 'inalambrico'>(
    tipoInicial ?? 'fibra_optica',
  );

  useEffect(() => {
    if (open) {
      listZonas().then(setZonas);
      listPlanes().then((all) => setPlanes(all.filter((p) => p.tipo_conexion !== 'satelital')));
    }
  }, [open]);

  function resetForm() {
    setTipoDocumento('dni');
    setNombre('');
    setDni('');
    setRuc('');
    setResponsableNombre('');
    setConsultaDni(null);
    setConsultaRuc(null);
    setBuscando(null);
    setNombreAuto(false);
    setResponsableAuto(false);
    setTelefono('');
    setDireccion('');
    setZonaId('');
    setPlanId('');
    setCantidadTv('0');
    setNotas('');
    setTipoConexion(tipoInicial ?? 'fibra_optica');
    setError(null);
  }

  const esEmpresa = tipoDocumento === 'ruc';

  /** El inalámbrico es servicio doméstico: no se venden empresas por esa vía,
   *  así que si se cambia a inalámbrico el alta vuelve a ser de persona. */
  useEffect(() => {
    if (tipoConexion === 'inalambrico' && tipoDocumento !== 'dni') {
      setTipoDocumento('dni');
      setRuc('');
      setResponsableNombre('');
      setConsultaRuc(null);
      setResponsableAuto(false);
    }
  }, [tipoConexion, tipoDocumento]);

  /** Al completar el documento se busca el nombre. Si no se puede, se deja
   *  escrito el motivo y el campo sigue editable: el alta nunca se bloquea. */
  async function buscarNombre(tipo: 'dni' | 'ruc', numero: string) {
    setBuscando(tipo);
    try {
      const r = await consultarDocumento(tipo, numero);
      if (tipo === 'dni') setConsultaDni(r);
      else setConsultaRuc(r);

      // El DNI llena el nombre del titular, o el del responsable si es empresa.
      // Se sobrescribe solo lo que puso una consulta anterior: si el operador
      // escribió el nombre a mano, se queda como lo dejó.
      const aplicar = (
        valorActual: string,
        eraAuto: boolean,
        poner: (v: string) => void,
        marcar: (v: boolean) => void,
      ) => {
        if (r.encontrado && r.nombre) {
          if (eraAuto || !valorActual.trim()) {
            poner(r.nombre);
            marcar(true);
          }
        } else if (eraAuto) {
          // El documento cambió y el nuevo no se encontró: el nombre anterior
          // ya no corresponde, así que se limpia en vez de dejarlo desfasado.
          poner('');
          marcar(false);
        }
      };

      if (tipo === 'dni' && esEmpresa) {
        aplicar(responsableNombre, responsableAuto, setResponsableNombre, setResponsableAuto);
      } else {
        aplicar(nombre, nombreAuto, setNombre, setNombreAuto);
      }
    } catch {
      const fallo = {
        encontrado: false,
        nombre: null,
        origen: 'sin_respuesta',
        motivo: 'No se pudo consultar. Escribe el nombre a mano.',
      } as ConsultaDocumento;
      if (tipo === 'dni') setConsultaDni(fallo);
      else setConsultaRuc(fallo);
    } finally {
      setBuscando(null);
    }
  }

  /** Aviso bajo el campo, con el tono según lo que pasó. */
  function AvisoConsulta({ r, tipo }: { r: ConsultaDocumento | null; tipo: 'dni' | 'ruc' }) {
    if (buscando === tipo) {
      return <p className="mt-1.5 text-xs text-muted-foreground">Buscando el nombre…</p>;
    }
    if (!r) return null;
    if (r.origen === 'sistema') {
      return <p className="mt-1.5 text-xs text-warning-text">{r.motivo}</p>;
    }
    if (r.encontrado) {
      return (
        <p className="mt-1.5 text-xs text-success-text">
          Nombre traído automáticamente
          {r.estado ? ` · ${r.estado}` : ''}
          {r.uso && r.uso.aviso ? ` · quedan ${r.uso.restantes} consultas este mes` : ''}
        </p>
      );
    }
    return <p className="mt-1.5 text-xs text-muted-foreground">{r.motivo}</p>;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!zonaId || !planId) {
      setError('Selecciona zona y plan.');
      return;
    }
    if (esEmpresa) {
      if (!/^(10|15|17|20)\d{9}$/.test(ruc)) {
        setError('El RUC debe tener 11 dígitos y empezar en 10, 15, 17 o 20.');
        return;
      }
      if (!responsableNombre.trim()) {
        setError('Indica el nombre del responsable de la empresa.');
        return;
      }
    }
    setLoading(true);
    try {
      const cliente = await createCliente({
        nombre,
        tipo_documento: tipoDocumento,
        dni,
        ruc: esEmpresa ? ruc : undefined,
        responsable_nombre: esEmpresa ? responsableNombre.trim() : undefined,
        telefono: telefono || undefined,
        direccion: direccion || undefined,
        zona_id: Number(zonaId),
        plan_id: Number(planId),
        cantidad_tv: Number(cantidadTv) || 0,
        tipo_conexion: tipoConexion,
        notas: notas || undefined,
      });
      resetForm();
      onOpenChange(false);
      onCreated?.();
      toast.success('Cliente registrado');
      navigate(`/clientes/${cliente.id}`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'No se pudo registrar el cliente');
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
      title="Registrar cliente"
      subtitle="Crea un nuevo cliente en el sistema"
      icon="tabler:user-plus"
      tone="brand"
      size="lg"
      footer={
        <FormActions
          onCancel={() => onOpenChange(false)}
          submitLabel="Registrar"
          submitForm="cliente-create-form"
          submitting={loading}
        />
      }
    >
      <form id="cliente-create-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
        <FormCallout>
          <strong className="font-semibold">Queda pendiente de aprobación</strong> — el usuario y
          clave PPPoE se generan automáticamente a partir del DNI
          {esEmpresa ? ' del responsable' : ''}.
        </FormCallout>

        {/* Tipo de cliente: cambia qué campos se piden debajo.
            Solo en fibra — el inalámbrico es doméstico, nunca empresa. */}
        {tipoConexion === 'fibra_optica' && (
          <div>
            <Label className="mb-2 gap-1.5 text-[13px] font-semibold">
              <Icon icon="tabler:users" width={16} className="text-primary-text" />
              Tipo de cliente
            </Label>
            <SegmentedChoice
              label="Tipo de cliente"
              valor={tipoDocumento}
              onChange={setTipoDocumento}
              opciones={[
                { valor: 'dni', etiqueta: 'Persona', icono: 'tabler:user' },
                { valor: 'ruc', etiqueta: 'Empresa', icono: 'tabler:building' },
              ]}
            />
          </div>
        )}

        <FormGrid>
          {esEmpresa ? (
            <>
              <FormSection title="Datos de la empresa" icon="tabler:building">
                <FormField label="Razón social" htmlFor="nombre" required>
                  <FieldIcon icon="tabler:building">
                    <Input
                      id="nombre"
                      value={nombre}
                      onChange={(e) => {
                        setNombre(e.target.value);
                        setNombreAuto(false);
                      }}
                      placeholder="Transportes del Sur S.A.C."
                      required
                    />
                  </FieldIcon>
                </FormField>

                <FormField label="RUC" htmlFor="ruc" required>
                  <FieldIcon icon="tabler:id">
                    <Input
                      id="ruc"
                      value={ruc}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '');
                        setRuc(v);
                        setConsultaRuc(null);
                        if (v.length === 11) void buscarNombre('ruc', v);
                      }}
                      maxLength={11}
                      inputMode="numeric"
                      placeholder="11 dígitos"
                      required
                    />
                  </FieldIcon>
                  <AvisoConsulta r={consultaRuc} tipo="ruc" />
                </FormField>
              </FormSection>

              <FormSection title="Responsable del servicio" icon="tabler:user-shield">
                <FormField label="Responsable del servicio" htmlFor="responsable" required>
                  <FieldIcon icon="tabler:user">
                    <Input
                      id="responsable"
                      value={responsableNombre}
                      onChange={(e) => {
                        setResponsableNombre(e.target.value);
                        setResponsableAuto(false);
                      }}
                      placeholder="Gerente o persona de contacto"
                      required
                    />
                  </FieldIcon>
                </FormField>

                <FormField
                  label="DNI del responsable"
                  htmlFor="dni"
                  required
                  hint="De este DNI salen el usuario y la clave PPPoE. El RUC no se usa como credencial porque es información pública."
                >
                  <FieldIcon icon="tabler:id">
                    <Input
                      id="dni"
                      value={dni}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '');
                        setDni(v);
                        setConsultaDni(null);
                        if (v.length === 8) void buscarNombre('dni', v);
                      }}
                      maxLength={8}
                      inputMode="numeric"
                      pattern="\d{8}"
                      required
                    />
                  </FieldIcon>
                  <AvisoConsulta r={consultaDni} tipo="dni" />
                </FormField>
              </FormSection>
            </>
          ) : (
            <FormSection title="Datos del titular" icon="tabler:user">
              <FormField label="Nombre completo" htmlFor="nombre" required>
                <FieldIcon icon="tabler:user">
                  <Input
                    id="nombre"
                    value={nombre}
                    onChange={(e) => {
                      setNombre(e.target.value);
                      setNombreAuto(false);
                    }}
                    required
                  />
                </FieldIcon>
              </FormField>

              <FormField label="DNI" htmlFor="dni" required>
                <FieldIcon icon="tabler:id">
                  <Input
                    id="dni"
                    value={dni}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '');
                      setDni(v);
                      setConsultaDni(null);
                      if (v.length === 8) void buscarNombre('dni', v);
                    }}
                    maxLength={8}
                    inputMode="numeric"
                    pattern="\d{8}"
                    required
                  />
                </FieldIcon>
                <AvisoConsulta r={consultaDni} tipo="dni" />
              </FormField>
            </FormSection>
          )}

          <FormSection title="Información de contacto" icon="tabler:address-book">
            <FormField label="Teléfono / WhatsApp" icon="tabler:brand-whatsapp" htmlFor="telefono">
              <FieldIcon icon="tabler:brand-whatsapp">
                <Input id="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              </FieldIcon>
            </FormField>

            <FormField label="Dirección" icon="tabler:map-2" htmlFor="direccion">
              <FieldIcon icon="tabler:map-2">
                <Input
                  id="direccion"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                />
              </FieldIcon>
            </FormField>
          </FormSection>

          <FormSection title="Datos del servicio" icon="tabler:router">
            {/* La sección desde la que se registra ya decide el tipo */}
            {!tipoInicial && (
              <FormField label="Tipo de conexión" icon="tabler:router">
                <Select
                  value={tipoConexion}
                  onValueChange={(v) => setTipoConexion(v as 'fibra_optica' | 'inalambrico')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fibra_optica">Fibra óptica</SelectItem>
                    <SelectItem value="inalambrico">Inalámbrico</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            )}

            <FormField label="Zona" icon="tabler:map-pin" required>
              <FieldIcon icon="tabler:map-pin">
                <Select value={zonaId} onValueChange={setZonaId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona una zona" />
                  </SelectTrigger>
                  <SelectContent>
                    {zonas.map((z) => (
                      <SelectItem key={z.id} value={String(z.id)}>
                        {z.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldIcon>
            </FormField>

            <FormField label="Plan" icon="tabler:stack-2" required>
              <FieldIcon icon="tabler:stack-2">
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona un plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {planes.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.nombre} — S/ {p.precio}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldIcon>
            </FormField>

            <FormField label="Cantidad de TV" icon="tabler:device-tv" htmlFor="cantidadTv">
              <Input
                id="cantidadTv"
                type="number"
                min={0}
                value={cantidadTv}
                onChange={(e) => setCantidadTv(e.target.value)}
              />
            </FormField>

            <FormField label="Notas" icon="tabler:notes" htmlFor="notas" wide>
              <Textarea
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Observaciones adicionales…"
              />
            </FormField>
          </FormSection>
        </FormGrid>

        {error && (
          <FormCallout tone="error">
            <span className="font-medium">{error}</span>
          </FormCallout>
        )}
      </form>
    </FormDialog>
  );
};

export default ClienteCreateDialog;
