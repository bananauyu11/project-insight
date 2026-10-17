import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Insight — プロジェクト課題発見ナレッジ基盤",
  description: "大規模ITプロジェクトの成果物・チェック観点・横断的な課題発見観点を蓄積し、課題・リスク・改善機会の発見に活用するナレッジ基盤",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <Nav />
        <main className="container">{children}</main>
        <footer className="site-footer container muted">データはこのブラウザ内にのみ保存され、サーバーには送信されません。</footer>
      </body>
    </html>
  );
}
