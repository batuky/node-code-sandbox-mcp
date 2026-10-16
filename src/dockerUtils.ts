import { execFile, execFileSync } from 'child_process';
import util from 'util';
import { logger } from './logger.ts';
import { getConfig } from './config.ts';
import { textContent } from './types.ts';
import { sanitizeContainerId, sanitizeShellCommand } from './utils.ts';

const execFilePromise = util.promisify(execFile);

/**
 * Attempts to forcefully stop and remove a Docker container by its ID.
 * Logs errors but does not throw them to allow cleanup flows to continue.
 * Does NOT manage any external container registry/map.
 * @param containerId The ID of the container to stop and remove.
 */
export async function forceStopContainer(containerId: string): Promise<void> {
  logger.info(
    `Attempting to stop and remove container via dockerUtils: ${containerId}`
  );
  try {
    // Sanitize containerId
    const safeId = sanitizeContainerId(containerId);
    if (!safeId) throw new Error('Invalid containerId');
    // Kill and remove in one step. `docker stop` would wait 10s, because the
    // sandbox's PID 1 (`tail -f /dev/null`) ignores SIGTERM, and that delay can
    // outlast the time the MCP client gives us to shut down.
    await execFilePromise('docker', ['rm', '-f', safeId]);
    logger.info(
      `Successfully issued stop/remove commands for container: ${containerId}`
    );
  } catch (error) {
    // Log errors but don't throw
    logger.error(
      `Error during docker stop/remove commands for container ${containerId}`,
      typeof error === 'object' &&
        error !== null &&
        ('stderr' in error || 'message' in error)
        ? (error as { stderr?: string; message?: string }).stderr ||
            (error as { message: string }).message
        : String(error)
    );
  }
}

export type NodeExecResult = {
  output: string | null;
  error: Error | null;
  duration: number;
};

export function safeExecNodeInContainer({
  containerId,
  timeoutMs = getConfig().runScriptTimeoutMilliseconds,
  command = 'node index.js',
}: {
  containerId: string;
  timeoutMs?: number;
  command?: string;
}): NodeExecResult {
  const runStart = Date.now();
  // Sanitize command
  const safeCmd = sanitizeShellCommand(command);
  if (!safeCmd) {
    return { output: null, error: new Error('Invalid command'), duration: 0 };
  }
  try {
    const output = execFileSync(
      'docker',
      ['exec', containerId, '/bin/sh', '-c', safeCmd],
      { encoding: 'utf8', timeout: timeoutMs }
    );
    return { output, error: null, duration: Date.now() - runStart };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { output: null, error, duration: Date.now() - runStart };
  }
}

export const getContentFromError = (
  error: Error,
  telemetry: Record<string, unknown>
) => {
  return {
    content: [
      textContent(`Error during execution: ${error.message}`),
      textContent(`Telemetry:\n${JSON.stringify(telemetry, null, 2)}`),
    ],
  };
};
