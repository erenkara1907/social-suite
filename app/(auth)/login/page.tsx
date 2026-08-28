import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata = { title: "Giriş" };

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
