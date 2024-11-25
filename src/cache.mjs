import process from "node:process";
import os from "node:os";
import cache from "@actions/cache";
import core from "@actions/core";

const state = {
  DENO_DIR: "DENO_DIR",
  CACHE_HIT: "CACHE_HIT",
  CACHE_SAVE: "CACHE_SAVE",
};

export async function saveCache() {
  if (!cache.isFeatureAvailable()) {
    core.warning("Caching is not available. Caching is skipped.");
    return;
  }

  const denoDir = core.getState(state.DENO_DIR);
  const saveKey = core.getState(state.CACHE_SAVE);
  if (!denoDir || !saveKey) {
    core.info("Caching is not enabled. Caching is skipped.");
    return;
  } else if (core.getState(state.CACHE_HIT) === "true") {
    core.info(
      `Cache hit occurred on the primary key "${saveKey}", not saving cache.`,
    );
    return;
  }

  await cache.saveCache([denoDir], saveKey);
  core.info(`Cache saved with key: "${saveKey}".`);
}

/**
 * @param {string} cacheHash Should be a hash of any lockfiles or similar.
 */
export async function restoreCache(cacheHash) {
  try {
    const denoDir = await resolveDenoDir();
    core.saveState(state.DENO_DIR, denoDir);

    const { GITHUB_JOB, RUNNER_OS } = process.env;
    const restoreKey = `deno-cache-${RUNNER_OS}-${os.arch()}`;
    // CI jobs often download different dependencies, so include Job ID in the cache key.
    const primaryKey = `${restoreKey}-${GITHUB_JOB}-${cacheHash}`;
    core.saveState(state.CACHE_SAVE, primaryKey);

    const loadedCacheKey = await cache.restoreCache([denoDir], primaryKey, [
      restoreKey,
    ]);
    const cacheHit = primaryKey === loadedCacheKey;
    core.setOutput("cache-hit", cacheHit);
    core.saveState(state.CACHE_HIT, cacheHit);

    const message = loadedCacheKey
      ? `Cache key used: "${loadedCacheKey}".`
      : `No cache found for restore key: "${restoreKey}".`;
    core.info(message);
  } catch (err) {
    core.warning(
      new Error("Failed to restore cache. Continuing without cache.", {
        cause: err,
      }),
    );
  }
}

/**
 * @returns {Promise<string>}
 */
async function resolveDenoDir() {
  const { DENO_DIR } = process.env;
  if (DENO_DIR) return DENO_DIR;

  // Retrieve the DENO_DIR from `deno info --json`
  const { exec } = await import("node:child_process");
  const output = await new Promise((res, rej) => {
    exec("deno info --json", (err, stdout) => err ? rej(err) : res(stdout));
  });
  return JSON.parse(output).denoDir;
}
