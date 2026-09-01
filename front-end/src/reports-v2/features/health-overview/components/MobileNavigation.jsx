import { ChartNoAxesCombined, FileText, Stethoscope, UserRound } from 'lucide-react';

const ITEMS = [
  { href: '#hero', label: '报告', Icon: FileText },
  { href: '#trend', label: '趋势', Icon: ChartNoAxesCombined },
  { href: '#insight', label: '专家', Icon: Stethoscope },
  { href: '#next-assessment', label: '我的', Icon: UserRound },
];

export function MobileNavigation() {
  return (
    <nav className="health-overview__mobile-nav" aria-label="报告区块导航">
      {ITEMS.map(({ href, label, Icon }) => (
        <a key={href} href={href}>
          <Icon aria-hidden="true" size={21} />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
