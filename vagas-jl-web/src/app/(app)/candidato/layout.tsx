import { AppShell } from '@/components/layout/app-shell';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell role="candidate">{children}</AppShell>;
}
