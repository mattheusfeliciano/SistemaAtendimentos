import { Atendimento, Turno } from './types';

export const INITIAL_DATA: Atendimento[] = [
  {
    id: '1',
    data: new Date().toISOString().split('T')[0],
    turno: Turno.MANHA,
    departamento: 'TI',
    atividade: 'Manutenção de Servidor',
    responsavel: 'Ricardo Silva',
    local: 'Data Center',
    createdAt: new Date().toISOString()
  },
  {
    id: '2',
    data: new Date().toISOString().split('T')[0],
    turno: Turno.TARDE,
    departamento: 'RH',
    atividade: 'Entrevista de Candidato',
    responsavel: 'Maria Oliveira',
    local: 'Sala de Reunião 1',
    createdAt: new Date().toISOString()
  },
  {
    id: '3',
    data: new Date().toISOString().split('T')[0],
    turno: Turno.NOITE,
    departamento: 'Segurança',
    atividade: 'Ronda Perimetral',
    responsavel: 'João Souza',
    local: 'Pátio Externo',
    createdAt: new Date().toISOString()
  }
];

export const DEPARTAMENTOS = [];
export const LOCAIS = [];

