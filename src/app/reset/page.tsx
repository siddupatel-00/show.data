import { Suspense } from "react";
import { ResetForm } from "@/components/reset-form";

export const metadata = { title: "Reset password — SidFast" };

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
