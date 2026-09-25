import type { ReactNode } from "react";

import { BrandMark } from "@/presentation/design/brand-mark";

export function LoginScreen({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="admin-login" id="admin-content">
      <section className="admin-login__panel" aria-labelledby="login-title">
        <BrandMark />
        <h1 id="login-title">Staff sign in</h1>
        <p className="admin-login__lede">
          Access is limited to Rivana Residence staff accounts. There is no
          public registration.
        </p>
        {children}
        <p className="admin-login__help">
          Forgotten your password? Ask a Rivana administrator to reset it.
        </p>
      </section>
    </main>
  );
}
