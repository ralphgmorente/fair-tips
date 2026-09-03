import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in · ShiftFlow"
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;
  return <LoginForm redirectTo={redirectTo ?? "/"} />;
}
