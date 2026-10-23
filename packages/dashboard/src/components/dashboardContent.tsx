import { useRouter } from "next/router";
import React from "react";

import DashboardHead from "./dashboardHead";
import EmbedLayout from "./embed/embedLayout";
import MainLayout from "./mainLayout";

export default function DashboardContent({
  children,
}: {
  children?: React.ReactNode;
}) {
  const router = useRouter();
  // Embed pages render the existing components chrome-free, without the
  // dashboard's sidebar/nav/header.
  if (router.pathname.startsWith("/embed")) {
    return (
      <>
        <DashboardHead />
        <EmbedLayout>
          <>{children}</>
        </EmbedLayout>
      </>
    );
  }
  return (
    <>
      <DashboardHead />
      <MainLayout>
        <>{children}</>
      </MainLayout>
    </>
  );
}
