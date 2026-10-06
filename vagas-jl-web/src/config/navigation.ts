import {
  Activity,
  Briefcase,
  Building2,
  FileSearch,
  Gauge,
  LayoutDashboard,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/api/types';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAVIGATION: Record<Role, NavItem[]> = {
  candidate: [
    { href: '/candidato', label: 'Visão geral', icon: LayoutDashboard },
    { href: '/candidato/vagas', label: 'Vagas para mim', icon: Sparkles },
    { href: '/candidato/todas-vagas', label: 'Todas as vagas', icon: Briefcase },
    { href: '/candidato/perfil-match', label: 'Perfil de Match', icon: Gauge },
    { href: '/candidato/cadastro', label: 'Dados profissionais', icon: UserRound },
    { href: '/candidato/engajamento', label: 'Engajamento', icon: Activity },
    { href: '/candidato/privacidade', label: 'Privacidade', icon: ShieldCheck },
  ],
  company: [
    { href: '/empresa', label: 'Visão geral', icon: LayoutDashboard },
    { href: '/empresa/vagas', label: 'Vagas cadastradas', icon: FileSearch },
    { href: '/empresa/candidatos', label: 'Candidatos', icon: Users },
    { href: '/empresa/cadastro', label: 'Meus dados', icon: UserRound },
  ],
  admin: [
    { href: '/admin', label: 'Visão geral', icon: LayoutDashboard },
    { href: '/admin/perfil', label: 'Meus dados', icon: UserRound },
    { href: '/admin/candidatos', label: 'Candidatos', icon: Users },
    { href: '/admin/vagas', label: 'Vagas', icon: FileSearch },
    { href: '/admin/configuracoes', label: 'Parâmetros do Match', icon: SlidersHorizontal },
  ],
  master: [
    { href: '/master', label: 'Visão geral', icon: LayoutDashboard },
    { href: '/master/empresas', label: 'Empresas', icon: Building2 },
    { href: '/master/candidatos', label: 'Status dos candidatos', icon: Users },
    { href: '/master/importacao', label: 'Importar vagas', icon: UploadCloud },
    { href: '/master/vagas', label: 'Vagas cadastradas', icon: FileSearch },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  candidate: 'Candidato',
  company: 'Recrutador',
  admin: 'Recrutador',
  master: 'Master',
};
