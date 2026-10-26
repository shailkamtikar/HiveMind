import { notFound } from "next/navigation";
import { DesignClient } from "./DesignClient";

// Temporary showcase; hidden in production builds.
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignClient />;
}
