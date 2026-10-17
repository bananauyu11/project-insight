"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "ホーム" },
  { href: "/deliverables", label: "成果物" },
  { href: "/checks", label: "チェック観点" },
  { href: "/cross", label: "横断観点" },
  { href: "/csv", label: "CSV管理" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand">
          Project Insight
        </Link>
        <nav aria-label="メイン">
          <ul className="nav">
            {LINKS.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <li key={l.href}>
                  <Link href={l.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
