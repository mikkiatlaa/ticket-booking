import type { APIRoute } from "astro";
import { logout } from "../../lib/admin-auth";

// POST (from the Log out button) -> clears the admin cookie, back to the login page.
export const POST: APIRoute = ({ cookies, redirect }) => {
  logout(cookies);
  return redirect("/admin/login", 303);
};
