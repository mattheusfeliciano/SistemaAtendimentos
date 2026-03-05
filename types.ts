export enum Turno {
  MANHA = 'Manhã',
  TARDE = 'Tarde',
  NOITE = 'Noite'
}

export interface Atendimento {
  id: string;
  data: string;
  turno: Turno;
  departamento: string;
  atividade: string;
  responsavel: string;
  local: string;
  createdBy?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  updatedByName?: string | null;
  createdAt: string;
}

export interface ChartData {
  name: string;
  value: number;
}
