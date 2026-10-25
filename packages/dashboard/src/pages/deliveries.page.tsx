import { Box } from "@mui/material";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { getOrCreateSmsProviders } from "backend-lib/src/messaging/sms";
import { eq } from "drizzle-orm";
import { GetServerSideProps } from "next";

import DashboardContent from "../components/dashboardContent";
import {
  DEFAULT_DELIVERIES_TABLE_V2_PROPS,
  DeliveriesTableV2,
} from "../components/deliveriesTableV2";
import { addInitialStateToProps } from "../lib/addInitialStateToProps";
import { requestContext } from "../lib/requestContext";
import { PropsWithInitialState } from "../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, dfContext) => {
    const workspaceId = dfContext.workspace.id;
    // Same default SMS provider lookup the settings UI uses, seeded so the
    // deliveries table can fall back on it for the SMS From column.
    const [smsProviders, defaultSmsProvider] = await Promise.all([
      getOrCreateSmsProviders({ workspaceId }),
      db().query.defaultSmsProvider.findFirst({
        where: eq(schema.defaultSmsProvider.workspaceId, workspaceId),
      }),
    ]);

    return {
      props: addInitialStateToProps({
        props: {},
        dfContext,
        serverInitialState: {
          smsProviders,
          defaultSmsProvider,
        },
      }),
    };
  });

export default function DeliveriesPage() {
  return (
    <DashboardContent>
      <Box sx={{ width: "100%", pr: 2, pl: 2, pt: 1, height: "100%" }}>
        <DeliveriesTableV2 {...DEFAULT_DELIVERIES_TABLE_V2_PROPS} />
      </Box>
    </DashboardContent>
  );
}
