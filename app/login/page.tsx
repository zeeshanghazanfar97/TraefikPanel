import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { AUTH_SESSION_COOKIE, isAuthEnabled, isValidSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const authEnabled = isAuthEnabled();
  if (!authEnabled) {
    redirect("/");
  }

  const token = cookies().get(AUTH_SESSION_COOKIE)?.value;
  if (isValidSessionToken(token)) {
    redirect("/");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute -top-32 left-[-12%] h-[34rem] w-[34rem] rounded-full bg-orange-300/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-12rem] right-[-6rem] h-[34rem] w-[34rem] rounded-full bg-cyan-300/30 blur-3xl" />
      <div className="relative z-10 w-full max-w-md">
        <LoginForm />
      </div>
    </main>
  );
}
