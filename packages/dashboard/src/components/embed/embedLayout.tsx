import { Box } from "@mui/material";
import React from "react";

/**
 * Minimal chrome-free layout for embed pages: no sidebar, nav, or header,
 * just a full-size surface for the embedded component.
 */
export default function EmbedLayout({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100vh",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {children}
    </Box>
  );
}
