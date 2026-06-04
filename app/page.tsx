import { redirect } from "next/navigation";

// Bare-domain hit lands on /register. Middleware bounces unauthenticated
// visitors from there to /login, so authenticated users see the register
// directly and unauthenticated users see the login form — never the
// Next.js starter scaffold (which previously sat here).
export default function Home() {
  redirect("/register");
}
