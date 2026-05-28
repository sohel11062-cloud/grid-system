import "server-only";

import {
  DEFAULT_CREDS_PER_RUPEE,
  normalizeCredsPerRupee,
  type GridEconomyConfig,
} from "@/lib/grid";

import { getRepository } from "@/server/storage/repository";

let currentEconomyConfig: GridEconomyConfig = {
  credsPerRupee:
    DEFAULT_CREDS_PER_RUPEE,

  updatedAt:
    new Date(0).toISOString(),
};

export async function getEconomyConfig(): Promise<GridEconomyConfig> {
  const persisted =
    await getRepository().getEconomyConfig();

  if (persisted) {
    currentEconomyConfig = {
      ...persisted,
      credsPerRupee:
        normalizeCredsPerRupee(
          persisted.credsPerRupee,
        ),
    };
  }

  return {
    ...currentEconomyConfig,
  };
}

export async function getConversionRate(): Promise<number> {
  const config =
    await getEconomyConfig();

  return config.credsPerRupee;
}

export async function setConversionRate(
  value: number,
  updatedBy?: string,
): Promise<GridEconomyConfig> {
  const config: GridEconomyConfig = {
    credsPerRupee:
      normalizeCredsPerRupee(
        value,
      ),

    updatedAt:
      new Date().toISOString(),

    updatedBy,
  };

  currentEconomyConfig =
    await getRepository().saveEconomyConfig(
      config,
    );

  return {
    ...currentEconomyConfig,
  };
}
