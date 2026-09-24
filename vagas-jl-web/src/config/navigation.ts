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
    { href: '/candidato/perfil-match', label: 'Perfil de Match', icon: Gauge },
    { href: '/candidato/cadastro', label: 'Dados profissionais', icon: UserRound },
    { href: '/candidato/engajamento', label: 'Engajamento', icon: Activity },
    { href: '/candidato/privacidade', label: 'Privacidade', icon: ShieldCheck },
  ],
  company: [
    { href: '/empresa', label: 'Visão geral', icon: LayoutDashboard },
    { href: '/empresa/vagas/nova', label: 'Nova vaga', icon: Briefcase },
    { href: '/empresa/ranking', label: 'Top candidatos', icon: Users },
    { href: '/empresa/cadastro', label: 'Dados da empresa', icon: Building2 },
  ],
  admin: [
    { href: '/admin', label: 'Visão geral', icon: LayoutDashboard },
    { href: '/admin/empresas', label: 'Empresas', icon: Building2 },
    { href: '/admin/candidatos', label: 'Candidatos', icon: Users },
    { href: '/admin/vagas', label: 'Vagas', icon: FileSearch },
    { href: '/admin/configuracoes', label: 'Parâmetros do Match', icon: SlidersHorizontal },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  candidate: 'Candidato',
  company: 'Empresa',
  admin: 'Administrador',
};
