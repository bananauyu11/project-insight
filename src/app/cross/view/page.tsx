import { Suspense } from "react";
import { EntityDetail } from "@/components/EntityDetail";

export default function Page() {
  return (
    <Suspense>
      <EntityDetail type="cross" />
    </Suspense>
  );
}
