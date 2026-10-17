import { Suspense } from "react";
import { EntityList } from "@/components/EntityList";

export default function Page() {
  return (
    <Suspense>
      <EntityList type="deliverables" />
    </Suspense>
  );
}
