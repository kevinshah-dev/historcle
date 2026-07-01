"use client";

import { ClerkProvider } from "@clerk/react";
import type { ReactNode } from "react";

type AppProvidersProps = {
  children: ReactNode;
  publishableKey: string;
};

export function AppProviders({ children, publishableKey }: AppProvidersProps) {
  return <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>;
}
