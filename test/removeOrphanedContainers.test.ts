import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'child_process';
import * as dockerUtils from '../src/dockerUtils.ts';
import { removeOrphanedContainers } from '../src/containerUtils.ts';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));
vi.mock('../src/dockerUtils', () => ({
  forceStopContainer: vi.fn().mockResolvedValue(undefined),
}));

// A PID that is effectively guaranteed not to belong to a live process
const DEAD_PID = 2 ** 30;

function mockDockerPs(stdout: string) {
  vi.mocked(childProcess.execFile).mockImplementation(((
    _cmd: string,
    _args: string[],
    callback: (error: Error | null, result: { stdout: string }) => void
  ) => callback(null, { stdout })) as unknown as typeof childProcess.execFile);
}

describe('removeOrphanedContainers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes containers whose owner process is dead', async () => {
    mockDockerPs(`abc123 ${DEAD_PID}\n`);

    await removeOrphanedContainers();

    expect(dockerUtils.forceStopContainer).toHaveBeenCalledWith('abc123');
  });

  it('keeps containers owned by this or another live process', async () => {
    mockDockerPs(`mine ${process.pid}\nparent ${process.ppid}\n`);

    await removeOrphanedContainers();

    expect(dockerUtils.forceStopContainer).not.toHaveBeenCalled();
  });

  it('keeps containers without an owner PID label', async () => {
    mockDockerPs('legacy \n');

    await removeOrphanedContainers();

    expect(dockerUtils.forceStopContainer).not.toHaveBeenCalled();
  });

  it('does nothing when Docker is not running', async () => {
    vi.mocked(childProcess.execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      callback: (error: Error | null) => void
    ) =>
      callback(
        new Error('Cannot connect to the Docker daemon')
      )) as unknown as typeof childProcess.execFile);

    await expect(removeOrphanedContainers()).resolves.toBeUndefined();
    expect(dockerUtils.forceStopContainer).not.toHaveBeenCalled();
  });
});
