import { and, eq } from "drizzle-orm";
import { SMS_PROVIDER_TYPE_TO_SECRET_NAME } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { db, upsert } from "../db";
import {
  defaultSmsProvider as dbDefaultSmsProvider,
  secret as dbSecret,
  smsProvider as dbSmsProvider,
} from "../db/schema";
import logger from "../logger";
import {
  PersistedSmsProvider,
  SmsProvider,
  SmsProviderType,
  UpsertSmsProviderRequest,
} from "../types";

export async function upsertSmsProvider({
  workspaceId,
  config,
  setDefault,
}: UpsertSmsProviderRequest): Promise<PersistedSmsProvider> {
  const secretName = SMS_PROVIDER_TYPE_TO_SECRET_NAME[config.type];
  return db().transaction(async (tx) => {
    const secret = await upsert({
      table: dbSecret,
      tx,
      target: [dbSecret.workspaceId, dbSecret.name],
      values: {
        workspaceId,
        name: secretName,
        configValue: config,
      },
      set: {
        configValue: config,
      },
    }).then(unwrap);
    const existingSmsProvider = await tx.query.smsProvider.findFirst({
      where: and(
        eq(dbSmsProvider.workspaceId, workspaceId),
        eq(dbSmsProvider.type, config.type),
      ),
    });
    let smsProvider: SmsProvider;
    if (existingSmsProvider) {
      smsProvider = existingSmsProvider;
    } else {
      const [newSmsProvider] = await tx
        .insert(dbSmsProvider)
        .values({
          workspaceId,
          type: config.type,
          secretId: secret.id,
        })
        .returning();

      if (!newSmsProvider) {
        throw new Error("Failed to upsert SMS provider");
      }
      smsProvider = newSmsProvider;
    }
    if (setDefault) {
      await upsert({
        table: dbDefaultSmsProvider,
        tx,
        target: [dbDefaultSmsProvider.workspaceId],
        values: {
          workspaceId,
          smsProviderId: smsProvider.id,
        },
        set: {
          smsProviderId: smsProvider.id,
        },
      }).then(unwrap);
    }
    return {
      workspaceId: smsProvider.workspaceId,
      id: smsProvider.id,
      type: config.type,
    };
  });
}

export async function getWorkspaceSmsFromNumber({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<string | null> {
  const defaultProvider = await db().query.defaultSmsProvider.findFirst({
    where: eq(dbDefaultSmsProvider.workspaceId, workspaceId),
    with: {
      smsProvider: {
        with: {
          secret: true,
        },
      },
    },
  });
  const secret = defaultProvider?.smsProvider?.secret;
  if (!secret) {
    return null;
  }
  const { configValue, value } = secret;
  if (
    typeof configValue === "object" &&
    configValue !== null &&
    "from" in configValue
  ) {
    const from = (configValue as { from: unknown }).from;
    if (typeof from === "string" && from.length > 0) {
      return from;
    }
  }
  return value && value.length > 0 ? value : null;
}

export async function getOrCreateSmsProviders({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<PersistedSmsProvider[]> {
  const smsProviders: PersistedSmsProvider[] = (
    await db().query.smsProvider.findMany({
      where: eq(dbSmsProvider.workspaceId, workspaceId),
      with: {
        secret: true,
      },
    })
  ).flatMap((ep) => {
    let type: SmsProviderType;
    switch (ep.type) {
      case SmsProviderType.Twilio:
        type = SmsProviderType.Twilio;
        break;
      case SmsProviderType.Test:
        type = SmsProviderType.Test;
        break;
      case SmsProviderType.SignalWire:
        type = SmsProviderType.SignalWire;
        break;
      case SmsProviderType.Quo:
        type = SmsProviderType.Quo;
        break;
      default:
        logger().error(
          {
            workspaceId,
            smsProviderType: ep.type,
          },
          "Unknown sms provider type",
        );
        return [];
    }
    return {
      workspaceId: ep.workspaceId,
      id: ep.id,
      type,
    };
  });

  const upsertPromises: Promise<unknown>[] = [];
  for (const typeKey in SmsProviderType) {
    const type = SmsProviderType[typeKey as keyof typeof SmsProviderType];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    const missing = smsProviders.find((ep) => ep.type === type) === undefined;
    if (missing) {
      upsertPromises.push(
        upsertSmsProvider({
          workspaceId,
          config: { type },
        }).then((smsProvider) => {
          if (smsProvider) {
            smsProviders.push(smsProvider);
          }
        }),
      );
    }
  }
  await Promise.all(upsertPromises);
  return smsProviders;
}
