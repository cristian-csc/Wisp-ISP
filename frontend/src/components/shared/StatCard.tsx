import CardBox from './CardBox';
import Cifra, { type TonoCifra } from './Cifra';

export type TonoStat = 'primary' | 'brand' | 'success' | 'warning' | 'error' | 'info';

/** Las tarjetas son neutras: el verde y el rojo se reservan para los estados
 *  y avisos, donde sí significan algo. Solo el dinero lleva el naranja. */
const TONOS: Record<TonoStat, TonoCifra> = {
  primary: 'neutro',
  brand: 'marca',
  success: 'neutro',
  warning: 'neutro',
  error: 'neutro',
  info: 'neutro',
};

interface Props {
  icono: string;
  etiqueta: string;
  valor: string | number;
  /** Línea pequeña bajo el valor */
  nota?: React.ReactNode;
  /** Variación respecto al periodo anterior, en porcentaje */
  delta?: number | null;
  tono?: TonoStat;
  to?: string;
}

/** Una cifra suelta en su propia tarjeta. Por dentro es la misma Cifra de
 *  las tiras de indicadores, para que todas se lean igual. */
const StatCard = ({ icono, etiqueta, valor, nota, delta, tono = 'primary', to }: Props) => (
  <CardBox className="h-full gap-0 overflow-hidden !p-0">
    <Cifra icono={icono} etiqueta={etiqueta} valor={valor} nota={nota} delta={delta} tono={TONOS[tono]} to={to} />
  </CardBox>
);

export default StatCard;
