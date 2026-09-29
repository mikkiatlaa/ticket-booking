import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/admin-auth";
import { AdminNav } from "../admin-nav";
import { GuestList } from "./guest-list";

export default async function GuestsPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");

  return (
    <>
      <AdminNav admin={admin} />
      <GuestList />
    </>
  );
}
