import { Suspense } from "react";
import { EntityForm } from "@/components/EntityForm";

export default function Page() {
  return (
    <Suspense>
      <EntityForm type="checks" />
    </Suspense>
  );
}
