import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/admin-auth";
import { AdminNav } from "../admin-nav";
import { Scanner } from "./scanner";

export default async function ScanPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");

  return (
    <>
      <AdminNav admin={admin} />
      <Scanner />
    </>
  );
}
