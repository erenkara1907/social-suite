import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata = { title: "Kayıt" };

export default function SignupPage() {
  return <AuthScreen mode="signup" />;
}
