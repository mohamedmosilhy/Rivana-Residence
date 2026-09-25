"use server";

import { redirect } from "next/navigation";

import { signOutCurrentSession } from "@/composition/auth";

export async function signOutAction() {
  await signOutCurrentSession();
  redirect("/admin/login");
}
