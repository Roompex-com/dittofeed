import { Box, Stack, Typography } from "@mui/material";
import { GetServerSideProps } from "next";
import React from "react";

import DashboardHead from "../../components/dashboardHead";

export const getServerSideProps: GetServerSideProps = async (context) => {
  context.res.statusCode = 401;
  return {
    props: {},
  };
};

export default function EmbedUnauthorizedPage() {
  return (
    <>
      <DashboardHead />
      <Box
        sx={{
          width: "100%",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Stack spacing={1} alignItems="center">
          <Typography variant="h1">401</Typography>
          <Typography color="text.secondary">
            This embed link is invalid or expired. Request a new link.
          </Typography>
        </Stack>
      </Box>
    </>
  );
}
