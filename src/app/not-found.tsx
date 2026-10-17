import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty">
      <p>ページが見つかりません。</p>
      <Link href="/">ホームへ戻る</Link>
    </div>
  );
}
