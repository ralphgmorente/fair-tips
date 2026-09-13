import { redirect } from "next/navigation";

/** Each view has its own address, so a refresh lands where you were. */
export default function Home() {
  redirect("/dashboard");
}
