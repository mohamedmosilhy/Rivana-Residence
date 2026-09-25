import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";

import { safeReturnPath } from "@/application/auth/return-path";
import { getCurrentStaff } from "@/composition/auth";
import { LoginForm } from "@/presentation/admin/auth/login-form";
import { LoginScreen } from "@/presentation/admin/auth/login-screen";

import { signInAction } from "./actions";

export const metadata: Metadata = {
  title: "Sign in",
};

type LoginPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const returnTo = safeReturnPath((await searchParams).returnTo);
  if (await getCurrentStaff()) redirect(returnTo as Route);

  return (
    <LoginScreen>
      <LoginForm action={signInAction} returnTo={returnTo} />
    </LoginScreen>
  );
}
