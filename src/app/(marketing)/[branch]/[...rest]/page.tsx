import { notFound } from "next/navigation";

// Unknown paths inside a branch get the branch's own 404 page and shell
// (spec 0002), rather than the root not-found page.
export default function UnknownBranchPath() {
  notFound();
}
