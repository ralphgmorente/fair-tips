"use client";

import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      className="secondary-button compact"
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
    >
      <LockKeyhole aria-hidden="true" size={17} />
      {isSigningOut ? "Signing out..." : "Sign out"}
    </button>
  );
}
